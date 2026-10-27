import { execFile } from "node:child_process"
import { lstat, readFile } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"
import parseDiff from "parse-diff"
import type { ChangedFile, Commit, NewPullRequest, PrMeta, PullRequest } from "@shared/types"

const run = promisify(execFile)

export async function git(repo: string, args: string[], timeout = 0) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND ?? "ssh -o BatchMode=yes" }
  const { stdout } = await run("git", args, { cwd: repo, env, timeout, maxBuffer: 100 * 1024 * 1024, windowsHide: true })
  return stdout
}

// Validates the path is a git work tree and returns its top level.
export async function resolveRepo(path: string) {
  if (!path) throw new Error("Pick a repository first")
  try {
    return (await git(path, ["rev-parse", "--show-toplevel"])).trim()
  } catch {
    throw new Error(`Not a git repository: ${path}`)
  }
}

// Refs end up in git and claude command lines, so keep them to plain ref characters.
export function assertRef(ref: string) {
  if (!/^[\w./-]+$/.test(ref) || ref.startsWith("-")) throw new Error(`Invalid branch name: ${ref}`)
  return ref
}

export async function currentBranch(repo: string) {
  return (await git(repo, ["rev-parse", "--abbrev-ref", "HEAD"])).trim()
}

const ok = (p: Promise<unknown>) => p.then(() => true, () => false)

// The remote's default branch (origin/HEAD), else "master".
export async function defaultBase(repo: string) {
  return git(repo, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]).then((s) => s.trim().replace(/^origin\//, "") || "master", () => "master")
}

// A stale local base makes commits pulled in by a rebase show up as PR changes; GitHub compares against the
// remote branch, so use the remote-tracking ref whenever it is ahead of (or equal to) the local one.
export async function resolveBase(repo: string, base: string) {
  assertRef(base)
  const upstream = await git(repo, ["rev-parse", "--abbrev-ref", `${base}@{upstream}`]).then((s) => s.trim(), () => `origin/${base}`)
  const remoteAhead = await ok(git(repo, ["merge-base", "--is-ancestor", base, upstream]))
  if (remoteAhead) return upstream
  // no local branch at all (e.g. only origin/master exists)
  if (!(await ok(git(repo, ["rev-parse", "--verify", "--quiet", base]))) && (await ok(git(repo, ["rev-parse", "--verify", "--quiet", upstream])))) return upstream
  return base
}

const DIFF = ["diff", "--no-color", "--no-ext-diff"]

// git diff never lists untracked files: diff each against /dev/null (exit code 1 = "differs", not an error).
// shortcut: capped at 200 files so a repo without a .gitignore can't flood the view.
async function untrackedDiff(repo: string) {
  const files = (await git(repo, ["ls-files", "--others", "--exclude-standard", "-z"])).split("\0").filter(Boolean).slice(0, 200)
  const omitted: ChangedFile[] = []
  const diffs = await Promise.all(files.map(async (f) => {
    // Generated files can contain millions of lines; bound them before git reads or parses their contents.
    const info = await lstat(join(repo, f)).catch(() => null)
    if (info && info.size > 1024 * 1024) {
      omitted.push({ from: "/dev/null", to: f, new: true, chunks: [], additions: 0, deletions: 0, omitted: "Diff omitted: untracked file exceeds the 1 MiB display limit." })
      return ""
    }
    return git(repo, [...DIFF, "--no-index", "--", "/dev/null", f]).catch((e: { stdout?: string }) => e.stdout ?? "")
  }))
  return { text: diffs.join(""), omitted: omitted.sort((a, b) => a.to!.localeCompare(b.to!)) }
}

// Changes since the merge-base, like GitHub's PR view, plus uncommitted and untracked work.
async function changesAgainst(repo: string, base: string) {
  const mergeBase = (await git(repo, ["merge-base", assertRef(base), "HEAD"])).trim()
  const [tracked, untracked] = await Promise.all([git(repo, [...DIFF, mergeBase]), untrackedDiff(repo)])
  return { text: tracked + untracked.text, omitted: untracked.omitted }
}

export async function diffAgainst(repo: string, base: string) {
  const diff = await changesAgainst(repo, base)
  return diff.text + diff.omitted.map((f) => `\n${JSON.stringify(f.to)}: ${f.omitted}\n`).join("")
}

// Work not committed yet: tracked changes against HEAD plus untracked files.
export async function uncommittedDiff(repo: string) {
  const [tracked, untracked] = await Promise.all([git(repo, [...DIFF, "HEAD"]), untrackedDiff(repo)])
  return [...parseDiff(tracked + untracked.text), ...untracked.omitted]
}

// Updates origin's copy of the base branch; never prompts for credentials, gives up after 30s.
async function fetchBase(repo: string, base: string) {
  const branch = assertRef(base).replace(/^origin\//, "")
  try {
    await git(repo, ["fetch", "--quiet", "origin", branch], 30_000)
  } catch (e) {
    const err = e as Error & { stderr?: string; killed?: boolean }
    if (err.killed) return "git fetch timed out"
    const lines = err.stderr?.trim().split("\n") ?? []
    return (lines.find((l) => l.startsWith("fatal:")) ?? lines[0] ?? err.message).replace(/^fatal:\s*/, "")
  }
}

// Diff of a single commit against its first parent (merge commits show what they brought in).
export async function commitDiff(repo: string, sha: string) {
  if (!/^[0-9a-f]{7,40}$/.test(sha)) throw new Error(`Invalid commit: ${sha}`)
  return parseDiff(await git(repo, [...DIFF, `${sha}^1`, sha]))
}

type GhPr = {
  number: number
  title: string
  body: string
  url: string
  author: { login: string; name?: string }
  commits: { authors: { email: string; login: string }[] }[]
}

// gh never prompts here; errors carry gh's own message instead of "Command failed: ...".
async function gh(repo: string, args: string[], timeout = 15_000) {
  try {
    const { stdout } = await run("gh", args, {
      cwd: repo, timeout, windowsHide: true, env: { ...process.env, GH_PROMPT_DISABLED: "1", GIT_TERMINAL_PROMPT: "0" },
    })
    return stdout
  } catch (e) {
    const err = e as Error & { stderr?: string; code?: string }
    if (err.code === "ENOENT") throw new Error("GitHub CLI (gh) is not installed")
    throw new Error(err.stderr?.trim() || err.message)
  }
}

// The GitHub PR for this branch, if gh is installed, logged in and finds one.
async function githubPr(repo: string, branch: string): Promise<GhPr | null> {
  return gh(repo, ["pr", "view", branch, "--json", "number,title,body,url,author,commits"]).then(JSON.parse, () => null)
}

const TEMPLATES = [".github/pull_request_template.md", ".github/PULL_REQUEST_TEMPLATE.md", "pull_request_template.md", "docs/pull_request_template.md"]

export const readPrTemplate = (repo: string) => Promise.any(TEMPLATES.map((t) => readFile(join(repo, t), "utf8"))).catch(() => null)

// What the "Open a pull request" form offers: labels, people, milestones and the repo's PR template.
// Each lookup is optional: a repo without labels or a token without collaborator access just offers less.
export async function prMeta(repo: string): Promise<PrMeta> {
  const list = (args: string[]) => gh(repo, args).then((s) => s.split("\n").filter(Boolean), () => [])
  const [labels, users, milestones, me, template] = await Promise.all([
    gh(repo, ["label", "list", "--limit", "500", "--json", "name,color"]).then(JSON.parse, () => []),
    list(["api", "--paginate", "repos/{owner}/{repo}/collaborators", "--jq", ".[].login"]),
    list(["api", "repos/{owner}/{repo}/milestones", "--jq", ".[].title"]),
    gh(repo, ["api", "user", "--jq", ".login"]).then((s) => s.trim() || null, () => null),
    readPrTemplate(repo),
  ])
  return { labels, users, milestones, me, template }
}

// Pushes the branch (never forced) and opens the PR with gh; returns its URL.
export async function createPullRequest(repo: string, p: NewPullRequest) {
  const title = String(p.title ?? "").trim()
  if (!title) throw new Error("Title is required")
  const base = assertRef(String(p.base ?? "").replace(/^origin\//, ""))
  const branch = await currentBranch(repo)
  if (branch === "HEAD") throw new Error("Check out a branch first (HEAD is detached)")
  if (branch === base) throw new Error(`The branch and the base are both ${base}`)
  // "--flag=value" so a value starting with "-" can't turn into a flag
  const many = (flag: string, xs: unknown) => (Array.isArray(xs) ? xs : []).map(String).filter((x) => x.trim()).map((x) => `--${flag}=${x.trim()}`)
  try {
    await git(repo, ["push", "--quiet", "-u", "origin", "HEAD"], 120_000)
  } catch (e) {
    throw new Error(`git push failed: ${(e as { stderr?: string }).stderr?.trim() || (e as Error).message}`)
  }
  const out = await gh(repo, [
    "pr", "create", `--base=${base}`, `--head=${branch}`, `--title=${title}`, `--body=${String(p.body ?? "")}`,
    ...(p.draft ? ["--draft"] : []),
    ...many("reviewer", p.reviewers), ...many("assignee", p.assignees), ...many("label", p.labels),
    ...(p.milestone ? [`--milestone=${String(p.milestone)}`] : []),
  ], 60_000)
  return out.trim().split("\n").at(-1)!
}

const avatarOf = (login: string) => `https://github.com/${encodeURIComponent(login)}.png?size=80`

// GitHub login for a commit email: from the PR's commit authors, else a users.noreply.github.com address.
export function loginFor(email: string, known: Map<string, string>) {
  return known.get(email.toLowerCase()) ?? /^(?:\d+\+)?([\w-]+)@users\.noreply\.github\.com$/i.exec(email)?.[1] ?? null
}

const SEP = "\x1f", END = "\x1e"

export async function getPullRequest(repo: string, wanted: string, fetch = false): Promise<PullRequest> {
  const fetchError = fetch ? await fetchBase(repo, wanted) : undefined
  const base = await resolveBase(repo, wanted)
  const branch = await currentBranch(repo)
  const [diff, uncommitted, log, gh] = await Promise.all([
    changesAgainst(repo, base),
    uncommittedDiff(repo),
    git(repo, ["log", `--format=%h${SEP}%an${SEP}%ae${SEP}%aI${SEP}%s${SEP}%b${END}`, `${assertRef(base)}..HEAD`]),
    githubPr(repo, branch),
  ])
  const known = new Map(gh?.commits.flatMap((c) => c.authors.map((a) => [a.email.toLowerCase(), a.login] as const)) ?? [])
  const commits: Commit[] = log
    .split(END)
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      const [sha, author, email, date, subject, body] = r.split(SEP)
      const login = loginFor(email, known)
      return { sha, author, email, date, subject, body: body.trim(), avatar: login ? avatarOf(login) : null }
    })
  // git log is newest first; like GitHub, a PR without its own title takes the oldest commit's message
  const first = commits.at(-1)
  return {
    repo, branch, base,
    title: gh?.title ?? first?.subject ?? branch,
    body: gh?.body ?? (commits.length === 1 ? first!.body : ""),
    url: gh?.url ?? null,
    number: gh?.number ?? null,
    author: gh ? { name: gh.author.login, avatar: avatarOf(gh.author.login) } : { name: first?.author ?? "", avatar: first?.avatar ?? null },
    commits, files: [...parseDiff(diff.text), ...diff.omitted], uncommitted, fetchError,
  }
}

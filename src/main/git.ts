import { execFile } from "node:child_process"
import { promisify } from "node:util"
import parseDiff from "parse-diff"
import type { Commit, PullRequest } from "@shared/types"

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

export const diffAgainst = (repo: string, base: string) =>
  // three-dot diff = changes since the merge-base, like GitHub's PR view
  git(repo, ["diff", "--no-color", "--no-ext-diff", `${assertRef(base)}...HEAD`])

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
  return parseDiff(await git(repo, ["diff", "--no-color", "--no-ext-diff", `${sha}^1`, sha]))
}

type GhPr = {
  number: number
  title: string
  body: string
  url: string
  author: { login: string; name?: string }
  commits: { authors: { email: string; login: string }[] }[]
}

// The GitHub PR for this branch, if gh is installed, logged in and finds one. Never prompts.
async function githubPr(repo: string, branch: string): Promise<GhPr | null> {
  try {
    const { stdout } = await run("gh", ["pr", "view", branch, "--json", "number,title,body,url,author,commits"], {
      cwd: repo, timeout: 15_000, windowsHide: true, env: { ...process.env, GH_PROMPT_DISABLED: "1", GIT_TERMINAL_PROMPT: "0" },
    })
    return JSON.parse(stdout)
  } catch {
    return null
  }
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
  const [diff, log, gh] = await Promise.all([
    diffAgainst(repo, base),
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
    commits, files: parseDiff(diff), fetchError,
  }
}

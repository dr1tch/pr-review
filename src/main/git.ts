import { execFile } from "node:child_process"
import { promisify } from "node:util"
import parseDiff from "parse-diff"
import type { PullRequest } from "@shared/types"

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

export async function getPullRequest(repo: string, wanted: string, fetch = false): Promise<PullRequest> {
  const fetchError = fetch ? await fetchBase(repo, wanted) : undefined
  const base = await resolveBase(repo, wanted)
  const [branch, diff, log] = await Promise.all([
    currentBranch(repo),
    diffAgainst(repo, base),
    git(repo, ["log", "--format=%h%x09%an%x09%aI%x09%s", `${assertRef(base)}..HEAD`]),
  ])
  const commits = log
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [sha, author, date, ...rest] = l.split("\t")
      return { sha, author, date, subject: rest.join("\t") }
    })
  return { repo, branch, base, commits, files: parseDiff(diff), fetchError }
}

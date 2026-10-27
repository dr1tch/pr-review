import { type ChildProcess, spawn, spawnSync } from "node:child_process"
import { readdir, readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { frontmatter } from "@shared/frontmatter"
import { parseReview } from "@shared/review-parse"
import { BUILTIN_REVIEWERS } from "@shared/builtin-reviewers"
import { BUILTIN_INSTRUCTIONS } from "./builtin-reviewers"
import type { AgentRun, Reviewer } from "@shared/types"
import { addComments, finishRun, insertRun } from "./db"

const TIMEOUT_MS = 30 * 60 * 1000
const MAX_DIFF = 200_000
// read-only; Skill/Agent let skills load and fan out to sub-agents under the same limits
// No Bash at all: even git can write files (git diff --output=...), and the diff is already in the prompt.
const READ_ONLY_TOOLS = "Read,Grep,Glob,Skill,Agent,Task"
const isWin = process.platform === "win32"

const NAME = /^[\w.:-]+$/ // passed on the command line (through a shell on Windows), so only plain names

async function readMd(file: string) {
  return frontmatter(await readFile(file, "utf8").catch(() => ""))
}

async function agentsIn(dir: string, source: string, prefix = ""): Promise<Reviewer[]> {
  const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith(".md"))
  return Promise.all(files.map(async (f) => {
    const fm = await readMd(join(dir, f))
    return { name: prefix + (fm.name || f.slice(0, -3)), description: fm.description ?? "", kind: "agent" as const, source }
  }))
}

async function skillsIn(dir: string, source: string, prefix = ""): Promise<Reviewer[]> {
  const dirs = await readdir(dir).catch(() => [] as string[])
  const found = await Promise.all(dirs.map(async (d) => {
    const fm = await readMd(join(dir, d, "SKILL.md"))
    if (!Object.keys(fm).length) return null
    return { name: prefix + (fm.name || d), description: fm.description ?? "", kind: "skill" as const, source }
  }))
  return found.filter((r) => r !== null)
}

type Install = { scope: string; installPath: string; projectPath?: string }

const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8").catch(() => "{}"))

// Enabled plugins' install paths for this repo, from Claude Code's plugin registry and settings
// (project settings override user settings; a project-scoped install beats the user-scoped one).
async function enabledPlugins(repo: string): Promise<{ name: string; path: string }[]> {
  try {
    const home = join(homedir(), ".claude")
    const installed: Record<string, Install[]> = (await readJson(join(home, "plugins", "installed_plugins.json"))).plugins ?? {}
    const enabled = Object.assign(
      {},
      ...(await Promise.all(
        [join(home, "settings.json"), join(repo, ".claude", "settings.json"), join(repo, ".claude", "settings.local.json")].map(async (f) => (await readJson(f)).enabledPlugins),
      )),
    )
    return Object.entries(installed).flatMap(([key, installs]) => {
      if (enabled[key] !== true) return []
      const install = installs.find((i) => i.projectPath === repo) ?? installs.find((i) => i.scope === "user")
      return install ? [{ name: key.split("@")[0], path: install.installPath }] : []
    })
  } catch {
    return []
  }
}

// Same discovery as Claude Code: user and project agents/skills, plus those of enabled plugins (namespaced).
export async function listReviewers(repo: string): Promise<Reviewer[]> {
  const home = join(homedir(), ".claude")
  const plugins = await enabledPlugins(repo)
  const groups = await Promise.all([
    agentsIn(join(home, "agents"), "user"),
    skillsIn(join(home, "skills"), "user"),
    ...plugins.flatMap((p) => [agentsIn(join(p.path, "agents"), p.name, `${p.name}:`), skillsIn(join(p.path, "skills"), p.name, `${p.name}:`)]),
    agentsIn(join(repo, ".claude", "agents"), "project"),
    skillsIn(join(repo, ".claude", "skills"), "project"),
  ])
  const byKey = new Map<string, Reviewer>() // later (project) entries win, as in Claude Code
  for (const r of [...groups.flat(), ...BUILTIN_REVIEWERS]) {
    if (!NAME.test(r.name)) continue
    byKey.set(`${r.kind}:${r.name}`, { ...r, description: r.description.split("\n")[0].slice(0, 300) })
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name))
}

const live = new Map<string, () => void>() // run id -> cancel

// Stops a running review; its process tree is killed and the run is marked cancelled.
export function cancelReview(id: string) {
  live.get(id)?.()
}

function killTree(child: ChildProcess) {
  // on Windows the shell wrapper would survive a plain kill, leaving claude running
  if (isWin && child.pid) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true })
  else child.kill()
}

const OUTPUT_FORMAT = `End your reply with ONE fenced \`\`\`json block (nothing after it) of this shape:
{"summary": "overall verdict, markdown",
 "findings": [{"file": "repo-relative path as in the diff", "line": <line number in the NEW file, or null for file-level>,
   "severity": "critical" | "major" | "minor" | "nit", "body": "the review comment, markdown"}]}`

export function startReview(repo: string, branch: string, base: string, reviewer: Reviewer, diff: string, onFinish: () => void): AgentRun {
  const agent = reviewer.name
  const run: AgentRun = {
    id: crypto.randomUUID(), agent, kind: reviewer.kind, repo, branch, status: "running",
    startedAt: new Date().toISOString(), finishedAt: null, error: null, costUsd: null,
  }
  insertRun(run)

  const truncated = diff.length > MAX_DIFF
  const builtin = reviewer.source === "builtin" ? BUILTIN_INSTRUCTIONS[agent] : undefined
  // Diff goes in the prompt so agents without a shell can still review it; stdin avoids argv size limits.
  const how = builtin ? "Review" : reviewer.kind === "skill"
    ? `Invoke the "${agent}" skill with the Skill tool and apply it to this pull request: review`
    : "Review"
  const prompt = `${how} the pull request for branch "${branch}" against base "${base}" in this repository. ` +
    `Read surrounding code as needed. Do not modify any files.\n\n${builtin ?? ""}\n\n${OUTPUT_FORMAT}\n\n` +
    `Diff (\`git diff $(git merge-base ${base} HEAD)\`, uncommitted and untracked work included${truncated ? ", truncated: read the remaining files yourself" : ""}):\n` +
    "```diff\n" + diff.slice(0, MAX_DIFF) + "\n```"
  const child = spawn(
    "claude",
    [
      "-p",
      ...(reviewer.kind === "agent" && !builtin ? ["--agent", agent] : []),
      ...(builtin ? ["--tools", "Read,Grep,Glob", "--disable-slash-commands", "--strict-mcp-config"] : []),
      "--output-format", "json",
      // read-only: no edits, no shell
      "--allowedTools", isWin ? `"${READ_ONLY_TOOLS}"` : READ_ONLY_TOOLS,
      // the user's settings may default to bypassPermissions, which ignores the allow-list
      "--permission-mode", "default",
      "--disallowedTools", "Edit,Write,NotebookEdit,Bash",
    ],
    // shell on Windows so the npm-installed claude.cmd resolves; args are validated plain names
    { cwd: repo, stdio: ["pipe", "pipe", "pipe"], shell: isWin, windowsHide: true },
  )
  child.stdin.end(prompt)
  let out = ""
  let err = ""
  child.stdout.on("data", (d) => (out += d))
  child.stderr.on("data", (d) => (err += d))
  const timer = setTimeout(() => killTree(child), TIMEOUT_MS)

  let settled = false
  const settle = (f: Parameters<typeof finishRun>[1]) => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    live.delete(run.id)
    finishRun(run.id, f)
    onFinish()
  }
  live.set(run.id, () => {
    settle({ status: "cancelled", error: "Cancelled" })
    killTree(child)
  })
  child.on("error", (e) =>
    settle({ status: "error", error: (e as NodeJS.ErrnoException).code === "ENOENT" ? "claude CLI not found on PATH" : e.message }))
  child.on("close", (code) => {
    try {
      const parsed = JSON.parse(out)
      const res = Array.isArray(parsed) ? parsed.at(-1) : parsed
      if (res?.is_error || typeof res?.result !== "string") throw new Error(res?.result || err || `claude exited with ${code}`)
      const r = parseReview(res.result)
      addComments(repo, branch, agent, [
        { file: null, side: null, line: null, severity: null, body: r.summary },
        ...r.findings.map((f) => ({ file: f.file, side: f.line == null ? null : ("new" as const), line: f.line, severity: f.severity, body: f.body })),
      ])
      settle({ status: "done", costUsd: res.total_cost_usd, output: res.result })
    } catch (e) {
      settle({ status: "error", error: (e instanceof Error ? e.message : String(e)).slice(0, 1000) || err.slice(0, 1000), output: out.slice(0, 100_000) })
    }
  })
  return run
}

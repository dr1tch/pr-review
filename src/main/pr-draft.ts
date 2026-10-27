import { execFile } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { parsePrDraft, prDraftFailure } from "../shared/pr-draft"
import { assertRef, currentBranch, git, readPrTemplate, resolveBase } from "./git"
import skill from "./skills/pr-draft/SKILL.md?raw"

const run = promisify(execFile)
const schema = JSON.stringify({ type: "object", properties: { title: { type: "string", maxLength: 70 }, body: { type: "string" } }, required: ["title", "body"], additionalProperties: false })

export async function generatePrDraft(repo: string, base: string, branch: string) {
  assertRef(base)
  assertRef(branch)
  if (await currentBranch(repo) !== branch) throw new Error("The branch changed. Reload before generating.")
  const ref = await resolveBase(repo, base)
  const head = (await git(repo, ["rev-parse", "HEAD"])).trim()
  const range = `${assertRef(ref)}...${head}`
  const [diff, subjects, template] = await Promise.all([
    git(repo, ["diff", "--no-color", "--no-ext-diff", "--no-textconv", range]),
    git(repo, ["log", "--format=%s", `${assertRef(ref)}..${head}`]),
    readPrTemplate(repo),
  ])
  if (!diff.trim()) throw new Error("No committed changes against this base to describe.")
  if (diff.length + subjects.length + (template?.length ?? 0) > 200_000) throw new Error("The committed diff is too large to describe in one request. Split the changes first.")
  // A neutral working directory keeps repository skills and instructions out of this drafting session.
  const cwd = await mkdtemp(join(tmpdir(), "pr-review-draft-"))
  try {
    const child = run("claude", ["-p", "--output-format", "json", "--json-schema", schema,
      "--tools", "", "--disable-slash-commands", "--strict-mcp-config", "--setting-sources", "",
      "--no-session-persistence", "--system-prompt", skill], { cwd, timeout: 180_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true })
    child.child.stdin?.on("error", () => {}) // An early CLI exit is reported by the process promise.
    child.child.stdin?.end(JSON.stringify({ branch, base, commits: subjects, template, diff }))
    const { stdout } = await child
    if (await currentBranch(repo) !== branch || (await git(repo, ["rev-parse", "HEAD"])).trim() !== head) throw new Error("The branch changed during generation. Generate again for the current changes.")
    return parsePrDraft(stdout)
  } catch (e) {
    throw prDraftFailure(e)
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
}

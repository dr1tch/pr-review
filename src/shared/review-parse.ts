import type { Severity } from "./types"

type Finding = { file: string; line: number | null; severity: Severity | null; body: string }
export type Result = { summary: string; findings: Finding[] }

const SEVERITIES = new Set(["critical", "major", "minor", "nit"])

// Agents differ in tools and output discipline, so we parse the last json fence and fall back to plain text.
export function parseReview(text: string): Result {
  const fences = [...text.matchAll(/```json\s*\n([\s\S]*?)```/g)]
  const last = fences.at(-1)
  if (last) {
    try {
      const r = JSON.parse(last[1])
      const findings: Finding[] = (Array.isArray(r.findings) ? r.findings : [])
        .filter((f: Finding) => f && typeof f.file === "string" && typeof f.body === "string")
        .map((f: Finding) => ({
          file: f.file.replace(/^[ab]\//, ""),
          line: Number.isInteger(f.line) ? f.line : null,
          severity: SEVERITIES.has(f.severity as string) ? f.severity : null,
          body: f.body,
        }))
      const summary = typeof r.summary === "string" && r.summary.trim() ? r.summary : text.slice(0, last.index).trim()
      return { summary, findings }
    } catch {}
  }
  return { summary: text.trim(), findings: [] }
}

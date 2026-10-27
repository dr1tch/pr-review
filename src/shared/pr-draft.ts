export type PrDraft = { title: string; body: string }

function responseFrom(output: string) {
  const parsed = JSON.parse(output)
  return Array.isArray(parsed) ? parsed.at(-1) : parsed
}

export function normalizePrBody(body: string) {
  let category = false
  let fenced = false
  return body.trim().split("\n").map((line) => {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
    if (fenced) return line
    if (/^#{1,6}\s/.test(line)) {
      category = false
      return line.replace(/\s*\((?:if applicable|optional)\)/gi, "")
    }
    if (/^[*+-] \*\*[^*]+\*\*\s*$/.test(line)) category = true
    else if (/^[*+-] \[[ xX]\]/.test(line)) category = false
    else if (category && /^[*+-] /.test(line)) return `  ${line}`
    return line
  }).join("\n")
}

export function prDraftFailure(error: unknown): Error {
  const e = error as { code?: string; killed?: boolean; stdout?: string; stderr?: string; message?: string }
  if (e?.code === "ENOENT") return new Error("claude CLI not found on PATH")
  if (e?.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") return new Error("Claude's response was too large. Try again with a smaller change.")
  if (e?.killed) return new Error("PR generation timed out. Try again.")
  if (typeof e?.stdout === "string") {
    try {
      const r = responseFrom(e.stdout)
      if (r?.is_error && typeof r.result === "string" && r.result.trim()) return new Error(r.result.trim().slice(0, 500))
    } catch {}
    const detail = e.stderr?.trim()
    return new Error(detail ? `Claude could not generate a PR draft: ${detail.slice(0, 500)}` : "Claude could not generate a PR draft. Try again and check that the Claude CLI is signed in.")
  }
  return error instanceof Error ? error : new Error("Claude could not generate a PR draft. Try again.")
}

export function parsePrDraft(output: string): PrDraft {
  const response = responseFrom(output)
  if (!response || typeof response !== "object") throw new Error("Claude returned an invalid PR draft")
  if (response.is_error) throw new Error("Claude could not generate a PR draft")
  const draft = response.structured_output ?? JSON.parse(response.result)
  if (typeof draft?.title !== "string" || !draft.title.trim() || draft.title.trim().length > 70 ||
      typeof draft?.body !== "string" || !draft.body.trim()) {
    throw new Error("Claude returned an invalid PR title or description. Try again.")
  }
  return { title: draft.title.trim(), body: normalizePrBody(draft.body) }
}

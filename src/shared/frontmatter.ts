// Minimal YAML frontmatter reader for agent/skill .md files: top-level scalar keys, including | and > blocks.
export function frontmatter(md: string): Record<string, string> {
  const block = md.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---/)?.[1] ?? ""
  const out: Record<string, string> = {}
  const lines = block.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([\w-]+):\s*(.*)$/)
    if (!m) continue
    let value = m[2].trim()
    if (/^[|>][-+]?$/.test(value) || value === "") {
      const body: string[] = []
      while (i + 1 < lines.length && /^\s+\S|^\s*$/.test(lines[i + 1])) body.push(lines[++i].trim())
      value = body.join(value.startsWith("|") ? "\n" : " ").trim()
    }
    out[m[1]] = value.replace(/^(["'])([\s\S]*)\1$/, "$2")
  }
  return out
}

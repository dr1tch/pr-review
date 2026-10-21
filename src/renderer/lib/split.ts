import type parseDiff from "parse-diff"

export type Cell = { no: number; text: string; kind: "normal" | "add" | "del" }
export type Row = { hunk: string } | { left?: Cell; right?: Cell }

// Turns a parsed file into side-by-side rows: deletions pair up with the additions that follow them.
export function splitRows(file: parseDiff.File): Row[] {
  const rows: Row[] = []
  for (const chunk of file.chunks) {
    rows.push({ hunk: chunk.content })
    let dels: Cell[] = []
    let adds: Cell[] = []
    const flush = () => {
      for (let i = 0; i < Math.max(dels.length, adds.length); i++) rows.push({ left: dels[i], right: adds[i] })
      dels = []
      adds = []
    }
    for (const c of chunk.changes) {
      if (c.content.startsWith("\\")) continue // "\ No newline at end of file" marker
      const text = c.content.slice(1)
      if (c.type === "del") dels.push({ no: c.ln, text, kind: "del" })
      else if (c.type === "add") adds.push({ no: c.ln, text, kind: "add" })
      else {
        flush()
        rows.push({ left: { no: c.ln1, text, kind: "normal" }, right: { no: c.ln2, text, kind: "normal" } })
      }
    }
    flush()
  }
  return rows
}

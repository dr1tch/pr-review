// Splits highlighted HTML into one string per source line, closing and reopening spans that cross a newline.
export function splitHtmlLines(html: string): string[] {
  const out: string[] = []
  const open: string[] = []
  let cur = ""
  for (const tok of html.split(/(<span[^>]*>|<\/span>|\n)/)) {
    if (tok === "\n") {
      out.push(cur + "</span>".repeat(open.length))
      cur = open.join("")
    } else if (tok.startsWith("<span")) {
      open.push(tok)
      cur += tok
    } else if (tok === "</span>") {
      open.pop()
      cur += tok
    } else cur += tok
  }
  out.push(cur + "</span>".repeat(open.length))
  return out
}

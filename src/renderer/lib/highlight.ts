import hljs from "highlight.js"
import { splitHtmlLines } from "./html-lines"

const ALIASES: Record<string, string> = { vue: "xml", svelte: "xml", heex: "xml", eex: "xml", leex: "xml" }

export function languageFor(path: string) {
  const base = path.split("/").pop() ?? ""
  const ext = base.includes(".") ? base.split(".").pop()!.toLowerCase() : base.toLowerCase()
  const lang = ALIASES[ext] ?? ext
  return hljs.getLanguage(lang) ? lang : undefined
}

// Highlights lines as one block so multi-line comments and strings keep their colour; returns HTML per line.
export function highlightLines(lines: string[], lang: string | undefined): string[] {
  if (!lang || !lines.length) return lines.map(escape)
  return splitHtmlLines(hljs.highlight(lines.join("\n"), { language: lang, ignoreIllegals: true }).value)
}

export function highlightCode(code: string, lang: string | undefined) {
  return lang && hljs.getLanguage(lang) ? hljs.highlight(code, { language: lang, ignoreIllegals: true }).value : escape(code)
}

function escape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

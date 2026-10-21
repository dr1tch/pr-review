import hljs from "highlight.js"
import { splitHtmlLines } from "./html-lines"

const ALIASES: Record<string, string> = { heex: "xml", eex: "xml", leex: "xml" }
// Single-file components mix markup, script and style: a hunk inside <script> has no tag to tell the HTML
// highlighter, so each chunk's language is detected instead.
const MIXED: Record<string, string[]> = {
  vue: ["xml", "typescript", "javascript", "scss", "css"],
  svelte: ["xml", "typescript", "javascript", "scss", "css"],
}

export function languageFor(path: string) {
  const base = path.split("/").pop() ?? ""
  const ext = base.includes(".") ? base.split(".").pop()!.toLowerCase() : base.toLowerCase()
  if (MIXED[ext]) return ext
  const lang = ALIASES[ext] ?? ext
  return hljs.getLanguage(lang) ? lang : undefined
}

function toHtml(code: string, lang: string) {
  return MIXED[lang] ? hljs.highlightAuto(code, MIXED[lang]).value : hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
}

// Highlights lines as one block so multi-line comments and strings keep their colour; returns HTML per line.
export function highlightLines(lines: string[], lang: string | undefined): string[] {
  if (!lang || !lines.length) return lines.map(escape)
  return splitHtmlLines(toHtml(lines.join("\n"), lang))
}

export function highlightCode(code: string, lang: string | undefined) {
  return lang && (MIXED[lang] || hljs.getLanguage(lang)) ? toHtml(code, lang) : escape(code)
}

function escape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

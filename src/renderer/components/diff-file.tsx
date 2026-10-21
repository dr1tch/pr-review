import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, ChevronRight, Plus } from "lucide-react"
import type parseDiff from "parse-diff"
import { Composer, Thread } from "@/components/comments"
import { highlightLines, languageFor } from "@/lib/highlight"
import { splitRows, type Cell, type Row } from "@/lib/split"
import { cn } from "@/lib/utils"
import type { ChangedFile, ReviewComment, Side } from "@shared/types"

export function fileName(f: parseDiff.File) {
  return (f.to && f.to !== "/dev/null" ? f.to : f.from) ?? "unknown"
}

export function fileStatus(f: parseDiff.File) {
  return f.new ? "added" : f.deleted ? "deleted" : f.from !== f.to ? "renamed" : "modified"
}

// GitHub's five-square diffstat.
export function DiffStat({ add, del }: { add: number; del: number }) {
  const total = add + del
  const green = total ? Math.round((add / total) * 5) : 0
  const red = total ? Math.min(5 - green, Math.round((del / total) * 5)) : 0
  return (
    <span className="flex items-center gap-2 font-mono text-xs">
      <span className="text-success">+{add}</span>
      <span className="text-danger">−{del}</span>
      <span className="flex gap-px" aria-hidden>
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className={cn("size-2 rounded-[1px]", i < green ? "bg-success" : i < green + red ? "bg-danger" : "bg-counter")} />
        ))}
      </span>
    </span>
  )
}

type Props = {
  id: string
  file: ChangedFile
  comments: ReviewComment[]
  onAdd?: (anchor: { side: Side | null; line: number | null }, body: string) => Promise<void> // omitted = read-only
  onDelete: (id: string) => void
}

const key = (side: Side, line: number) => `${side}:${line}`

export function DiffFile(props: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    // Hidden repositories and distant files must not build or highlight their diff tables.
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      setReady(true)
      observer.disconnect()
    }, { rootMargin: "600px 0px" })
    observer.observe(ref.current!)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} id={props.id} className="scroll-mt-[57px]">
      {ready ? <RenderedDiffFile {...props} /> : (
        <div className="rounded-md border bg-muted p-4 text-muted-foreground" style={{ minHeight: 70 + props.file.chunks.reduce((n, c) => n + c.changes.length * 20 + 28, 0) }}>
          {fileName(props.file)}
        </div>
      )}
    </div>
  )
}

function RenderedDiffFile({ file, comments, onAdd, onDelete }: Props) {
  const name = fileName(file)
  const rows = useMemo(() => splitRows(file), [file])
  const html = useMemo(() => {
    const lang = languageFor(name)
    const map = new Map<string, string>()
    // per hunk: hunks are separate fragments, so a string or comment left open in one can't colour the next
    const hunks: Row[][] = []
    for (const r of rows) if ("hunk" in r) hunks.push([]); else hunks.at(-1)?.push(r)
    for (const hunk of hunks) {
      for (const side of ["old", "new"] as const) {
        const cells = hunk.flatMap((r) => ("hunk" in r ? [] : (side === "old" ? r.left : r.right) ?? []))
        highlightLines(cells.map((c) => c.text), lang).forEach((h, i) => map.set(key(side, cells[i].no), h))
      }
    }
    return map
  }, [rows, name])
  const [open, setOpen] = useState(true)
  const [draft, setDraft] = useState<string | null>(null)

  // Comments anchored to a visible line render inline; the rest (file-level / outside the diff) go on top.
  const { byLine, loose } = useMemo(() => {
    const visible = new Set<string>()
    for (const r of rows) {
      if ("hunk" in r) continue
      if (r.left) visible.add(key("old", r.left.no))
      if (r.right) visible.add(key("new", r.right.no))
    }
    const byLine = new Map<string, ReviewComment[]>()
    const loose: ReviewComment[] = []
    for (const c of comments) {
      const k = c.side && c.line != null ? key(c.side, c.line) : ""
      if (visible.has(k)) byLine.set(k, [...(byLine.get(k) ?? []), c])
      else loose.push(c)
    }
    return { byLine, loose }
  }, [rows, comments])

  const status = fileStatus(file)

  const lineCell = (cell: Cell | undefined, side: Side) => {
    const bg = cell?.kind === "add" ? "bg-diff-add" : cell?.kind === "del" ? "bg-diff-del" : !cell ? "bg-diff-empty" : ""
    const numBg = cell?.kind === "add" ? "bg-diff-add-num" : cell?.kind === "del" ? "bg-diff-del-num" : !cell ? "bg-diff-empty" : ""
    return (
      <>
        <td className={cn("group/num relative px-2 text-right align-top text-muted-foreground select-none", numBg)}>
          {cell && (
            <>
              {onAdd && <button
                type="button"
                aria-label={`Comment on ${side === "old" ? "old" : "new"} line ${cell.no}`}
                onClick={() => setDraft(key(side, cell.no))}
                className="absolute top-0 -right-2.5 z-[1] flex size-5 items-center justify-center rounded-md bg-ring text-white opacity-0 group-hover/num:opacity-100 focus-visible:opacity-100"
              >
                <Plus className="size-3.5" />
              </button>}
              {cell.no}
            </>
          )}
        </td>
        <td className={cn("px-2.5 align-top whitespace-pre-wrap break-all", bg, side === "old" && "border-r")}>
          {cell && (
            <>
              <span className="mr-1.5 text-muted-foreground select-none">{cell.kind === "add" ? "+" : cell.kind === "del" ? "-" : " "}</span>
              <span dangerouslySetInnerHTML={{ __html: html.get(key(side, cell.no)) ?? "" }} />
            </>
          )}
        </td>
      </>
    )
  }

  const threadRow = (k: string) => {
    const list = byLine.get(k) ?? []
    const drafting = draft === k
    if (!list.length && !drafting) return null
    const [side, line] = k.split(":")
    return (
      <tr key={`t-${k}`}>
        <td colSpan={4} className="border-y bg-muted/60 px-3">
          <Thread
            comments={list}
            onDelete={onDelete}
            composer={
              drafting ? (
                <div className="p-2">
                  <Composer
                    submitLabel="Add single comment"
                    onCancel={() => setDraft(null)}
                    onSubmit={async (body) => {
                      await onAdd!({ side: side as Side, line: Number(line) }, body)
                      setDraft(null)
                    }}
                  />
                </div>
              ) : undefined
            }
          />
        </td>
      </tr>
    )
  }

  return (
    <section className="rounded-md border">
      <header className="sticky top-[45px] z-10 flex items-center gap-2 rounded-t-md border-b bg-muted px-2 py-1.5">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? "Collapse file" : "Expand file"} className="rounded-md p-1 text-muted-foreground hover:bg-accent">
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <DiffStat add={file.additions} del={file.deletions} />
        <span className="min-w-0 truncate font-mono text-xs font-semibold" title={name}>
          {status === "renamed" ? `${file.from} → ${file.to}` : name}
        </span>
        {status !== "modified" && <span className="rounded-full border px-2 text-xs leading-[18px] text-muted-foreground">{status}</span>}
      </header>
      {open && (
        <>
          {loose.length > 0 && (
            <div className="border-b bg-muted/60 px-3">
              <Thread comments={loose} onDelete={onDelete} />
            </div>
          )}
          {rows.length === 0 ? (
            <p className="p-4 text-muted-foreground">{file.omitted ?? "Binary file or no textual changes."}</p>
          ) : (
            <div className="overflow-x-auto rounded-b-md">
              <table className="w-full table-fixed border-collapse font-mono text-xs leading-5">
                <colgroup>
                  <col className="w-[52px]" />
                  <col />
                  <col className="w-[52px]" />
                  <col />
                </colgroup>
                <tbody>
                  {rows.map((r, i) =>
                    "hunk" in r ? (
                      <tr key={i}>
                        <td className="bg-diff-hunk-num" />
                        <td colSpan={3} className="bg-diff-hunk px-2.5 py-1 text-muted-foreground">{r.hunk}</td>
                      </tr>
                    ) : (
                      <Fragment key={i}>
                        <tr>
                          {lineCell(r.left, "old")}
                          {lineCell(r.right, "new")}
                        </tr>
                        {r.left && r.left.kind !== "normal" && threadRow(key("old", r.left.no))}
                        {r.right && threadRow(key("new", r.right.no))}
                        {r.left?.kind === "normal" && threadRow(key("old", r.left.no))}
                      </Fragment>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}

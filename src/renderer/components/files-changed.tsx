import { useMemo, useState } from "react"
import { ChevronDown, ChevronRight, FileDiff, FileMinus, FilePlus, Folder, FolderOpen, MessageSquare, Search } from "lucide-react"
import type parseDiff from "parse-diff"
import { DiffFile, DiffStat, fileName, fileStatus } from "@/components/diff-file"
import { Input } from "@/components/ui/input"
import { buildTree, type TreeNode } from "@/lib/file-tree"
import { cn } from "@/lib/utils"
import type { ReviewComment, Side } from "@shared/types"

type Props = {
  files: parseDiff.File[]
  comments: ReviewComment[]
  onAdd?: (file: string, anchor: { side: Side | null; line: number | null }, body: string) => Promise<void> // omitted = read-only
  onDelete: (id: string) => void
  toolbar?: React.ReactNode
}

const STATUS_ICON = {
  added: <FilePlus className="size-4 text-success" />,
  deleted: <FileMinus className="size-4 text-danger" />,
  renamed: <FileDiff className="size-4 text-attention" />,
  modified: <FileDiff className="size-4 text-attention" />,
}

export function FilesChanged({ files, comments, onAdd, onDelete, toolbar }: Props) {
  const [filter, setFilter] = useState("")
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<string | null>(null)

  const shown = useMemo(() => files.filter((f) => fileName(f).toLowerCase().includes(filter.toLowerCase())), [files, filter])
  const tree = useMemo(() => buildTree(shown, fileName), [shown])
  const countFor = (name: string) => comments.filter((c) => c.file === name).length
  const additions = files.reduce((n, f) => n + f.additions, 0)
  const deletions = files.reduce((n, f) => n + f.deletions, 0)

  const toggle = (path: string) =>
    setCollapsed((s) => {
      const n = new Set(s)
      if (n.has(path)) n.delete(path)
      else n.add(path)
      return n
    })

  const renderNode = (node: TreeNode<parseDiff.File>, depth: number): React.ReactNode => {
    const pad = { paddingLeft: 8 + depth * 16 }
    if (node.file) {
      const name = fileName(node.file)
      const n = countFor(name)
      return (
        <li key={node.path}>
          <a
            href={`#file-${name}`}
            onClick={() => setSelected(name)}
            style={pad}
            aria-current={selected === name ? "true" : undefined}
            className={cn(
              "relative flex items-center gap-2 rounded-md py-1 pr-2 hover:bg-accent",
              selected === name && "bg-accent before:absolute before:top-1 before:bottom-1 before:left-0 before:w-1 before:rounded-full before:bg-ring",
            )}
          >
            {STATUS_ICON[fileStatus(node.file)]}
            <span className="min-w-0 flex-1 truncate" title={name}>{node.name}</span>
            {n > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <MessageSquare className="size-3" />
                {n}
              </span>
            )}
          </a>
        </li>
      )
    }
    const open = !collapsed.has(node.path)
    return (
      <li key={node.path}>
        <button type="button" onClick={() => toggle(node.path)} aria-expanded={open} style={pad} className="flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left hover:bg-accent">
          {open ? <ChevronDown className="size-3.5 text-muted-foreground" /> : <ChevronRight className="size-3.5 text-muted-foreground" />}
          {open ? <FolderOpen className="size-4 text-muted-foreground" /> : <Folder className="size-4 text-muted-foreground" />}
          <span className="truncate">{node.name}</span>
        </button>
        {open && <ul>{node.children.map((c) => renderNode(c, depth + 1))}</ul>}
      </li>
    )
  }

  return (
    <div className="flex items-start gap-4">
      <nav aria-label="Files changed" className="sticky top-[45px] flex max-h-[calc(100vh-101px)] w-[296px] shrink-0 flex-col gap-2 py-4">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter files…" aria-label="Filter files" className="rounded-md bg-background pl-8 dark:bg-background" />
        </div>
        <ul className="min-h-0 overflow-y-auto pb-4">{tree.map((n) => renderNode(n, 0))}</ul>
      </nav>

      <div className="min-w-0 flex-1 space-y-4 py-4">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span>
            <span className="font-semibold text-foreground">{files.length}</span> files changed
          </span>
          <DiffStat add={additions} del={deletions} />
          {toolbar}
        </div>
        {shown.map((f) => {
          const name = fileName(f)
          return (
            <DiffFile
              key={name}
              file={f}
              comments={comments.filter((c) => c.file === name)}
              onAdd={onAdd && ((anchor, body) => onAdd(name, anchor, body))}
              onDelete={onDelete}
            />
          )
        })}
        {shown.length === 0 && <p className="text-muted-foreground">No files match.</p>}
      </div>
    </div>
  )
}

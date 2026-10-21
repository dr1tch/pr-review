import { useState } from "react"
import type * as React from "react"
import { Bot, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Markdown } from "@/components/markdown"
import { timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { ReviewComment, Severity } from "@shared/types"

const SEVERITY: Record<Severity, string> = {
  critical: "border-danger/60 text-danger",
  major: "border-severe/60 text-severe",
  minor: "border-attention/60 text-attention",
  nit: "border-border text-muted-foreground",
}

export function SeverityLabel({ severity }: { severity: Severity | null }) {
  if (!severity) return null
  return <span className={cn("rounded-full border px-2 text-xs leading-[18px] font-medium", SEVERITY[severity])}>{severity}</span>
}

// A person: their GitHub avatar when known, otherwise their initial.
export function UserAvatar({ name, src, size = 40 }: { name: string; src: string | null; size?: number }) {
  const [broken, setBroken] = useState(false)
  if (src && !broken)
    return <img src={src} alt="" width={size} height={size} onError={() => setBroken(true)} className="shrink-0 rounded-full border bg-secondary" style={{ width: size, height: size }} />
  return (
    <span style={{ width: size, height: size, fontSize: size * 0.4 }} className="flex shrink-0 items-center justify-center rounded-full border bg-secondary font-semibold uppercase" aria-hidden>
      {name.trim()[0] ?? "?"}
    </span>
  )
}

export function Avatar({ author, size = 40 }: { author: string; size?: number }) {
  const isAgent = author !== "You"
  return (
    <span
      style={{ width: size, height: size }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border font-semibold",
        isAgent ? "bg-done/15 text-done" : "bg-secondary text-foreground",
      )}
      aria-hidden
    >
      {isAgent ? <Bot style={{ width: size * 0.55, height: size * 0.55 }} /> : <span style={{ fontSize: size * 0.4 }}>Y</span>}
    </span>
  )
}

function DeleteButton({ onDelete }: { onDelete: () => void }) {
  return (
    <Button variant="ghost" size="icon-xs" className="ml-auto text-muted-foreground opacity-0 group-hover/c:opacity-100 focus-visible:opacity-100" aria-label="Delete comment" onClick={onDelete}>
      <Trash2 />
    </Button>
  )
}

function Meta({ c, verb }: { c: ReviewComment; verb?: string }) {
  return (
    <>
      <span className="font-semibold">{c.author}</span>
      {c.author !== "You" && <span className="rounded-full border px-1.5 text-xs leading-[18px] text-muted-foreground">agent</span>}
      <span className="text-muted-foreground" title={new Date(c.createdAt).toLocaleString()}>
        {verb} {timeAgo(c.createdAt)}
      </span>
      <SeverityLabel severity={c.severity} />
    </>
  )
}

// Conversation-tab timeline item: avatar beside a boxed comment, like a GitHub PR comment.
export function TimelineComment({ c, onDelete }: { c: ReviewComment; onDelete: () => void }) {
  return (
    <div className="group/c flex gap-4">
      <Avatar author={c.author} />
      <div className="min-w-0 flex-1 rounded-md border">
        <div className="flex items-center gap-2 rounded-t-md border-b bg-muted px-4 py-2">
          <Meta c={c} verb="commented" />
          <DeleteButton onDelete={onDelete} />
        </div>
        <div className="p-4">
          <Markdown>{c.body}</Markdown>
        </div>
      </div>
    </div>
  )
}

// Inline review thread inside the diff.
export function Thread({ comments, onDelete, composer }: { comments: ReviewComment[]; onDelete: (id: string) => void; composer?: React.ReactNode }) {
  return (
    <div className="my-2 max-w-4xl overflow-hidden rounded-md border bg-background font-sans text-sm">
      {comments.map((c) => (
        <div key={c.id} className="group/c border-b px-4 py-3 last:border-b-0">
          <div className="mb-2 flex items-center gap-2">
            <Avatar author={c.author} size={24} />
            <Meta c={c} />
            <DeleteButton onDelete={() => onDelete(c.id)} />
          </div>
          <Markdown>{c.body}</Markdown>
        </div>
      ))}
      {composer && <div className={cn("bg-muted", comments.length > 0 && "border-t")}>{composer}</div>}
    </div>
  )
}

// Markdown textarea with GitHub's Write / Preview tabs.
export function MarkdownEditor({ value, onChange, preview, onPreview, className, ...props }: Omit<React.ComponentProps<typeof Textarea>, "value" | "onChange"> & {
  value: string
  onChange: (value: string) => void
  preview: boolean
  onPreview: (preview: boolean) => void
}) {
  return (
    <>
      <div role="tablist" className="flex gap-1 rounded-t-md border-b bg-muted px-2 pt-2">
        {(["Write", "Preview"] as const).map((t) => {
          const active = (t === "Preview") === preview
          return (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => onPreview(t === "Preview")}
              className={cn(
                "-mb-px rounded-t-md border border-transparent px-4 py-2 text-sm",
                active ? "border-border border-b-background bg-background text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          )
        })}
      </div>
      <div className="p-2 pb-0">
        {preview ? (
          <div className={cn("min-h-24 px-2 py-1", className)}>{value.trim() ? <Markdown>{value}</Markdown> : <p className="text-muted-foreground">Nothing to preview</p>}</div>
        ) : (
          <Textarea value={value} onChange={(e) => onChange(e.target.value)} className={cn("min-h-24 rounded-md bg-background dark:bg-background", className)} {...props} />
        )}
      </div>
    </>
  )
}

export function Composer({ onSubmit, onCancel, submitLabel = "Comment" }: { onSubmit: (body: string) => Promise<void>; onCancel?: () => void; submitLabel?: string }) {
  const [body, setBody] = useState("")
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!body.trim()) return
    setBusy(true)
    try {
      await onSubmit(body)
      setBody("")
      setPreview(false)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="rounded-md border bg-background">
      <MarkdownEditor
        value={body}
        onChange={setBody}
        preview={preview}
        onPreview={setPreview}
        autoFocus={!!onCancel}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit()
          if (e.key === "Escape") onCancel?.()
        }}
        placeholder="Leave a comment (Markdown supported, Ctrl+Enter to send)"
        aria-label="Comment"
      />
      <div className="flex justify-end gap-2 p-2">
        {onCancel && (
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button size="sm" disabled={busy || !body.trim()} onClick={submit}>
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}

import { useEffect, useId, useRef, useState } from "react"
import { AlertCircle, ArrowLeft, GitPullRequest, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MarkdownEditor } from "@/components/comments"
import type { PrMeta, PullRequest } from "@shared/types"

// Picks several values: chips plus a text field that suggests from `options` (Enter or comma adds).
function TokenField({ label, value, onChange, options, color, extra }: {
  label: string
  value: string[]
  onChange: (v: string[]) => void
  options: string[]
  color?: (v: string) => string | undefined
  extra?: React.ReactNode
}) {
  const [text, setText] = useState("")
  const list = useId()
  const add = (v: string) => {
    const t = v.trim().replace(/,$/, "")
    if (t && !value.includes(t)) onChange([...value, t])
    setText("")
  }
  return (
    <div className="border-b pb-3">
      <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-muted-foreground">
        {label} {extra}
      </div>
      {value.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {value.map((v) => {
            const c = color?.(v)
            return (
              <span key={v} className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs" style={c ? { borderColor: c, color: c, background: `${c}22` } : undefined}>
                {v}
                <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} aria-label={`Remove ${v}`} className="hover:text-foreground">
                  <X className="size-3" />
                </button>
              </span>
            )
          })}
        </div>
      )}
      <Input
        list={list}
        value={text}
        aria-label={label}
        placeholder={options.length ? `Add ${label.toLowerCase()}…` : "Type and press Enter"}
        onChange={(e) => {
          const v = e.target.value
          // picking a suggestion fills the whole value at once
          if (v.endsWith(",") || options.includes(v)) add(v)
          else setText(v)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            add(text)
          }
        }}
        className="h-7 text-xs"
      />
      <datalist id={list}>
        {options.filter((o) => !value.includes(o)).map((o) => <option key={o} value={o} />)}
      </datalist>
    </div>
  )
}

// GitHub's default description: a single commit's message, or the list of commit subjects.
function defaultBody(pr: PullRequest) {
  if (pr.commits.length === 1) return pr.body
  return [...pr.commits].reverse().map((c) => `- ${c.subject}`).join("\n")
}

// The Conversation tab's first box while the branch has no GitHub PR.
export function CreatePr({ pr, onCreated }: { pr: PullRequest; onCreated: (url: string) => void }) {
  const [meta, setMeta] = useState<PrMeta | null>(null)
  const [base, setBase] = useState(pr.base.replace(/^origin\//, ""))
  const [title, setTitle] = useState(pr.title)
  const [body, setBody] = useState(defaultBody(pr))
  const [preview, setPreview] = useState(false)
  const [reviewers, setReviewers] = useState<string[]>([])
  const [assignees, setAssignees] = useState<string[]>([])
  const [labels, setLabels] = useState<string[]>([])
  const [milestone, setMilestone] = useState("")
  const [busy, setBusy] = useState<"draft" | "ready" | "generate" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)

  useEffect(() => {
    setBusy(null)
    return () => { generation.current++ }
  }, [pr.repo, pr.branch, base])

  useEffect(() => {
    let live = true
    window.api.prMeta(pr.repo).then((m) => {
      if (!live) return
      setMeta(m)
      if (m.template) setBody(m.template)
    }, () => live && setMeta({ labels: [], users: [], milestones: [], me: null, template: null }))
    return () => void (live = false)
  }, [pr.repo])

  const create = async (draft: boolean) => {
    setBusy(draft ? "draft" : "ready")
    setError(null)
    try {
      onCreated(await window.api.createPr(pr.repo, { base, title, body, draft, reviewers, assignees, labels, milestone: milestone || null }))
    } catch (e) {
      setError((e as Error).message)
      setBusy(null)
    }
  }
  const generate = async () => {
    const request = ++generation.current
    setBusy("generate")
    setError(null)
    try {
      const draft = await window.api.generatePrDraft(pr.repo, base, pr.branch)
      if (request !== generation.current) return
      setTitle(draft.title)
      setBody(draft.body)
    } catch (e) {
      if (request === generation.current) setError((e as Error).message)
    } finally {
      if (request === generation.current) setBusy(null)
    }
  }
  const labelColor = (name: string) => {
    const c = meta?.labels.find((l) => l.name === name)?.color
    return c ? `#${c}` : undefined
  }

  return (
    <section aria-labelledby="create-pr-title" className="rounded-md border border-ring/50">
        <div className="flex items-center gap-2 rounded-t-md border-b border-ring/50 bg-ring/10 px-4 py-2">
          <GitPullRequest className="size-4" />
          <h2 id="create-pr-title" className="flex-1 font-semibold">Open a pull request</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b bg-muted px-4 py-2.5 text-sm">
          <label className="flex items-center gap-1.5">
            <span className="text-muted-foreground">base:</span>
            <Input value={base} disabled={!!busy} onChange={(e) => setBase(e.target.value)} aria-label="Base branch" className="h-7 w-44 font-mono text-xs" />
          </label>
          <ArrowLeft className="size-4 text-muted-foreground" />
          <span><span className="text-muted-foreground">compare:</span> <code className="font-mono text-xs">{pr.branch}</code></span>
          <span className="ml-auto text-xs text-muted-foreground">
            {pr.commits.length} commit{pr.commits.length === 1 ? "" : "s"} · the branch is pushed to origin first
          </span>
        </div>

        {pr.uncommitted.length > 0 && (
          <div role="status" className="mx-4 mt-4 flex items-center gap-2 rounded-md border border-attention/40 bg-attention/10 px-4 py-2 text-sm text-attention">
            <AlertCircle className="size-4 shrink-0" />
            {pr.uncommitted.length} uncommitted file{pr.uncommitted.length === 1 ? "" : "s"} won't be in the pull request. Commit {pr.uncommitted.length === 1 ? "it" : "them"} first to include {pr.uncommitted.length === 1 ? "it" : "them"}.
          </div>
        )}

        <div className="flex flex-wrap gap-6 p-4">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p role="status" className="text-xs text-muted-foreground">{busy === "generate" ? "Generating from committed changes…" : "Built-in: PR title and description. Fills the fields below."}</p>
              <Button variant="outline" onClick={generate} disabled={!!busy || !meta}>
                {busy === "generate" && <Loader2 className="animate-spin" />} Generate title and description
              </Button>
            </div>
            <Input value={title} disabled={!!busy} onChange={(e) => setTitle(e.target.value)} aria-label="Title" placeholder="Title" className="h-9 text-base" />
            <div className="rounded-md border">
              <MarkdownEditor value={body} disabled={!!busy} onChange={setBody} preview={preview} onPreview={setPreview} aria-label="Description" placeholder="Add a description (Markdown supported)" className="min-h-72" />
              <div className="h-2" />
            </div>
            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger/10 px-4 py-2 text-sm whitespace-pre-wrap text-danger">
                <AlertCircle className="mt-0.5 size-4 shrink-0" /> {error}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => create(true)} disabled={!!busy || !title.trim()}>
                {busy === "draft" && <Loader2 className="animate-spin" />} Create draft pull request
              </Button>
              <Button onClick={() => create(false)} disabled={!!busy || !title.trim()}>
                {busy === "ready" && <Loader2 className="animate-spin" />} Create pull request
              </Button>
            </div>
          </div>

          <aside className="w-56 shrink-0 space-y-3 text-sm">
            {!meta && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" /> Loading labels and people…</p>}
            <TokenField label="Reviewers" value={reviewers} onChange={setReviewers} options={(meta?.users ?? []).filter((u) => u !== meta?.me)} />
            <TokenField
              label="Assignees" value={assignees} onChange={setAssignees} options={meta?.users ?? []}
              extra={meta?.me && !assignees.includes(meta.me) && (
                <button type="button" onClick={() => setAssignees([...assignees, meta.me!])} className="font-normal text-link hover:underline">assign yourself</button>
              )}
            />
            <TokenField label="Labels" value={labels} onChange={setLabels} options={meta?.labels.map((l) => l.name) ?? []} color={labelColor} />
            <label className="block border-b pb-3">
              <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Milestone</span>
              <select value={milestone} onChange={(e) => setMilestone(e.target.value)} className="h-7 w-full rounded-md border bg-muted px-2 text-xs text-foreground">
                <option value="">No milestone</option>
                {meta?.milestones.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
          </aside>
        </div>
    </section>
  )
}

import { useMemo, useState } from "react"
import { Popover } from "@base-ui/react/popover"
import { Bot, ChevronDown, Loader2, Search, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { AgentRun, Reviewer } from "@shared/types"
import { reviewerGroups } from "@/lib/reviewers"

type Props = {
  reviewers: Reviewer[]
  runs: AgentRun[] // this branch's runs, newest first
  onRun: (r: Reviewer) => void
  onCancel: (runId: string) => void
}

export function ReviewMenu({ reviewers, runs, onRun, onCancel }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const running = runs.filter((r) => r.status === "running")

  const groups = useMemo(() => reviewerGroups(reviewers, query), [reviewers, query])

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger render={<Button size="sm" className="border-white/10" />}>
        {running.length > 0 ? <Loader2 className="animate-spin" /> : <Sparkles />}
        Review with…
        {running.length > 0 && <span className="rounded-full bg-white/20 px-1.5 text-xs">{running.length}</span>}
        <ChevronDown />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
          <Popover.Popup className="flex max-h-[70vh] w-[420px] flex-col rounded-md border bg-popover text-sm shadow-2xl outline-none">
            <div className="border-b p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find an agent or skill…" aria-label="Find an agent or skill" className="rounded-md bg-background pl-8 dark:bg-background" />
              </div>
            </div>
            {running.length > 0 && (
              <section aria-label="Running" className="border-b py-1">
                <h3 className="px-3 pt-1 pb-1 text-xs font-semibold text-muted-foreground">Running</h3>
                {running.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 px-3 py-1.5">
                    <Loader2 className="size-4 shrink-0 animate-spin text-attention" />
                    <span className="min-w-0 flex-1 truncate font-semibold">{r.agent}</span>
                    <Button size="xs" variant="outline" onClick={() => onCancel(r.id)} aria-label={`Cancel ${r.agent}`}>
                      <X /> Cancel
                    </Button>
                  </div>
                ))}
              </section>
            )}
            <div className="min-h-0 overflow-y-auto py-1">
              {groups.length === 0 && <p className="px-3 py-4 text-muted-foreground">Nothing matches.</p>}
              {groups.map((g) => (
                <section key={g.label} aria-label={g.label}>
                  <h3 className="px-3 pt-2 pb-1 text-xs font-semibold text-muted-foreground">{g.label}</h3>
                  {g.items.map((r) => {
                    const busy = running.some((x) => x.agent === r.name && x.kind === r.kind)
                    return (
                      <button
                        key={`${g.label}:${r.kind}:${r.name}`}
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          onRun(r)
                          setOpen(false)
                        }}
                        className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:opacity-60"
                      >
                        {r.kind === "agent" ? <Bot className="mt-0.5 size-4 shrink-0 text-done" /> : <Sparkles className="mt-0.5 size-4 shrink-0 text-link" />}
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate font-semibold">{r.source === "builtin" ? r.name.replace(/^builtin:/, "") : r.name}</span>
                            {r.source !== "user" && <span className="shrink-0 rounded-full border px-1.5 text-[11px] leading-4 text-muted-foreground">{r.source}</span>}
                            {busy && <Loader2 className="size-3.5 shrink-0 animate-spin text-attention" />}
                          </span>
                          {r.description && <span className="line-clamp-2 text-xs text-muted-foreground">{r.description}</span>}
                        </span>
                      </button>
                    )
                  })}
                </section>
              ))}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

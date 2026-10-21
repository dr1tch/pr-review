import { useCallback, useState } from "react"
import { FolderGit2, GitPullRequest, Plus, X } from "lucide-react"
import { RepoView } from "@/components/repo-view"
import { cn } from "@/lib/utils"

type RepoTab = { id: string; repo: string; base: string }

const STORAGE_KEY = "pr-review:tabs"
const newTab = (): RepoTab => ({ id: crypto.randomUUID(), repo: "", base: "master" })

function loadTabs(): { tabs: RepoTab[]; active: string } {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")
    if (Array.isArray(s.tabs) && s.tabs.length) return { tabs: s.tabs, active: s.active ?? s.tabs[0].id }
  } catch {}
  const t = newTab()
  try {
    // single-repo versions saved { repo, base } under "pr-review"
    const old = JSON.parse(localStorage.getItem("pr-review") ?? "{}")
    if (old.repo) Object.assign(t, { repo: old.repo, base: old.base ?? "master" })
  } catch {}
  return { tabs: [t], active: t.id }
}

function saveTabs(tabs: RepoTab[], active: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs, active }))
  } catch {}
}

const repoName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path

export function App() {
  const [state, setState] = useState(loadTabs)
  const { tabs, active } = state

  const update = useCallback((fn: (s: { tabs: RepoTab[]; active: string }) => { tabs: RepoTab[]; active: string }) => {
    setState((s) => {
      const next = fn(s)
      saveTabs(next.tabs, next.active)
      return next
    })
  }, [])

  const add = () => update((s) => {
    const t = newTab()
    return { tabs: [...s.tabs, t], active: t.id }
  })

  const close = (id: string) => update((s) => {
    const i = s.tabs.findIndex((t) => t.id === id)
    const rest = s.tabs.filter((t) => t.id !== id)
    if (!rest.length) {
      const t = newTab()
      return { tabs: [t], active: t.id }
    }
    return { tabs: rest, active: s.active === id ? rest[Math.max(0, i - 1)].id : s.active }
  })

  const opened = useCallback(
    (id: string, repo: string, base: string) =>
      update((s) => ({ ...s, tabs: s.tabs.map((t) => (t.id === id ? { ...t, repo, base } : t)) })),
    [update],
  )

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-11 shrink-0 items-end gap-1 border-b bg-inset px-3">
        <GitPullRequest className="mr-2 mb-2.5 size-5 shrink-0" aria-label="PR Review" />
        <div role="tablist" aria-label="Repositories" className="flex min-w-0 items-end gap-1 overflow-x-auto [scrollbar-width:none]">
          {tabs.map((t) => {
            const selected = t.id === active
            return (
              <div
                key={t.id}
                className={cn(
                  "group -mb-px flex h-9 max-w-56 shrink-0 items-center gap-2 rounded-t-md border border-b-0 pr-1 pl-3",
                  selected ? "border-border bg-background" : "border-transparent text-muted-foreground hover:bg-secondary",
                )}
              >
                <button role="tab" type="button" aria-selected={selected} onClick={() => update((s) => ({ ...s, active: t.id }))} className="flex min-w-0 items-center gap-2" title={t.repo || "New tab"}>
                  <FolderGit2 className="size-4 shrink-0" />
                  <span className="truncate">{t.repo ? repoName(t.repo) : "New tab"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => close(t.id)}
                  aria-label={`Close ${t.repo ? repoName(t.repo) : "tab"}`}
                  className={cn("rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground", !selected && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100")}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )
          })}
        </div>
        <button type="button" onClick={add} aria-label="New tab" className="mb-1.5 rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
          <Plus className="size-4" />
        </button>
      </header>
      {tabs.map((t) => (
        <RepoView key={t.id} repo={t.repo} base={t.base} hidden={t.id !== active} onOpen={(repo, base) => opened(t.id, repo, base)} />
      ))}
    </div>
  )
}

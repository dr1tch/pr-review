import { useCallback, useEffect, useState } from "react"
import { RepoView } from "@/components/repo-view"
import { RepoTabs } from "@/components/repo-tabs"
import { loadTabState, openGroup, type TabState } from "@/lib/repo-tabs"

const STORAGE_KEY = "pr-review:tabs"

function loadTabs() {
  try {
    return loadTabState(localStorage.getItem(STORAGE_KEY), localStorage.getItem("pr-review"))
  } catch {
    return loadTabState(null)
  }
}

export function App() {
  const [state, setState] = useState(loadTabs)
  const { tabs, active } = state

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {}
  }, [state])

  const update = useCallback((fn: (s: TabState) => TabState) => setState(fn), [])

  // `pr-review --group=<name> --repo=<path>...` from the command line or a second launch.
  useEffect(() => {
    const take = () =>
      window.api.takeOpenRequests().then((reqs) => reqs.forEach((r) => update((s) => openGroup(s, r.group, r.repos))), () => {})
    take()
    return window.api.onOpenRequest(take)
  }, [update])

  const opened = useCallback(
    (id: string, repo: string, base: string, branch: string) =>
      update((s) => ({ ...s, tabs: s.tabs.map((t) => (t.id === id ? { ...t, repo, base, branch } : t)) })),
    [update],
  )

  return (
    <div className="flex h-full flex-col">
      <RepoTabs state={state} update={update} />
      {tabs.map((t) => (
        <RepoView key={t.id} repo={t.repo} base={t.base} hidden={t.id !== active} onOpen={(repo, base, branch) => opened(t.id, repo, base, branch)} />
      ))}
    </div>
  )
}

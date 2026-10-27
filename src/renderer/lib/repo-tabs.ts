export const GROUP_COLORS = {
  blue: "#58a6ff", green: "#3fb950", purple: "#bc8cff", orange: "#f0883e", pink: "#f778ba", gray: "#9198a1",
} as const

export type RepoTab = { id: string; repo: string; base: string; branch?: string; groupId?: string }
export type TabGroup = { id: string; name: string; color: keyof typeof GROUP_COLORS; collapsed: boolean }
export type TabState = { tabs: RepoTab[]; active: string; groups: TabGroup[] }

export const newTab = (): RepoTab => ({ id: crypto.randomUUID(), repo: "", base: "master" })

export function loadTabState(raw: string | null, legacy: string | null = null): TabState {
  try {
    const s = JSON.parse(raw ?? "{}")
    if (Array.isArray(s.tabs) && s.tabs.length && s.tabs.every((t: RepoTab) => t && typeof t.id === "string" && typeof t.repo === "string" && typeof t.base === "string")) {
      const tabs: RepoTab[] = s.tabs
      const groups: TabGroup[] = (Array.isArray(s.groups) ? s.groups : []).filter((g: TabGroup) =>
        g && typeof g.id === "string" && typeof g.name === "string" && Object.hasOwn(GROUP_COLORS, g.color) && tabs.some((t) => t.groupId === g.id),
      ).map((g: TabGroup) => ({ ...g, collapsed: g.collapsed === true }))
      const state = { tabs: tabs.map((t) => !t.groupId || groups.some((g) => g.id === t.groupId) ? t : { ...t, groupId: undefined }), groups, active: s.active }
      return activateTab(state, tabs.some((t) => t.id === s.active) ? s.active : tabs[0].id)
    }
  } catch {}
  const tab = newTab()
  try {
    const old = JSON.parse(legacy ?? "{}")
    if (typeof old.repo === "string") Object.assign(tab, { repo: old.repo, base: typeof old.base === "string" ? old.base : "master" })
  } catch {}
  return { tabs: [tab], active: tab.id, groups: [] }
}

export function activateTab(state: TabState, id: string): TabState {
  const tab = state.tabs.find((t) => t.id === id)
  if (!tab) return state
  return { ...state, active: id, groups: state.groups.map((g) => g.id === tab.groupId ? { ...g, collapsed: false } : g) }
}

// beforeId: undefined uses the menu's group position; null drops at the end of the tab bar.
export function moveTab(state: TabState, id: string, groupId?: string, beforeId?: string | null): TabState {
  const tab = state.tabs.find((t) => t.id === id)
  if (!tab || (groupId && !state.groups.some((g) => g.id === groupId))) return state
  if ((beforeId === id && tab.groupId === groupId) || (beforeId && !state.tabs.some((t) => t.id === beforeId))) return state
  const tabs = state.tabs.filter((t) => t.id !== id)
  // Keep groups contiguous so closing a tab chooses its visible neighbor.
  const targetGroup = groupId && tabs.some((t) => t.groupId === groupId) ? groupId : tab.groupId
  const anchor = targetGroup ? tabs.findLastIndex((t) => t.groupId === targetGroup) : -1
  let index = state.tabs.indexOf(tab)
  if (beforeId === undefined && anchor >= 0) index = anchor + 1
  else if (beforeId === null) index = tabs.length
  else if (beforeId && beforeId !== id) index = tabs.findIndex((t) => t.id === beforeId)
  if (groupId) {
    const first = tabs.findIndex((t) => t.groupId === groupId)
    if (first >= 0) index = Math.max(first, Math.min(index, tabs.findLastIndex((t) => t.groupId === groupId) + 1))
  } else if (index > 0 && tabs[index]?.groupId && tabs[index].groupId === tabs[index - 1].groupId) {
    index = tabs.findIndex((t) => t.groupId === tabs[index].groupId)
  }
  tabs.splice(index, 0, { ...tab, groupId })
  return {
    ...state, tabs,
    groups: state.groups.filter((g) => tabs.some((t) => t.groupId === g.id)).map((g) => g.id === groupId ? { ...g, collapsed: false } : g),
  }
}

export function toggleGroup(state: TabState, id: string): TabState {
  const group = state.groups.find((g) => g.id === id)
  if (!group) return state
  let next = { ...state, groups: state.groups.map((g) => g.id === id ? { ...g, collapsed: !g.collapsed } : g) }
  if (!group.collapsed && state.tabs.find((t) => t.id === state.active)?.groupId === id) {
    const outside = state.tabs.find((t) => t.groupId !== id && !state.groups.find((g) => g.id === t.groupId)?.collapsed)
    const tab = outside ?? newTab()
    next = { ...next, active: tab.id, tabs: outside ? state.tabs : [...state.tabs, tab] }
  }
  return next
}

export function closeTab(state: TabState, id: string): TabState {
  const index = state.tabs.findIndex((t) => t.id === id)
  if (index < 0) return state
  const tabs = state.tabs.filter((t) => t.id !== id)
  if (!tabs.length) tabs.push(newTab())
  const next = { ...state, tabs, groups: state.groups.filter((g) => tabs.some((t) => t.groupId === g.id)) }
  return activateTab(next, state.active === id ? tabs[Math.max(0, index - 1)].id : state.active)
}

export function ungroup(state: TabState, id: string): TabState {
  return { ...state, tabs: state.tabs.map((t) => t.groupId === id ? { ...t, groupId: undefined } : t), groups: state.groups.filter((g) => g.id !== id) }
}

export function moveGroup(state: TabState, id: string, beforeId: string | null): TabState {
  const members = state.tabs.filter((t) => t.groupId === id)
  if (!members.length || (beforeId && !state.tabs.some((t) => t.id === beforeId)) || members.some((t) => t.id === beforeId)) return state
  const tabs = state.tabs.filter((t) => t.groupId !== id)
  let index = beforeId === null ? tabs.length : tabs.findIndex((t) => t.id === beforeId)
  const targetGroup = tabs[index]?.groupId
  if (targetGroup) index = tabs.findIndex((t) => t.groupId === targetGroup)
  tabs.splice(index, 0, ...members)
  return { ...state, tabs }
}

// Opens the repos as one named group, reusing a group with that name and tabs already showing a repo.
export function openGroup(state: TabState, name: string, repos: { repo: string; base: string; explicitBase?: boolean }[]): TabState {
  if (!repos.length) return state
  const used = new Set(state.groups.map((g) => g.color))
  const group = state.groups.find((g) => g.name === name) ?? {
    id: crypto.randomUUID(), name, collapsed: false,
    color: (Object.keys(GROUP_COLORS) as TabGroup["color"][]).find((c) => !used.has(c)) ?? "blue",
  }
  // A blank tab outside any group is just the empty start page; drop it.
  let next: TabState = { ...state, tabs: state.tabs.filter((t) => t.repo || t.groupId), groups: state.groups.includes(group) ? state.groups : [...state.groups, group] }
  const ids = repos.map(({ repo, base, explicitBase }) => {
    const existing = next.tabs.find((t) => t.repo === repo)
    if (existing && explicitBase && existing.base !== base) {
      // A new id remounts the view, which loads once on mount, against the new base.
      const moved = { ...existing, id: crypto.randomUUID(), base }
      next = { ...next, tabs: next.tabs.map((t) => (t === existing ? moved : t)), active: next.active === existing.id ? moved.id : next.active }
      return moved.id
    }
    if (existing) return existing.id
    const tab = { ...newTab(), repo, base }
    next = { ...next, tabs: [...next.tabs, tab] }
    return tab.id
  })
  for (const id of ids) next = moveTab(next, id, group.id)
  return activateTab(next, ids[0])
}

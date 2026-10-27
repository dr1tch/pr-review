import { useState, type DragEvent } from "react"
import { Menu } from "@base-ui/react/menu"
import { Popover } from "@base-ui/react/popover"
import { ChevronDown, ChevronRight, FolderGit2, GitPullRequest, MoreHorizontal, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { activateTab, closeTab, GROUP_COLORS, moveGroup, moveTab, newTab, toggleGroup, ungroup, type RepoTab, type TabGroup, type TabState } from "@/lib/repo-tabs"
import { cn } from "@/lib/utils"

type Props = { state: TabState; update: (fn: (state: TabState) => TabState) => void }
const repoName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path
const itemClass = "flex cursor-default items-center gap-2 rounded px-3 py-1.5 outline-none data-highlighted:bg-accent data-disabled:opacity-50"
const DRAG_TYPE = "application/x-pr-review-tabs"
type DragItem = { kind: "tab" | "group"; id: string }
type DropTarget = { beforeId: string | null; groupId?: string; indicator: string }
type TabDrag = {
  item: DragItem | null
  target: DropTarget | null
  start: (e: DragEvent<HTMLElement>, item: DragItem) => void
  over: (e: DragEvent<HTMLElement>, tab: RepoTab) => void
  drop: (e: DragEvent<HTMLElement>) => void
  end: () => void
}

function RepositoryTab({ tab, state, update, onCreateGroup, drag }: Props & { tab: RepoTab; onCreateGroup: (id: string) => void; drag: TabDrag }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const selected = tab.id === state.active
  const name = tab.repo ? repoName(tab.repo) : "New tab"
  const index = state.tabs.findIndex((t) => t.id === tab.id)
  const left = state.tabs[index - 1]
  const right = state.tabs[index + 1]
  return (
    <Menu.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <div
        onContextMenu={(e) => { e.preventDefault(); setMenuOpen(true) }}
        onDragOver={(e) => drag.over(e, tab)} onDrop={drag.drop}
        className={cn("group relative -mb-px flex h-9 max-w-80 shrink-0 items-center gap-1 rounded-t-md border border-b-0 pr-1 pl-3", selected ? "border-border bg-background" : "border-transparent text-muted-foreground hover:bg-secondary", drag.item?.kind === "tab" && drag.item.id === tab.id && "opacity-50")}
      >
        {drag.target?.indicator.startsWith(`${tab.id}:`) && <span aria-hidden className={cn("pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-link", drag.target.indicator.endsWith(":before") ? "-left-0.5" : "-right-0.5")} />}
        <button role="tab" type="button" draggable onDragStart={(e) => { setMenuOpen(false); drag.start(e, { kind: "tab", id: tab.id }) }} onDragEnd={drag.end} aria-selected={selected} onClick={() => update((s) => activateTab(s, tab.id))} className="flex min-w-0 items-center gap-2" title={tab.repo ? `${tab.repo}${tab.branch ? ` (${tab.branch})` : ""}` : name}>
          <FolderGit2 className="size-4 shrink-0" />
          <span className="truncate">{name}{tab.branch && <span className="ml-1.5 font-mono text-xs text-muted-foreground">{tab.branch}</span>}</span>
        </button>
        <Menu.Trigger aria-label={`Tab options for ${name}`} title="Tab options" className="rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent focus-visible:opacity-100 aria-expanded:opacity-100">
          <MoreHorizontal className="size-3.5" />
        </Menu.Trigger>
        <button type="button" onClick={() => update((s) => closeTab(s, tab.id))} aria-label={`Close ${name}`} className={cn("rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground", !selected && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100")}><X className="size-3.5" /></button>
      </div>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="start" sideOffset={6} className="z-50">
          <Menu.Popup className="min-w-48 rounded-md border bg-popover p-1 text-sm shadow-2xl outline-none">
            <Menu.Item className={itemClass} onClick={() => onCreateGroup(tab.id)}><Plus className="size-3.5" /> New group</Menu.Item>
            {state.groups.length > 0 && <Menu.Group>
              <Menu.GroupLabel className="px-3 pt-2 pb-1 text-xs text-muted-foreground">Move to group</Menu.GroupLabel>
              {state.groups.map((g) => <Menu.Item key={g.id} disabled={tab.groupId === g.id} className={itemClass} onClick={() => update((s) => moveTab(s, tab.id, g.id))}><span className="size-2.5 rounded-full" style={{ backgroundColor: GROUP_COLORS[g.color] }} />{g.name}</Menu.Item>)}
            </Menu.Group>}
            {tab.groupId && <Menu.Item className={itemClass} onClick={() => update((s) => moveTab(s, tab.id))}>Remove from group</Menu.Item>}
            <Menu.Item disabled={!left} className={itemClass} onClick={() => update((s) => moveTab(s, tab.id, left.groupId, left.id))}>Move left</Menu.Item>
            <Menu.Item disabled={!right} className={itemClass} onClick={() => update((s) => moveTab(s, tab.id, right.groupId, state.tabs[index + 2]?.id ?? null))}>Move right</Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}

function GroupEditor({ group, onSave, onUngroup, onClose, onMoveLeft, onMoveRight }: { group: TabGroup; onSave: (name: string, color: TabGroup["color"]) => void; onUngroup: () => void; onClose: () => void; onMoveLeft?: () => void; onMoveRight?: () => void }) {
  const [name, setName] = useState(group.name)
  const [color, setColor] = useState(group.color)
  return (
    <form className="w-60 space-y-3 rounded-md border bg-popover p-3 text-sm shadow-2xl outline-none" aria-label="Edit tab group" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { onSave(name.trim(), color); onClose() } }}>
      <label className="block space-y-1"><span className="text-xs text-muted-foreground">Group name</span><Input autoFocus aria-label="Group name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></label>
      <div role="group" aria-label="Group color" className="flex gap-2">
        {Object.entries(GROUP_COLORS).map(([key, value]) => <button key={key} type="button" aria-label={`${key} group color`} aria-pressed={color === key} onClick={() => setColor(key as TabGroup["color"])} className={cn("size-6 rounded-full border-2 border-transparent outline-offset-2 focus-visible:outline-2", color === key && "border-foreground")} style={{ backgroundColor: value }} />)}
      </div>
      <div className="flex gap-2"><Button type="button" variant="outline" size="xs" disabled={!onMoveLeft} onClick={onMoveLeft}>Move left</Button><Button type="button" variant="outline" size="xs" disabled={!onMoveRight} onClick={onMoveRight}>Move right</Button></div>
      <div className="flex items-center justify-between border-t pt-3"><Button type="button" variant="ghost" size="xs" onClick={() => { onUngroup(); onClose() }}>Ungroup</Button><Button type="submit" size="xs" disabled={!name.trim()}>Save</Button></div>
    </form>
  )
}

export function RepoTabs({ state, update }: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  const [dragging, setDragging] = useState<DragItem | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const endDrag = () => { setDragging(null); setDropTarget(null) }
  const startDrag = (e: DragEvent<HTMLElement>, item: DragItem) => {
    e.stopPropagation()
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData(DRAG_TYPE, `${item.kind}:${item.id}`)
    setEditing(null)
    setDragging(item)
    if (item.kind === "tab") update((s) => activateTab(s, item.id))
  }
  const targetDrag = (e: DragEvent<HTMLElement>, target: DropTarget) => {
    if (!dragging || !e.dataTransfer.types.includes(DRAG_TYPE)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = "move"
    setDropTarget((old) => old?.indicator === target.indicator ? old : target)
  }
  const overTab = (e: DragEvent<HTMLElement>, tab: RepoTab) => {
    if (dragging?.id === tab.id || (dragging?.kind === "group" && dragging.id === tab.groupId)) {
      e.stopPropagation()
      setDropTarget(null)
      return
    }
    const bounds = e.currentTarget.getBoundingClientRect()
    const after = e.clientX > bounds.left + bounds.width / 2
    const members = dragging?.kind === "group" && tab.groupId ? state.tabs.filter((t) => t.groupId === tab.groupId) : [tab]
    const boundary = after ? members[members.length - 1] : members[0]
    const index = state.tabs.findIndex((t) => t.id === boundary.id)
    targetDrag(e, { beforeId: after ? state.tabs[index + 1]?.id ?? null : boundary.id, groupId: tab.groupId, indicator: `${boundary.id}:${after ? "after" : "before"}` })
  }
  const overGroup = (e: DragEvent<HTMLElement>, group: TabGroup) => {
    if (dragging?.kind === "group" && dragging.id === group.id) { setDropTarget(null); return }
    const members = state.tabs.filter((t) => t.groupId === group.id)
    const after = state.tabs.findIndex((t) => t.id === members[members.length - 1].id) + 1
    targetDrag(e, { beforeId: dragging?.kind === "group" ? members[0].id : state.tabs[after]?.id ?? null, groupId: group.id, indicator: `group:${group.id}` })
  }
  const drop = (e: DragEvent<HTMLElement>) => {
    if (!dragging || !dropTarget || e.dataTransfer.getData(DRAG_TYPE) !== `${dragging.kind}:${dragging.id}`) return
    e.preventDefault()
    e.stopPropagation()
    update((s) => dragging.kind === "group" ? moveGroup(s, dragging.id, dropTarget.beforeId) : moveTab(s, dragging.id, dropTarget.groupId, dropTarget.beforeId))
    endDrag()
  }
  const createGroup = (tabId: string) => {
    const id = crypto.randomUUID()
    update((s) => moveTab({ ...s, groups: [...s.groups, { id, name: `Group ${s.groups.length + 1}`, color: (Object.keys(GROUP_COLORS) as TabGroup["color"][])[s.groups.length % Object.keys(GROUP_COLORS).length], collapsed: false }] }, tabId, id))
    setEditing(id)
  }
  const drag: TabDrag = { item: dragging, target: dropTarget, start: startDrag, over: overTab, drop, end: endDrag }
  const renderTab = (tab: RepoTab) => <RepositoryTab key={tab.id} tab={tab} state={state} update={update} onCreateGroup={createGroup} drag={drag} />

  return (
    <header onDragEnd={endDrag} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(null) }} className="flex h-11 shrink-0 items-end gap-1 border-b bg-inset px-3">
      <GitPullRequest className="mr-2 mb-2.5 size-5 shrink-0" aria-label="PR Review" />
      <div role="tablist" aria-label="Repositories" onDragOverCapture={(e) => {
        if (!dragging) return
        const bounds = e.currentTarget.getBoundingClientRect()
        if (e.clientX < bounds.left + 32) e.currentTarget.scrollBy(-16, 0)
        else if (e.clientX > bounds.right - 32) e.currentTarget.scrollBy(16, 0)
      }} className="flex min-w-0 items-end gap-1 overflow-x-auto [scrollbar-width:none]">
        {state.tabs.map((tab, index) => {
          const group = state.groups.find((g) => g.id === tab.groupId)
          if (!group) return renderTab(tab)
          if (state.tabs.findIndex((t) => t.groupId === group.id) !== index) return null
          const color = GROUP_COLORS[group.color]
          const members = state.tabs.filter((t) => t.groupId === group.id)
          const previous = state.tabs[index - 1]
          const nextIndex = state.tabs.findLastIndex((t) => t.groupId === group.id) + 1
          const next = state.tabs[nextIndex]
          const afterNext = next?.groupId ? state.tabs.findLastIndex((t) => t.groupId === next.groupId) + 1 : nextIndex + 1
          return (
            <div key={group.id} role="group" aria-label={`${group.name} tab group`} onDragOver={(e) => overGroup(e, group)} onDrop={drop} className={cn("flex shrink-0 items-end gap-1 border-b-2", dropTarget?.indicator === `group:${group.id}` && "rounded outline-2 outline-offset-2", dragging?.kind === "group" && dragging.id === group.id && "opacity-50")} style={{ borderColor: color, outlineColor: color }}>
              <Popover.Root open={editing === group.id} onOpenChange={(open) => setEditing(open ? group.id : null)}>
                <div className="mb-1 flex items-center gap-0.5 rounded-md" style={{ backgroundColor: `${color}22`, color }} onContextMenu={(e) => { e.preventDefault(); setEditing(group.id) }}>
                  <button type="button" draggable onDragStart={(e) => startDrag(e, { kind: "group", id: group.id })} aria-label={`${group.collapsed ? "Expand" : "Collapse"} ${group.name} group`} aria-expanded={!group.collapsed} onClick={() => update((s) => toggleGroup(s, group.id))} className="flex max-w-40 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold hover:bg-white/10">
                    {group.collapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}<span className="truncate">{group.name}</span><span className="opacity-70">{members.length}</span>
                  </button>
                  <Popover.Trigger aria-label={`Edit ${group.name} group`} title="Edit group" className="mr-1 rounded p-0.5 hover:bg-white/10"><MoreHorizontal className="size-3" /></Popover.Trigger>
                </div>
                <Popover.Portal>
                  <Popover.Positioner side="bottom" align="start" sideOffset={6} className="z-50">
                    <Popover.Popup className="outline-none">
                      <GroupEditor group={group} onClose={() => setEditing(null)} onSave={(name, nextColor) => update((s) => ({ ...s, groups: s.groups.map((g) => g.id === group.id ? { ...g, name, color: nextColor } : g) }))} onUngroup={() => update((s) => ungroup(s, group.id))} onMoveLeft={previous ? () => update((s) => moveGroup(s, group.id, previous.id)) : undefined} onMoveRight={next ? () => update((s) => moveGroup(s, group.id, state.tabs[afterNext]?.id ?? null)) : undefined} />
                    </Popover.Popup>
                  </Popover.Positioner>
                </Popover.Portal>
              </Popover.Root>
              {!group.collapsed && members.map(renderTab)}
            </div>
          )
        })}
      </div>
      <button type="button" onClick={() => update((s) => { const tab = newTab(); return { ...s, tabs: [...s.tabs, tab], active: tab.id } })} aria-label="New tab" className="mb-1.5 rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"><Plus className="size-4" /></button>
      <div data-tab-drop-end onDragOver={(e) => targetDrag(e, { beforeId: null, indicator: "end" })} onDrop={drop} className={cn("mb-1 flex h-8 min-w-12 flex-1 items-center justify-center overflow-hidden rounded px-2 text-xs whitespace-nowrap", dragging && "border border-dashed text-muted-foreground", dropTarget?.indicator === "end" && "border-link bg-ring/15 text-link")}>
        {dragging && (dragging.kind === "group" ? "Move group to end" : "Drop outside groups")}
      </div>
    </header>
  )
}

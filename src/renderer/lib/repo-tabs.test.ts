import assert from "node:assert/strict"
import { test } from "node:test"
import { closeTab, loadTabState, moveGroup, moveTab, openGroup, toggleGroup, ungroup, type TabState } from "./repo-tabs.ts"

const fixture = (): TabState => ({
  tabs: [
    { id: "a", repo: "/alpha", base: "master", groupId: "work" },
    { id: "b", repo: "/beta", base: "master" },
    { id: "c", repo: "/gamma", base: "master", groupId: "other" },
  ],
  active: "a",
  groups: [
    { id: "work", name: "Work", color: "blue", collapsed: false },
    { id: "other", name: "Other", color: "green", collapsed: false },
  ],
})

test("restores old tabs and persists group names, colors and collapsed state", () => {
  const old = loadTabState(JSON.stringify({ tabs: [{ id: "a", repo: "/alpha", base: "main", branch: "feature" }], active: "a" }))
  assert.deepEqual(old.groups, [])
  assert.equal(old.tabs[0].branch, "feature")
  const state = fixture()
  state.groups[1].collapsed = true
  assert.deepEqual(loadTabState(JSON.stringify(state)), state)
  assert.equal(loadTabState(null, JSON.stringify({ repo: "/legacy", base: "main" })).tabs[0].repo, "/legacy")
  const fallback = loadTabState('{"tabs":[{}],"groups":[{}]}')
  assert.equal(fallback.tabs.length, 1)
  assert.equal(fallback.active, fallback.tabs[0].id)
})

test("moving tabs keeps groups together and drops empty groups", () => {
  let state = moveTab(fixture(), "c", "work")
  assert.deepEqual(state.tabs.map((t) => t.id), ["a", "c", "b"])
  assert.deepEqual(state.groups.map((g) => g.id), ["work"])
  assert.equal(state.active, "a")
  state = moveTab(state, "a")
  assert.deepEqual(state.tabs.map((t) => t.id), ["c", "a", "b"])
  assert.equal(state.tabs[1].groupId, undefined)
  assert.equal(moveTab(state, "missing", "work"), state)
  assert.equal(moveTab(state, "b", "missing"), state)
})

test("creating a group from a middle tab keeps the source group contiguous", () => {
  const state = fixture()
  state.tabs = state.tabs.map((t) => ({ ...t, groupId: "work" }))
  state.groups[1] = { id: "new", name: "New", color: "pink", collapsed: false }
  const result = moveTab(state, "b", "new")
  assert.deepEqual(result.tabs.map((t) => [t.id, t.groupId]), [["a", "work"], ["c", "work"], ["b", "new"]])
})

test("collapsing the active group selects an outside tab and expanding preserves selection", () => {
  const collapsed = toggleGroup(fixture(), "work")
  assert.equal(collapsed.active, "b")
  assert.equal(collapsed.groups[0].collapsed, true)
  const expanded = toggleGroup(collapsed, "work")
  assert.equal(expanded.active, "b")
  assert.equal(expanded.groups[0].collapsed, false)
  const only = fixture()
  only.tabs = [only.tabs[0]]
  only.groups = [only.groups[0]]
  const result = toggleGroup(only, "work")
  assert.equal(result.tabs.length, 2)
  assert.equal(result.active, result.tabs[1].id)
  assert.equal(result.tabs[1].groupId, undefined)
})

test("closing selects a visible neighbor and removes the last tab's group", () => {
  const state = fixture()
  state.groups[1].collapsed = true
  state.active = "b"
  const result = closeTab(state, "b")
  assert.equal(result.active, "a")
  const remaining = closeTab(closeTab(result, "a"), "c")
  assert.equal(remaining.tabs.length, 1)
  assert.equal(remaining.tabs[0].id, remaining.active)
  assert.deepEqual(remaining.groups, [])
  const expanded = closeTab({ ...state, tabs: state.tabs.slice(1) }, "b")
  assert.equal(expanded.active, "c")
  assert.equal(expanded.groups[0].collapsed, false)
})

test("ungrouping keeps every repository tab and its active selection", () => {
  const before = moveTab(fixture(), "b", "work")
  const result = ungroup(before, "work")
  assert.deepEqual(result.tabs.map((t) => [t.id, t.repo]), before.tabs.map((t) => [t.id, t.repo]))
  assert.equal(result.tabs.find((t) => t.id === "a")?.groupId, undefined)
  assert.equal(result.active, "a")
  assert.deepEqual(result.groups.map((g) => g.id), ["other"])
})

test("dropping a tab joins a group at the drop position and can leave it at the end", () => {
  let state = moveTab(fixture(), "b", "work", "a")
  assert.deepEqual(state.tabs.map((t) => [t.id, t.groupId]), [["b", "work"], ["a", "work"], ["c", "other"]])
  state = moveTab(state, "a", undefined, null)
  assert.deepEqual(state.tabs.map((t) => [t.id, t.groupId]), [["b", "work"], ["c", "other"], ["a", undefined]])
  assert.equal(state.active, "a")
})

test("dropping reorders within a group and expands a collapsed destination", () => {
  const state = moveTab(fixture(), "b", "work")
  assert.deepEqual(moveTab(state, "b", "work", "a").tabs.map((t) => t.id), ["b", "a", "c"])
  state.groups[1].collapsed = true
  const joined = moveTab(state, "a", "other", "c")
  assert.equal(joined.groups.find((g) => g.id === "other")?.collapsed, false)
  assert.deepEqual(joined.tabs.map((t) => t.id), ["b", "a", "c"])
  assert.equal(moveTab(state, "a", "work", "a"), state)
  assert.equal(moveTab(state, "a", "work", "missing"), state)
})

test("an adjacent tab can join a group without changing its position", () => {
  const result = moveTab(fixture(), "b", "work", "b")
  assert.deepEqual(result.tabs.map((t) => [t.id, t.groupId]), [["a", "work"], ["b", "work"], ["c", "other"]])
})

test("a drop outside a group never splits its remaining members", () => {
  let state = moveTab(fixture(), "b", "work")
  state = moveTab(state, "c", undefined, "b")
  assert.deepEqual(state.tabs.map((t) => [t.id, t.groupId]), [["c", undefined], ["a", "work"], ["b", "work"]])
  assert.deepEqual(state.groups.map((g) => g.id), ["work"])
})

test("dragging a group moves its tabs together without changing membership or selection", () => {
  const state = moveTab(fixture(), "b", "work")
  const result = moveGroup(state, "work", null)
  assert.deepEqual(result.tabs.map((t) => [t.id, t.groupId]), [["c", "other"], ["a", "work"], ["b", "work"]])
  assert.deepEqual(result.groups, state.groups)
  assert.equal(result.active, state.active)
  assert.deepEqual(moveGroup(result, "work", "c").tabs.map((t) => t.id), ["a", "b", "c"])
  assert.equal(moveGroup(result, "work", "a"), result)
  assert.equal(moveGroup(result, "missing", null), result)
  assert.equal(moveGroup(result, "work", "missing"), result)
})

test("openGroup groups new and already-open repos under one name and reuses it", () => {
  const blank = loadTabState(null)
  const opened = openGroup(blank, "#15650 header gap", [{ repo: "/fe", base: "master" }, { repo: "/be", base: "develop" }])
  assert.deepEqual(opened.tabs.map((t) => [t.repo, t.base]), [["/fe", "master"], ["/be", "develop"]])
  assert.equal(opened.groups.length, 1)
  assert.ok(opened.tabs.every((t) => t.groupId === opened.groups[0].id))
  assert.equal(opened.active, opened.tabs[0].id)

  const again = openGroup(opened, "#15650 header gap", [{ repo: "/be", base: "develop" }, { repo: "/infra", base: "main" }])
  assert.equal(again.groups.length, 1)
  assert.deepEqual(again.tabs.map((t) => t.repo), ["/fe", "/be", "/infra"])

  const moved = openGroup(fixture(), "New", [{ repo: "/beta", base: "master" }])
  assert.equal(moved.tabs.length, 3)
  assert.equal(moved.tabs.find((t) => t.repo === "/beta")?.groupId, moved.groups.find((g) => g.name === "New")?.id)
  assert.equal(moved.groups.find((g) => g.name === "New")?.color, "purple")
})

test("openGroup moves an open tab to an explicit base under a new id, and keeps it otherwise", () => {
  const kept = openGroup(fixture(), "Work", [{ repo: "/alpha", base: "develop" }])
  assert.equal(kept.tabs[0].id, "a")
  assert.equal(kept.tabs[0].base, "master")
  const rebased = openGroup(fixture(), "Work", [{ repo: "/alpha", base: "preview/kit", explicitBase: true }])
  assert.equal(rebased.tabs.length, 3)
  assert.equal(rebased.tabs[0].repo, "/alpha")
  assert.equal(rebased.tabs[0].base, "preview/kit")
  assert.notEqual(rebased.tabs[0].id, "a")
  assert.equal(rebased.active, rebased.tabs[0].id)
})

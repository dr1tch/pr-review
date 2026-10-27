import assert from "node:assert/strict"
import { test } from "node:test"
import { BUILTIN_REVIEWERS } from "../../shared/builtin-reviewers.ts"
import { reviewerGroups } from "./reviewers.ts"

test("reviewers are grouped by source once, keeping built-ins and personal names distinct", () => {
  const items = [...BUILTIN_REVIEWERS,
    { name: "code-reviewer", kind: "agent" as const, source: "user", description: "My private reviewer" },
    { name: "repo-skill", kind: "skill" as const, source: "project", description: "Local" },
    { name: "plugin:review", kind: "skill" as const, source: "plugin", description: "Installed" },
  ]
  const groups = reviewerGroups(items, "")
  assert.deepEqual(groups.map((g) => g.label), ["Built-in", "Your agents & skills", "Repository agents & skills", "Plugins"])
  assert.equal(groups.flatMap((g) => g.items).length, items.length)
  assert.equal(new Set(items.map((r) => `${r.kind}:${r.name}`)).size, items.length)
  assert.deepEqual(reviewerGroups(items, "private").map((g) => g.label), ["Your agents & skills"])
  assert.deepEqual(reviewerGroups(items, "no matches"), [])
})

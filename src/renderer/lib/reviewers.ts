import type { Reviewer } from "../../shared/types"

export function reviewerGroups(reviewers: Reviewer[], query: string) {
  const q = query.toLowerCase()
  const match = reviewers.filter((r) => `${r.name} ${r.description}`.toLowerCase().includes(q))
  return [
    { label: "Built-in", items: match.filter((r) => r.source === "builtin") },
    { label: "Your agents & skills", items: match.filter((r) => r.source === "user") },
    { label: "Repository agents & skills", items: match.filter((r) => r.source === "project") },
    { label: "Plugins", items: match.filter((r) => !["builtin", "user", "project"].includes(r.source)) },
  ].filter((g) => g.items.length)
}

import type { Reviewer } from "./types"

export const BUILTIN_REVIEWERS: Reviewer[] = [
  { name: "builtin:code-reviewer", kind: "agent", source: "builtin", description: "Bugs, regressions, security, and failure handling." },
  { name: "builtin:frontend-reviewer", kind: "agent", source: "builtin", description: "Components, state, accessibility, and UI behavior." },
  { name: "builtin:backend-reviewer", kind: "agent", source: "builtin", description: "API contracts, permissions, migrations, and concurrency." },
  { name: "builtin:code-health-reviewer", kind: "agent", source: "builtin", description: "Duplication, unnecessary complexity, and existing code to reuse." },
]

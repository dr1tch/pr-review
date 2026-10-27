import code from "./agents/code-reviewer.md?raw"
import frontend from "./agents/frontend-reviewer.md?raw"
import backend from "./agents/backend-reviewer.md?raw"
import health from "./agents/code-health-reviewer.md?raw"

export const BUILTIN_INSTRUCTIONS: Record<string, string> = {
  "builtin:code-reviewer": code,
  "builtin:frontend-reviewer": frontend,
  "builtin:backend-reviewer": backend,
  "builtin:code-health-reviewer": health,
}

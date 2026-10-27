export type OpenRequest = { group: string; repos: { path: string; base?: string }[] }
export type OpenGroup = { group: string; repos: { repo: string; base: string; explicitBase?: boolean }[] }

// `pr-review --group="<name>" --repo=<path>[::<base>] [--repo=...]` opens the repos as one named tab group.
// `::<base>` diffs that tab against <base> instead of the default branch; git refs never contain ":".
// Only `--key=value` switches: Chromium reorders a second instance's argv, splitting `--group <name>`.
export function parseOpenArgs(argv: string[]): OpenRequest | null {
  const values = (key: string) => argv.filter((a) => a.startsWith(`--${key}=`)).map((a) => a.slice(key.length + 3).trim()).filter(Boolean)
  const group = values("group")[0]
  const repos = values("repo").map((value) => {
    const at = value.lastIndexOf("::")
    const base = at < 0 ? "" : value.slice(at + 2).trim()
    return base ? { path: value.slice(0, at), base } : { path: at < 0 ? value : value.slice(0, at) }
  })
  return group && repos.length ? { group, repos } : null
}

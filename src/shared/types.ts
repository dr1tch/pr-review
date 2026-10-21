import type parseDiff from "parse-diff"

export type Side = "old" | "new"
export type Severity = "critical" | "major" | "minor" | "nit"

export type ReviewComment = {
  id: string
  file: string | null // null = PR-level comment
  side: Side | null
  line: number | null
  body: string
  author: string // "You" or agent name
  severity: Severity | null
  createdAt: string
}

export type NewComment = Pick<ReviewComment, "file" | "side" | "line" | "body">

export type Commit = { sha: string; subject: string; body: string; author: string; email: string; avatar: string | null; date: string }

export type ChangedFile = parseDiff.File & { omitted?: string }

export type PullRequest = {
  repo: string
  branch: string
  base: string
  title: string
  body: string
  url: string | null // GitHub PR, when `gh` finds one for the branch
  number: number | null
  author: { name: string; avatar: string | null }
  commits: Commit[]
  files: ChangedFile[] // since the merge-base, uncommitted work included
  uncommitted: ChangedFile[] // working tree vs HEAD, untracked files included
  fetchError?: string
}

export type NewPullRequest = {
  base: string
  title: string
  body: string
  draft: boolean
  reviewers: string[]
  assignees: string[]
  labels: string[]
  milestone: string | null
}

export type PrMeta = {
  labels: { name: string; color: string }[]
  users: string[]
  milestones: string[]
  me: string | null // the logged-in gh user
  template: string | null // the repo's pull request template
}

export type ReviewerKind = "agent" | "skill"

// A Claude Code agent or skill that can review the PR; plugin ones are namespaced "plugin:name".
export type Reviewer = { name: string; description: string; kind: ReviewerKind; source: string }

export type AgentRun = {
  id: string
  agent: string // reviewer name
  kind: ReviewerKind
  repo: string
  branch: string
  status: "running" | "done" | "error" | "cancelled"
  startedAt: string
  finishedAt: string | null
  error: string | null
  costUsd: number | null
}

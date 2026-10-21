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

export type PullRequest = {
  repo: string
  branch: string
  base: string
  commits: { sha: string; subject: string; author: string; date: string }[]
  files: parseDiff.File[]
  fetchError?: string
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

import { DatabaseSync } from "node:sqlite"
import type { AgentRun, NewComment, ReviewComment } from "@shared/types"

let db: DatabaseSync

export function openDb(file: string) {
  db = new DatabaseSync(file)
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      repo TEXT NOT NULL,
      branch TEXT NOT NULL,
      file TEXT,
      side TEXT CHECK (side IN ('old', 'new')),
      line INTEGER,
      body TEXT NOT NULL,
      author TEXT NOT NULL,
      severity TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS comments_by_pr ON comments (repo, branch);
    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      repo TEXT NOT NULL,
      branch TEXT NOT NULL,
      agent TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      error TEXT,
      cost_usd REAL,
      output TEXT
    );
    CREATE INDEX IF NOT EXISTS runs_by_repo ON agent_runs (repo, started_at);
  `)
  // added after the first release: runs can be skills too
  const cols = db.prepare(`PRAGMA table_info(agent_runs)`).all() as { name: string }[]
  if (!cols.some((c) => c.name === "kind")) db.exec(`ALTER TABLE agent_runs ADD COLUMN kind TEXT NOT NULL DEFAULT 'agent'`)
  // A run can't survive the app closing; don't leave it spinning forever.
  db.prepare(`UPDATE agent_runs SET status = 'error', error = 'Interrupted: app was closed', finished_at = ? WHERE status = 'running'`)
    .run(new Date().toISOString())
}

type CommentRow = Record<"id" | "file" | "side" | "body" | "author" | "severity" | "created_at", string> & { line: number | null }

const toComment = (r: CommentRow): ReviewComment => ({
  id: r.id, file: r.file, side: r.side as ReviewComment["side"], line: r.line, body: r.body,
  author: r.author, severity: r.severity as ReviewComment["severity"], createdAt: r.created_at,
})

export function listComments(repo: string, branch: string) {
  const rows = db.prepare(`SELECT * FROM comments WHERE repo = ? AND branch = ? ORDER BY created_at, rowid`).all(repo, branch)
  return (rows as CommentRow[]).map(toComment)
}

export function addComments(repo: string, branch: string, author: string, items: (NewComment & Pick<ReviewComment, "severity">)[]) {
  const insert = db.prepare(`INSERT INTO comments (id, repo, branch, file, side, line, body, author, severity, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  const now = new Date().toISOString()
  const added: ReviewComment[] = []
  db.exec("BEGIN")
  try {
    for (const c of items) {
      const row: ReviewComment = { id: crypto.randomUUID(), file: c.file, side: c.side, line: c.line, body: c.body, author, severity: c.severity, createdAt: now }
      insert.run(row.id, repo, branch, row.file, row.side, row.line, row.body, author, row.severity, now)
      added.push(row)
    }
    db.exec("COMMIT")
  } catch (e) {
    db.exec("ROLLBACK")
    throw e
  }
  return added
}

export function deleteComment(id: string) {
  db.prepare(`DELETE FROM comments WHERE id = ?`).run(id)
}

type RunRow = Record<"id" | "repo" | "branch" | "agent" | "kind" | "status" | "started_at", string> &
  Record<"finished_at" | "error", string | null> & { cost_usd: number | null }

export function listRuns(repo: string): AgentRun[] {
  const rows = db.prepare(`SELECT * FROM agent_runs WHERE repo = ? ORDER BY started_at DESC LIMIT 50`).all(repo) as RunRow[]
  return rows.map((r) => ({
    id: r.id, repo: r.repo, branch: r.branch, agent: r.agent, kind: r.kind as AgentRun["kind"], status: r.status as AgentRun["status"],
    startedAt: r.started_at, finishedAt: r.finished_at, error: r.error, costUsd: r.cost_usd,
  }))
}

export function insertRun(run: AgentRun) {
  db.prepare(`INSERT INTO agent_runs (id, repo, branch, agent, kind, status, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(run.id, run.repo, run.branch, run.agent, run.kind, run.status, run.startedAt)
}

export function finishRun(id: string, f: { status: Exclude<AgentRun["status"], "running">; error?: string; costUsd?: number; output?: string }) {
  db.prepare(`UPDATE agent_runs SET status = ?, error = ?, cost_usd = ?, output = ?, finished_at = ? WHERE id = ?`)
    .run(f.status, f.error ?? null, f.costUsd ?? null, f.output ?? null, new Date().toISOString(), id)
}

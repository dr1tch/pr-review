import { useCallback, useEffect, useState } from "react"
import { AlertCircle, Check, CircleSlash, CircleX, FileDiff, FolderOpen, GitCommitHorizontal, GitPullRequest, Loader2, MessageSquare, Play, RefreshCw, X } from "lucide-react"
import { Avatar, Composer, TimelineComment } from "@/components/comments"
import { FilesChanged } from "@/components/files-changed"
import { ReviewMenu } from "@/components/review-menu"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { duration, timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { AgentRun, NewComment, PullRequest, Reviewer, ReviewComment } from "@shared/types"

type Tab = "conversation" | "commits" | "files"

function Ref({ children }: { children: string }) {
  return <code className="rounded-md bg-ring/15 px-1.5 py-0.5 font-mono text-xs text-link">{children}</code>
}

function Counter({ n }: { n: number }) {
  return <span className="rounded-full bg-counter px-1.5 text-xs leading-[18px] font-medium text-foreground">{n}</span>
}

function RunStatus({ run }: { run: AgentRun | undefined }) {
  if (!run) return null
  if (run.status === "running") return <Loader2 className="size-4 animate-spin text-attention" aria-label="Running" />
  if (run.status === "done") return <Check className="size-4 text-success" aria-label="Done" />
  if (run.status === "cancelled") return <CircleSlash className="size-4 text-muted-foreground" aria-label="Cancelled" />
  return <CircleX className="size-4 text-danger" aria-label="Failed" />
}

// Re-render every second while something is running, for the elapsed timers.
function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])
  return now
}

type Props = {
  repo: string
  base: string
  hidden: boolean
  onOpen: (repo: string, base: string) => void // tab now points at this repo/base
}

// One repository tab: its PR diff, comments and reviewer runs. Stays mounted while hidden so runs keep updating.
export function RepoView({ repo: initialRepo, base: initialBase, hidden, onOpen }: Props) {
  const [repo, setRepo] = useState(initialRepo)
  const [base, setBase] = useState(initialBase)
  const [pr, setPr] = useState<PullRequest | null>(null)
  const [comments, setComments] = useState<ReviewComment[]>([])
  const [reviewers, setReviewers] = useState<Reviewer[]>([])
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [tab, setTab] = useState<Tab>("files")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (repoPath: string, baseRef: string, fetch = false) => {
    if (!repoPath) return
    setLoading(true)
    setError(null)
    try {
      const [p, c, a] = await Promise.all([window.api.loadPr(repoPath, baseRef, fetch), window.api.listComments(repoPath), window.api.listReviewers(repoPath)])
      setPr(p)
      setComments(c)
      setReviewers(a.reviewers)
      setRuns(a.runs)
      onOpen(p.repo, baseRef)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [onOpen])

  useEffect(() => {
    if (initialRepo) load(initialRepo, initialBase)
    // only on mount: later loads come from the toolbar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The main process pushes an event when an agent run finishes; refresh runs and its comments.
  useEffect(() => {
    if (!pr) return
    return window.api.onRunsChanged((changed) => {
      if (changed !== pr.repo) return
      window.api.listReviewers(pr.repo).then((a) => setRuns(a.runs), () => {})
      window.api.listComments(pr.repo).then(setComments, () => {})
    })
  }, [pr])

  const branchRuns = runs.filter((r) => r.branch === pr?.branch)
  const running = branchRuns.some((r) => r.status === "running")
  const latestPerReviewer = branchRuns.filter((r, i) => branchRuns.findIndex((x) => x.agent === r.agent && x.kind === r.kind) === i)
  const now = useNow(running)

  const pick = async () => {
    const path = await window.api.pickRepo()
    if (path) {
      setRepo(path)
      load(path, base)
    }
  }

  const cancel = async (id: string) => {
    try {
      await window.api.cancelReview(id)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const run = async (reviewer: Pick<Reviewer, "name" | "kind">) => {
    try {
      const r = await window.api.runReviewer(pr!.repo, pr!.base, reviewer.name, reviewer.kind)
      setRuns((rs) => [r, ...rs])
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const add = async (c: NewComment) => {
    try {
      const saved = await window.api.addComment(pr!.repo, c)
      setComments((cs) => [...cs, saved])
    } catch (e) {
      setError((e as Error).message)
      throw e
    }
  }

  const remove = async (id: string) => {
    try {
      await window.api.deleteComment(id)
      setComments((cs) => cs.filter((c) => c.id !== id))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const prComments = comments.filter((c) => !c.file)
  const TABS: { id: Tab; label: string; icon: React.ReactNode; count: number }[] = pr
    ? [
        { id: "conversation", label: "Conversation", icon: <MessageSquare className="size-4" />, count: prComments.length },
        { id: "commits", label: "Commits", icon: <GitCommitHorizontal className="size-4" />, count: pr.commits.length },
        { id: "files", label: "Files changed", icon: <FileDiff className="size-4" />, count: pr.files.length },
      ]
    : []

  return (
    <div className={cn("min-h-0 flex-1 flex-col", hidden ? "hidden" : "flex")}>
      <div className="flex h-11 shrink-0 items-center gap-3 border-b px-4">
        {pr && <span className="min-w-0 truncate font-mono text-xs text-muted-foreground" title={pr.repo}>{pr.repo}</span>}
        <form
          className="ml-auto flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            load(repo, base, true)
          }}
        >
          <Button type="button" variant="outline" size="sm" onClick={pick}>
            <FolderOpen /> Open repository
          </Button>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            base
            <Input value={base} onChange={(e) => setBase(e.target.value)} aria-label="Base branch" className="h-7 w-32 rounded-md bg-background font-mono text-xs dark:bg-background" />
          </label>
          <Button type="submit" variant="outline" size="icon-sm" disabled={loading || !repo} aria-label="Fetch origin and reload" title="Fetch origin and reload">
            {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          </Button>
        </form>
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto">
        {error && (
          <div role="alert" className="mx-6 mt-4 flex items-center gap-2 rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-danger">
            <AlertCircle className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">{error}</span>
            <Button variant="ghost" size="xs" onClick={() => setError(null)}>Dismiss</Button>
          </div>
        )}

        {pr?.fetchError && (
          <div role="status" className="mx-6 mt-4 flex items-center gap-2 rounded-md border border-attention/40 bg-attention/10 px-4 py-2 text-attention">
            <AlertCircle className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">Couldn't fetch origin, showing the last fetched {pr.base}: {pr.fetchError}</span>
          </div>
        )}

        {!pr ? (
          <div className="flex flex-col items-center justify-center gap-4 pt-40 text-center">
            <GitPullRequest className="size-12 text-muted-foreground" />
            <h1 className="text-2xl font-semibold">Review a branch like a pull request</h1>
            <p className="text-muted-foreground">Open a local git repository. The diff is HEAD against the base branch.</p>
            <Button onClick={pick}>
              <FolderOpen /> Open repository
            </Button>
          </div>
        ) : (
          <div className="px-6">
            <div className="pt-6">
              <h1 className="text-[32px] leading-tight font-normal">
                {pr.commits[0]?.subject ?? pr.branch} <span className="font-light text-muted-foreground">{pr.branch}</span>
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-muted-foreground">
                <span className="flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-sm font-medium text-white">
                  <GitPullRequest className="size-4" /> Open
                </span>
                <span>
                  wants to merge {pr.commits.length} commit{pr.commits.length === 1 ? "" : "s"} into <Ref>{pr.base}</Ref> from <Ref>{pr.branch}</Ref>
                </span>
              </div>
            </div>

            <div role="tablist" className="sticky top-0 z-20 mt-4 flex gap-2 border-b bg-background">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  type="button"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5",
                    tab === t.id ? "border-tab-active font-semibold" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.icon}
                  {t.label}
                  <Counter n={t.count} />
                </button>
              ))}
              <div className="ml-auto self-center">
                <ReviewMenu reviewers={reviewers} runs={branchRuns} onRun={run} onCancel={cancel} />
              </div>
            </div>

            {tab === "conversation" && (
              <div className="flex items-start gap-8 py-6">
                <div className="min-w-0 flex-1 space-y-4">
                  {prComments.length === 0 && <p className="text-muted-foreground">No comments yet. Run an agent reviewer or leave a comment.</p>}
                  {prComments.map((c) => (
                    <TimelineComment key={c.id} c={c} onDelete={() => remove(c.id)} />
                  ))}
                  <div className="flex gap-4 border-t pt-4">
                    <Avatar author="You" />
                    <div className="min-w-0 flex-1">
                      <Composer onSubmit={(body) => add({ file: null, side: null, line: null, body })} />
                    </div>
                  </div>
                </div>

                <aside className="w-[296px] shrink-0 text-xs">
                  <h2 className="mb-2 font-semibold text-muted-foreground">Reviewers</h2>
                  <ul className="space-y-1 border-b pb-4">
                    {latestPerReviewer.map((last) => (
                      <li key={`${last.kind}:${last.agent}`} className="flex items-center gap-2">
                        <Avatar author={last.agent} size={20} />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={`${last.kind}: ${last.agent}`}>{last.agent}</span>
                        <RunStatus run={last} />
                        {last.status === "running" ? (
                          <Button size="xs" variant="outline" onClick={() => cancel(last.id)} aria-label={`Cancel ${last.agent}`}>
                            <X /> Cancel
                          </Button>
                        ) : (
                          <Button size="xs" variant="outline" onClick={() => run({ name: last.agent, kind: last.kind })} aria-label={`Re-run ${last.agent}`}>
                            <Play /> Re-run
                          </Button>
                        )}
                      </li>
                    ))}
                    {latestPerReviewer.length === 0 && <li className="text-muted-foreground">No reviews yet. Use “Review with…” to run an agent or skill.</li>}
                  </ul>

                  <h2 className="mt-4 mb-2 font-semibold text-muted-foreground">Runs</h2>
                  <ul className="space-y-2">
                    {branchRuns.length === 0 && <li className="text-muted-foreground">None yet</li>}
                    {branchRuns.map((r) => (
                      <li key={r.id}>
                        <div className="flex items-center gap-2">
                          <RunStatus run={r} />
                          <span className="min-w-0 flex-1 truncate">{r.agent}</span>
                          <span className="text-muted-foreground tabular-nums" title={new Date(r.startedAt).toLocaleString()}>
                            {r.status === "running" ? duration(r.startedAt, null, now) : `${timeAgo(r.startedAt)} · ${duration(r.startedAt, r.finishedAt)}`}
                          </span>
                        </div>
                        {r.costUsd != null && <p className="pl-6 text-muted-foreground">${r.costUsd.toFixed(2)}</p>}
                        {r.error && r.status === "error" && <p className="line-clamp-3 pl-6 text-danger" title={r.error}>{r.error}</p>}
                      </li>
                    ))}
                  </ul>
                </aside>
              </div>
            )}

            {tab === "commits" && (
              <ul className="my-6 divide-y rounded-md border">
                {pr.commits.map((c) => (
                  <li key={c.sha} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{c.subject}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.author} committed {timeAgo(c.date)}
                      </p>
                    </div>
                    <code className="font-mono text-xs text-muted-foreground">{c.sha}</code>
                  </li>
                ))}
                {pr.commits.length === 0 && <li className="px-4 py-3 text-muted-foreground">No commits ahead of {pr.base}.</li>}
              </ul>
            )}

            {tab === "files" && (
              <FilesChanged
                files={pr.files}
                comments={comments}
                onAdd={(file, anchor, body) => add({ file, ...anchor, body })}
                onDelete={remove}
              />
            )}
          </div>
        )}
      </main>
    </div>
  )
}

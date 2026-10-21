import { useCallback, useEffect, useState } from "react"
import { AlertCircle, Check, CircleSlash, CircleX, FileDiff, FilePen, FolderOpen, GitCommitHorizontal, GitPullRequest, Loader2, MessageSquare, Play, RefreshCw, X } from "lucide-react"
import { Avatar, Composer, TimelineComment, UserAvatar } from "@/components/comments"
import { Markdown } from "@/components/markdown"
import { FilesChanged } from "@/components/files-changed"
import { ReviewMenu } from "@/components/review-menu"
import { CreatePr } from "@/components/create-pr"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { duration, timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { AgentRun, Commit, NewComment, PullRequest, Reviewer, ReviewComment } from "@shared/types"

type Tab = "conversation" | "commits" | "files"

// pseudo-commit id for the working tree in the commit picker (real ids are hex)
const WORKING = "working"

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

// Commits grouped by calendar day, newest first, like GitHub's commits tab.
function byDay(commits: Commit[]) {
  const days = new Map<string, Commit[]>()
  for (const c of commits) {
    const day = new Date(c.date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    days.set(day, [...(days.get(day) ?? []), c])
  }
  return [...days]
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
  const [commit, setCommit] = useState<{ sha: string; files: PullRequest["files"] } | null>(null) // Files changed limited to one commit

  const load = useCallback(async (repoPath: string, baseRef: string, fetch = false) => {
    if (!repoPath) return
    setLoading(true)
    setError(null)
    try {
      const [p, c, a] = await Promise.all([window.api.loadPr(repoPath, baseRef, fetch), window.api.listComments(repoPath), window.api.listReviewers(repoPath)])
      setPr(p)
      setCommit(null)
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

  const showCommit = async (sha: string | null) => {
    setTab("files")
    if (!sha) return setCommit(null)
    if (sha === WORKING) return setCommit({ sha, files: pr!.uncommitted })
    try {
      setCommit({ sha, files: await window.api.commitDiff(pr!.repo, sha) })
    } catch (e) {
      setError((e as Error).message)
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
                {pr.title}{" "}
                {pr.number != null && (
                  <a href={pr.url!} target="_blank" rel="noreferrer" className="font-light text-muted-foreground hover:text-link">#{pr.number}</a>
                )}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-muted-foreground">
                {pr.number != null ? (
                  <span className="flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-sm font-medium text-white">
                    <GitPullRequest className="size-4" /> Open
                  </span>
                ) : (
                  <span className="flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-medium" title="No GitHub pull request for this branch yet">
                    <GitPullRequest className="size-4" /> Local
                  </span>
                )}
                {pr.author.name && <UserAvatar name={pr.author.name} src={pr.author.avatar} size={20} />}
                <span>
                  {pr.author.name && <span className="font-semibold text-foreground">{pr.author.name} </span>}
                  wants to merge {pr.commits.length} commit{pr.commits.length === 1 ? "" : "s"} into <Ref>{pr.base}</Ref> from <Ref>{pr.branch}</Ref>
                </span>
                {pr.number == null && (
                  <Button size="sm" className="ml-auto" onClick={() => setTab("conversation")} disabled={pr.commits.length === 0} title={pr.commits.length === 0 ? `No commits ahead of ${pr.base}` : undefined}>
                    <GitPullRequest /> Create pull request
                  </Button>
                )}
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
                  {pr.number == null && pr.commits.length > 0 && (
                    <div className="flex gap-4">
                      <Avatar author="You" />
                      <div className="min-w-0 flex-1">
                        <CreatePr
                          pr={pr}
                          onCreated={(url) => {
                            window.open(url)
                            load(pr.repo, base)
                          }}
                        />
                      </div>
                    </div>
                  )}
                  {(pr.number != null || pr.commits.length === 0) && <div className="flex gap-4">
                    <UserAvatar name={pr.author.name || pr.branch} src={pr.author.avatar} />
                    <div className="min-w-0 flex-1 rounded-md border border-ring/50">
                      <div className="rounded-t-md border-b border-ring/50 bg-ring/10 px-4 py-2 text-muted-foreground">
                        <span className="font-semibold text-foreground">{pr.author.name || "Author"}</span> opened this {pr.url ? "pull request" : "branch"}
                      </div>
                      <div className="p-4">
                        {pr.body.trim() ? <Markdown>{pr.body}</Markdown> : <p className="text-muted-foreground italic">No description provided.</p>}
                      </div>
                    </div>
                  </div>}
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
              <div className="my-6 space-y-6">
                {pr.uncommitted.length > 0 && (
                  <button type="button" onClick={() => showCommit(WORKING)} className="flex w-full items-center gap-3 rounded-md border border-dashed px-4 py-3 text-left hover:bg-muted">
                    <FilePen className="size-4 text-attention" />
                    <span className="flex-1 font-semibold">Uncommitted changes</span>
                    <span className="text-xs text-muted-foreground">{pr.uncommitted.length} file{pr.uncommitted.length === 1 ? "" : "s"}</span>
                  </button>
                )}
                {byDay(pr.commits).map(([day, list]) => (
                  <section key={day}>
                    <h2 className="mb-2 flex items-center gap-2 text-muted-foreground">
                      <GitCommitHorizontal className="size-4" /> Commits on {day}
                    </h2>
                    <ul className="divide-y rounded-md border">
                      {list.map((c) => (
                        <li key={c.sha} className="flex items-center gap-3 px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <button type="button" onClick={() => showCommit(c.sha)} className="block max-w-full truncate text-left font-semibold hover:text-link hover:underline" title={c.body || c.subject}>
                              {c.subject}
                            </button>
                            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                              <UserAvatar name={c.author} src={c.avatar} size={16} />
                              <span className="font-semibold text-foreground" title={c.email}>{c.author}</span> committed {timeAgo(c.date)}
                            </p>
                          </div>
                          <button type="button" onClick={() => showCommit(c.sha)} className="rounded-md border px-2 py-0.5 font-mono text-xs text-muted-foreground hover:text-link" aria-label={`Show changes in ${c.sha}`}>
                            {c.sha}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
                {pr.commits.length === 0 && <p className="text-muted-foreground">No commits ahead of {pr.base}.</p>}
              </div>
            )}

            {tab === "files" && commit && (() => {
              if (commit.sha === WORKING) return (
                <div className="mt-4 flex items-center gap-2 rounded-md border border-dashed bg-muted px-4 py-2">
                  <FilePen className="size-4 text-attention" />
                  <span className="min-w-0 flex-1 font-semibold">Uncommitted changes</span>
                  <Button size="xs" variant="outline" onClick={() => showCommit(null)}>Show all changes</Button>
                </div>
              )
              const c = pr.commits.find((x) => x.sha === commit.sha)
              return c && (
                <div className="mt-4 flex items-center gap-2 rounded-md border bg-muted px-4 py-2">
                  <UserAvatar name={c.author} src={c.avatar} size={20} />
                  <span className="font-semibold" title={c.email}>{c.author}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground" title={c.body || c.subject}>{c.subject}</span>
                  <code className="font-mono text-xs text-muted-foreground">{c.sha}</code>
                  <Button size="xs" variant="outline" onClick={() => showCommit(null)}>Show all changes</Button>
                </div>
              )
            })()}
            {tab === "files" && (
              <FilesChanged
                key={commit?.sha ?? "all"}
                files={commit?.files ?? pr.files}
                // line comments anchor to the full PR diff, so a single commit is read-only
                comments={commit ? [] : comments}
                onAdd={commit ? undefined : (file, anchor, body) => add({ file, ...anchor, body })}
                onDelete={remove}
                toolbar={
                  <select
                    value={commit?.sha ?? ""}
                    onChange={(e) => showCommit(e.target.value || null)}
                    aria-label="Show changes from"
                    className="ml-auto h-7 max-w-80 truncate rounded-md border bg-muted px-2 text-xs text-foreground"
                  >
                    <option value="">All changes ({pr.commits.length} commit{pr.commits.length === 1 ? "" : "s"}{pr.uncommitted.length ? " + uncommitted" : ""})</option>
                    {pr.uncommitted.length > 0 && <option value={WORKING}>Uncommitted changes</option>}
                    {pr.commits.map((c) => (
                      <option key={c.sha} value={c.sha}>{c.sha} · {c.subject} · {c.author}</option>
                    ))}
                  </select>
                }
              />
            )}
          </div>
        )}
      </main>
    </div>
  )
}

import { contextBridge, ipcRenderer } from "electron"
import type { OpenGroup } from "@shared/open-args"
import type { PrDraft } from "@shared/pr-draft"
import type { AgentRun, NewComment, NewPullRequest, PrMeta, PullRequest, Reviewer, ReviewComment, ReviewerKind } from "@shared/types"

// ipcRenderer.invoke wraps errors as "Error invoking remote method 'x': Error: msg"; keep just msg.
const call = <T>(channel: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args).catch((e: Error) => {
    throw new Error(e.message.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, ""))
  })

const api = {
  pickRepo: () => call<string | null>("repo:pick"),
  loadPr: (repo: string, base: string, fetch = false) => call<PullRequest>("pr:load", repo, base, fetch),
  commitDiff: (repo: string, sha: string) => call<PullRequest["files"]>("pr:commit", repo, sha),
  currentBranch: (repo: string) => call<string>("repo:branch", repo),
  prMeta: (repo: string) => call<PrMeta>("pr:meta", repo),
  generatePrDraft: (repo: string, base: string, branch: string) => call<PrDraft>("pr:generate", repo, base, branch),
  createPr: (repo: string, p: NewPullRequest) => call<string>("pr:create", repo, p),
  listComments: (repo: string) => call<ReviewComment[]>("comments:list", repo),
  addComment: (repo: string, c: NewComment) => call<ReviewComment>("comments:add", repo, c),
  deleteComment: (id: string) => call<void>("comments:delete", id),
  listReviewers: (repo: string) => call<{ reviewers: Reviewer[]; runs: AgentRun[] }>("agents:list", repo),
  runReviewer: (repo: string, base: string, name: string, kind: ReviewerKind) => call<AgentRun>("agents:run", repo, base, name, kind),
  cancelReview: (id: string) => call<void>("agents:cancel", id),
  takeOpenRequests: () => call<OpenGroup[]>("open:take"),
  onOpenRequest: (cb: () => void) => {
    const listener = () => cb()
    ipcRenderer.on("open:pending", listener)
    return () => void ipcRenderer.removeListener("open:pending", listener)
  },
  onRunsChanged: (cb: (repo: string) => void) => {
    const listener = (_e: unknown, repo: string) => cb(repo)
    ipcRenderer.on("runs:changed", listener)
    return () => void ipcRenderer.removeListener("runs:changed", listener)
  },
}

export type Api = typeof api

contextBridge.exposeInMainWorld("api", api)

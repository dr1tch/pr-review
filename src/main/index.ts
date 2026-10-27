import { execFileSync } from "node:child_process"
import { join } from "node:path"
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron"
import type { NewComment, NewPullRequest, ReviewerKind } from "@shared/types"
import { parseOpenArgs, type OpenGroup, type OpenRequest } from "@shared/open-args"
import { cancelReview, listReviewers, startReview } from "./reviewers"
import { generatePrDraft } from "./pr-draft"
import { addComments, deleteComment, listComments, listRuns, openDb } from "./db"
import { commitDiff, createPullRequest, currentBranch, defaultBase, diffAgainst, getPullRequest, prMeta, resolveBase, resolveRepo } from "./git"

// Apps launched from a desktop menu don't get the shell's PATH, so `claude`/`git` from ~/.local/bin etc. go missing.
function loadShellPath() {
  if (process.platform === "win32") return
  try {
    const out = execFileSync(process.env.SHELL || "/bin/bash", ["-ilc", 'printf "__PATH__%s__PATH__" "$PATH"'], { encoding: "utf8", timeout: 5000 })
    const path = out.match(/__PATH__(.*)__PATH__/)?.[1]
    if (path) process.env.PATH = path
  } catch {
    // keep the inherited PATH
  }
}

let win: BrowserWindow | null = null

// Groups asked for on the command line wait here until the renderer takes them.
let pendingOpens: OpenGroup[] = []

async function queueOpen(req: OpenRequest | null) {
  if (!req) return
  const repos: OpenGroup["repos"] = []
  for (const { path, base } of req.repos) {
    try {
      const repo = await resolveRepo(path)
      repos.push(base ? { repo, base, explicitBase: true } : { repo, base: await defaultBase(repo) })
    } catch {
      // not a git repo: skip it, open the rest
    }
  }
  if (!repos.length) return
  pendingOpens.push({ group: req.group, repos })
  win?.webContents.send("open:pending")
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0d1117",
    title: "PR Review",
    autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, "../preload/index.js"), contextIsolation: true, sandbox: true },
  })
  // Links in review comments open in the real browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: "deny" }
  })
  win.webContents.on("will-navigate", (e, url) => {
    if (url !== win?.webContents.getURL()) e.preventDefault()
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, "../renderer/index.html"))
}

function registerIpc() {
  ipcMain.handle("open:take", () => pendingOpens.splice(0))
  ipcMain.handle("repo:pick", async () => {
    const r = await dialog.showOpenDialog(win!, { title: "Open repository", properties: ["openDirectory"] })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle("pr:load", async (_e, repoPath: string, base: string, fetch: boolean) => getPullRequest(await resolveRepo(repoPath), base, fetch === true))
  ipcMain.handle("repo:branch", async (_e, repoPath: string) => currentBranch(await resolveRepo(repoPath)))
  ipcMain.handle("pr:meta", async (_e, repoPath: string) => prMeta(await resolveRepo(repoPath)))
  ipcMain.handle("pr:generate", async (_e, repoPath: string, base: string, branch: string) => generatePrDraft(await resolveRepo(repoPath), base, branch))
  ipcMain.handle("pr:create", async (_e, repoPath: string, p: NewPullRequest) => createPullRequest(await resolveRepo(repoPath), p ?? ({} as NewPullRequest)))
  ipcMain.handle("pr:commit", async (_e, repoPath: string, sha: string) => commitDiff(await resolveRepo(repoPath), String(sha)))
  ipcMain.handle("comments:list", async (_e, repo: string) => {
    const top = await resolveRepo(repo)
    return listComments(top, await currentBranch(top))
  })
  ipcMain.handle("comments:add", async (_e, repo: string, c: NewComment) => {
    if (typeof c?.body !== "string" || !c.body.trim()) throw new Error("Comment is empty")
    const top = await resolveRepo(repo)
    const side = c.side === "old" || c.side === "new" ? c.side : null
    const line = Number.isInteger(c.line) ? c.line : null
    const file = typeof c.file === "string" ? c.file : null
    return addComments(top, await currentBranch(top), "You", [{ file, side, line, body: c.body, severity: null }])[0]
  })
  ipcMain.handle("comments:delete", (_e, id: string) => deleteComment(String(id)))
  ipcMain.handle("agents:list", async (_e, repo: string) => {
    const top = await resolveRepo(repo)
    return { reviewers: await listReviewers(top), runs: listRuns(top) }
  })
  ipcMain.handle("agents:cancel", (_e, id: string) => cancelReview(String(id)))
  ipcMain.handle("agents:run", async (_e, repo: string, base: string, name: string, kind: ReviewerKind) => {
    const top = await resolveRepo(repo)
    // only reviewers we discovered may be launched
    const reviewer = (await listReviewers(top)).find((r) => r.name === name && r.kind === kind)
    if (!reviewer) throw new Error(`Unknown ${kind}: ${name}`)
    const ref = await resolveBase(top, base)
    const diff = await diffAgainst(top, ref)
    return startReview(top, await currentBranch(top), ref, reviewer, diff, () => win?.webContents.send("runs:changed", top))
  })
}

// One app: a second launch hands its --group/--repo request to the running window and exits.
const primary = app.requestSingleInstanceLock()
if (!primary) app.quit()
app.on("second-instance", (_e, argv) => {
  if (win?.isMinimized()) win.restore()
  win?.focus()
  queueOpen(parseOpenArgs(argv))
})

if (primary) app.whenReady().then(() => {
  loadShellPath()
  openDb(join(app.getPath("userData"), "pr-review.db"))
  registerIpc()
  createWindow()
  queueOpen(parseOpenArgs(process.argv))
  app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})

app.on("window-all-closed", () => app.quit())

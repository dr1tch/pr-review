import { execFileSync } from "node:child_process"
import { join } from "node:path"
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron"
import type { NewComment, ReviewerKind } from "@shared/types"
import { cancelReview, listReviewers, startReview } from "./reviewers"
import { addComments, deleteComment, listComments, listRuns, openDb } from "./db"
import { currentBranch, diffAgainst, getPullRequest, resolveBase, resolveRepo } from "./git"

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
  ipcMain.handle("repo:pick", async () => {
    const r = await dialog.showOpenDialog(win!, { title: "Open repository", properties: ["openDirectory"] })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle("pr:load", async (_e, repoPath: string, base: string, fetch: boolean) => getPullRequest(await resolveRepo(repoPath), base, fetch === true))
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

app.whenReady().then(() => {
  loadShellPath()
  openDb(join(app.getPath("userData"), "pr-review.db"))
  registerIpc()
  createWindow()
  app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})

app.on("window-all-closed", () => app.quit())

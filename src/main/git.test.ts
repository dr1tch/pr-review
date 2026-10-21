import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { chmodSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { commitDiff, createPullRequest, diffAgainst, getPullRequest, loginFor } from "./git.ts"

const sh = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd })

test("oversized untracked files stay listed without loading their contents into diffs", async () => {
  const repo = mkdtempSync(join(tmpdir(), "pr-review-"))
  sh(repo, "init", "-q", "-b", "master")
  writeFileSync(join(repo, "base"), "base\n")
  sh(repo, "add", ".")
  sh(repo, "commit", "-qm", "base")
  const contents = "x".repeat(1024 * 1024 + 1)
  writeFileSync(join(repo, "large graph.json"), contents)
  writeFileSync(join(repo, "small.txt"), "still visible\n")
  if (process.platform !== "win32") symlinkSync("large graph.json", join(repo, "link.txt"))
  const pr = await getPullRequest(repo, "master")
  for (const files of [pr.files, pr.uncommitted]) {
    const large = files.find((f) => f.to === "large graph.json")
    assert.match(large?.omitted ?? "", /1 MiB/)
    assert.deepEqual(large?.chunks, [])
    assert.equal(large?.new, true)
    assert.equal(files.find((f) => f.to === "small.txt")?.additions, 1)
    if (process.platform !== "win32") assert.equal(files.find((f) => f.to === "link.txt")?.additions, 1)
  }
  const review = await diffAgainst(repo, "master")
  assert.ok(!review.includes(contents))
  assert.match(review, /large graph.json/)
  assert.match(review, /omitted/i)
  assert.equal(readFileSync(join(repo, "large graph.json"), "utf8"), contents)
})

test("rebased branch with a stale local master shows only its own changes", async () => {
  const root = mkdtempSync(join(tmpdir(), "pr-review-"))
  const remote = join(root, "remote"), clone = join(root, "clone")
  sh(root, "init", "-q", "-b", "master", remote)
  writeFileSync(join(remote, "a"), "a\n")
  sh(remote, "add", ".")
  sh(remote, "commit", "-qm", "base")
  sh(root, "clone", "-q", remote, clone)
  // someone else lands a commit on master
  writeFileSync(join(remote, "theirs"), "x\n")
  sh(remote, "add", ".")
  sh(remote, "commit", "-qm", "theirs")
  // our branch is rebased onto origin/master, local master stays stale
  sh(clone, "fetch", "-q")
  sh(clone, "checkout", "-qb", "feat", "origin/master")
  writeFileSync(join(clone, "mine"), "y\n")
  sh(clone, "add", ".")
  sh(clone, "commit", "-qm", "mine")

  const pr = await getPullRequest(clone, "master")
  assert.equal(pr.base, "origin/master")
  assert.deepEqual(pr.files.map((f) => f.to), ["mine"])
  assert.equal(pr.commits.length, 1)
  // an explicit remote ref is left alone
  assert.equal((await getPullRequest(clone, "origin/master")).base, "origin/master")

  // master moves again without a fetch; the branch is rebased onto it after fetching
  writeFileSync(join(remote, "later"), "z\n")
  sh(remote, "add", ".")
  sh(remote, "commit", "-qm", "later")
  sh(clone, "-c", "fetch.recurseSubmodules=false", "fetch", "-q")
  sh(clone, "rebase", "-q", "origin/master")
  sh(clone, "update-ref", "refs/remotes/origin/master", "HEAD~2") // simulate an origin/master that was never fetched
  assert.ok((await getPullRequest(clone, "master")).files.length > 1)
  const fetched = await getPullRequest(clone, "master", true)
  assert.equal(fetched.fetchError, undefined)
  assert.deepEqual(fetched.files.map((f) => f.to), ["mine"])
})

test("a failed fetch is reported, not thrown", async () => {
  const repo = mkdtempSync(join(tmpdir(), "pr-review-"))
  sh(repo, "init", "-q", "-b", "master")
  writeFileSync(join(repo, "a"), "a\n")
  sh(repo, "add", ".")
  sh(repo, "commit", "-qm", "base")
  const pr = await getPullRequest(repo, "master", true)
  assert.match(pr.fetchError ?? "", /origin/)
})

test("maps commit emails to GitHub logins", () => {
  const known = new Map([["me@work.io", "dr1tch"]])
  assert.equal(loginFor("Me@Work.io", known), "dr1tch")
  assert.equal(loginFor("123+octo-cat@users.noreply.github.com", known), "octo-cat")
  assert.equal(loginFor("someone@else.com", known), null)
})

test("commit diff shows only that commit; PR title falls back to the oldest commit", async () => {
  const repo = mkdtempSync(join(tmpdir(), "pr-review-"))
  sh(repo, "init", "-q", "-b", "master")
  writeFileSync(join(repo, "a"), "a\n")
  sh(repo, "add", ".")
  sh(repo, "commit", "-qm", "base")
  sh(repo, "checkout", "-qb", "feat")
  writeFileSync(join(repo, "one"), "1\n")
  sh(repo, "add", ".")
  sh(repo, "commit", "-qm", "first change", "-m", "why it matters")
  writeFileSync(join(repo, "two"), "2\n")
  sh(repo, "add", ".")
  sh(repo, "commit", "-qm", "second change")
  const pr = await getPullRequest(repo, "master")
  assert.equal(pr.title, "first change")
  assert.deepEqual(pr.commits.map((c) => [c.subject, c.body]), [["second change", ""], ["first change", "why it matters"]])
  assert.deepEqual((await commitDiff(repo, pr.commits[1].sha)).map((f) => f.to), ["one"])
  await assert.rejects(commitDiff(repo, "--output=x"))
})

test("uncommitted and untracked work shows up before it is committed", async () => {
  const repo = mkdtempSync(join(tmpdir(), "pr-review-"))
  sh(repo, "init", "-q", "-b", "master")
  writeFileSync(join(repo, "a"), "a\n")
  sh(repo, "add", ".")
  sh(repo, "commit", "-qm", "base")
  sh(repo, "checkout", "-qb", "feat")
  writeFileSync(join(repo, "committed"), "c\n")
  sh(repo, "add", ".")
  sh(repo, "commit", "-qm", "committed")
  writeFileSync(join(repo, "a"), "a\nedited\n") // tracked, not staged
  writeFileSync(join(repo, "new"), "n\n") // untracked
  writeFileSync(join(repo, ".gitignore"), "ignored\n")
  writeFileSync(join(repo, "ignored"), "i\n")

  const pr = await getPullRequest(repo, "master")
  assert.deepEqual(pr.files.map((f) => f.to).sort(), [".gitignore", "a", "committed", "new"])
  assert.deepEqual(pr.uncommitted.map((f) => f.to).sort(), [".gitignore", "a", "new"])
  assert.equal(pr.uncommitted.find((f) => f.to === "new")?.additions, 1)
  assert.equal(pr.commits.length, 1)
})

test("creating a PR pushes the branch and passes every field to gh as --flag=value", { skip: process.platform === "win32" }, async () => {
  const root = mkdtempSync(join(tmpdir(), "pr-review-"))
  const remote = join(root, "remote.git"), repo = join(root, "repo"), bin = join(root, "bin")
  sh(root, "init", "-q", "--bare", "-b", "master", remote)
  sh(root, "clone", "-q", remote, repo)
  writeFileSync(join(repo, "a"), "a\n")
  sh(repo, "add", ".")
  sh(repo, "commit", "-qm", "base")
  sh(repo, "push", "-q", "origin", "master")
  sh(repo, "checkout", "-qb", "feat")
  writeFileSync(join(repo, "b"), "b\n")
  sh(repo, "add", ".")
  sh(repo, "commit", "-qm", "feat")
  // fake gh: records its arguments, prints a PR URL
  execFileSync("mkdir", [bin])
  writeFileSync(join(bin, "gh"), `#!/bin/sh\nprintf '%s\\n' "$@" > "${root}/args"\necho https://github.com/o/r/pull/7\n`)
  chmodSync(join(bin, "gh"), 0o755)
  const path = process.env.PATH
  process.env.PATH = `${bin}:${path}`
  try {
    await assert.rejects(createPullRequest(repo, { base: "master", title: " ", body: "", draft: false, reviewers: [], assignees: [], labels: [], milestone: null }), /Title is required/)
    const url = await createPullRequest(repo, {
      base: "origin/master", title: "Add b", body: "line 1\n- item", draft: true,
      reviewers: ["alice", "-x"], assignees: ["me"], labels: ["good first issue"], milestone: "v1",
    })
    assert.equal(url, "https://github.com/o/r/pull/7")
    assert.equal(execFileSync("git", ["rev-parse", "feat"], { cwd: remote }).toString(), execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString())
    assert.deepEqual(readFileSync(join(root, "args"), "utf8").trimEnd().split("\n"), [
      "pr", "create", "--base=master", "--head=feat", "--title=Add b", "--body=line 1", "- item", "--draft",
      "--reviewer=alice", "--reviewer=-x", "--assignee=me", "--label=good first issue", "--milestone=v1",
    ])
  } finally {
    process.env.PATH = path
  }
})

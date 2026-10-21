import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { commitDiff, getPullRequest, loginFor } from "./git.ts"

const sh = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd })

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

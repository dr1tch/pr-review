import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { getPullRequest } from "./git.ts"

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

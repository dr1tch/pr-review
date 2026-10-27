import assert from "node:assert/strict"
import { test } from "node:test"
import { normalizePrBody, parsePrDraft, prDraftFailure } from "./pr-draft.ts"

test("PR drafts accept structured CLI output and JSON result fallback", () => {
  const draft = { title: " Fix tab grouping ", body: " ## Summary\n\n* **Bug Fixes**\n  * Tabs stay together. " }
  const expected = { title: draft.title.trim(), body: draft.body.trim() }
  assert.deepEqual(parsePrDraft(JSON.stringify({ structured_output: draft })), expected)
  assert.deepEqual(parsePrDraft(JSON.stringify({ result: JSON.stringify(draft) })), expected)
  assert.deepEqual(parsePrDraft(JSON.stringify([{ type: "system" }, { type: "result", structured_output: draft }])), expected)
})

test("process failures show the CLI error without exposing the command or skill", () => {
  const command = "Command failed: claude --system-prompt PRIVATE SKILL CONTENT"
  const failure = prDraftFailure({ message: command, stdout: JSON.stringify([{ type: "result", is_error: true, result: "Rate limit reached. Try again later." }]), stderr: "" })
  assert.equal(failure.message, "Rate limit reached. Try again later.")
  const empty = prDraftFailure({ message: command, stdout: "", stderr: "" })
  assert.doesNotMatch(empty.message, /PRIVATE|system-prompt|Command failed/)
  assert.match(prDraftFailure({ code: "ENOENT" }).message, /not found/)
  assert.match(prDraftFailure({ killed: true }).message, /timed out/)
})

test("generated Markdown nests category bullets and cleans template headings", () => {
  const body = "## Description (if applicable)\n\n* **New Features**\n* First feature.\n* Second feature.\n\n## How to Test\n\n- [ ] Open the page."
  assert.equal(normalizePrBody(body), "## Description\n\n* **New Features**\n  * First feature.\n  * Second feature.\n\n## How to Test\n\n- [ ] Open the page.")
  assert.equal(normalizePrBody(normalizePrBody(body)), normalizePrBody(body))
  const code = "```md\n## Keep (optional)\n* **Category**\n* Literal\n```"
  assert.equal(normalizePrBody(code), code)
})

test("invalid and failed generations cannot replace the current draft", () => {
  for (const value of [null, {}, { title: "", body: "text" }, { title: "x".repeat(71), body: "text" }, { title: "Title", body: 4 }]) {
    assert.throws(() => parsePrDraft(JSON.stringify({ structured_output: value, result: "{}" })))
  }
  assert.throws(() => parsePrDraft(JSON.stringify({ is_error: true, result: "private diagnostic" })), /could not generate/)
  assert.throws(() => parsePrDraft("not JSON"))
})

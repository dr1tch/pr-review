import assert from "node:assert/strict"
import { test } from "node:test"
import { parseReview } from "./review-parse.ts"

test("parses the last json fence and normalizes findings", () => {
  const text = 'Looks risky.\n```json\n{"summary":"s","findings":[{"file":"b/a.js","line":3,"severity":"major","body":"x"},{"file":"c.js","line":"x","severity":"bad","body":"y"},{"nope":1}]}\n```'
  assert.deepEqual(parseReview(text), {
    summary: "s",
    findings: [
      { file: "a.js", line: 3, severity: "major", body: "x" },
      { file: "c.js", line: null, severity: null, body: "y" },
    ],
  })
})

test("falls back to the whole text when there is no valid json", () => {
  assert.deepEqual(parseReview("## Review\nAll good"), { summary: "## Review\nAll good", findings: [] })
  assert.equal(parseReview("text\n```json\n{broken\n```").findings.length, 0)
})

import assert from "node:assert/strict"
import { test } from "node:test"
import { frontmatter } from "./frontmatter.ts"

test("reads quoted, plain and folded values", () => {
  const md = `---\r\nname: "code-review"\r\ndescription: >\r\n  Reviews things\r\n  carefully\r\ntools: Read, Grep\r\n---\r\nbody`
  assert.deepEqual(frontmatter(md), { name: "code-review", description: "Reviews things carefully", tools: "Read, Grep" })
})

test("returns empty without frontmatter", () => {
  assert.deepEqual(frontmatter("# just markdown"), {})
})

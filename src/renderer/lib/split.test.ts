import assert from "node:assert/strict"
import { test } from "node:test"
import parseDiff from "parse-diff"
import { splitRows } from "./split.ts"

test("pairs deletions with following additions", () => {
  const [file] = parseDiff(`diff --git a/x b/x
--- a/x
+++ b/x
@@ -1,4 +1,3 @@
 keep
-old1
-old2
+new1
 tail
\\ No newline at end of file
`)
  const rows = splitRows(file)
  assert.equal(rows.length, 5)
  assert.ok("hunk" in rows[0])
  assert.deepEqual(rows[2], { left: { no: 2, text: "old1", kind: "del" }, right: { no: 2, text: "new1", kind: "add" } })
  assert.deepEqual(rows[3], { left: { no: 3, text: "old2", kind: "del" }, right: undefined })
  assert.equal((rows[4] as { right: { no: number } }).right.no, 3)
})

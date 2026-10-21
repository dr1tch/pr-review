import assert from "node:assert/strict"
import { test } from "node:test"
import { splitHtmlLines } from "./html-lines.ts"

test("reopens spans that cross a newline", () => {
  const html = `a <span class="c">/* x\ny */</span> b\nc`
  assert.deepEqual(splitHtmlLines(html), [`a <span class="c">/* x</span>`, `<span class="c">y */</span> b`, "c"])
})

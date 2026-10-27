import assert from "node:assert/strict"
import { test } from "node:test"
import { parseOpenArgs } from "./open-args.ts"

test("parses a named group of repos in any argv order", () => {
  const want = { group: "#15650 header gap", repos: [{ path: "/fe" }, { path: "/be" }] }
  assert.deepEqual(parseOpenArgs(["/opt/pr-review", "--no-sandbox", "--group=#15650 header gap", "--repo=/fe", "--repo=/be"]), want)
  assert.deepEqual(parseOpenArgs(["app", "--repo=/fe", "--allow-file-access-from-files", "--repo=/be", "--group=#15650 header gap", "."]), want)
  assert.equal(parseOpenArgs(["/opt/pr-review"]), null)
  assert.equal(parseOpenArgs(["app", "--group= ", "--repo=/fe"]), null)
  assert.equal(parseOpenArgs(["app", "--group=Work"]), null)
})

test("reads an optional base per repo after ::", () => {
  assert.deepEqual(parseOpenArgs(["app", "--group=Stack", "--repo=/kit", "--repo=/a::b/fe::preview/kit", "--repo=/x::"]), {
    group: "Stack",
    repos: [{ path: "/kit" }, { path: "/a::b/fe", base: "preview/kit" }, { path: "/x" }],
  })
})

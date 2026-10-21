import assert from "node:assert/strict"
import { test } from "node:test"
import { buildTree } from "./file-tree.ts"

test("folds single-child folders and lists folders before files", () => {
  const tree = buildTree(["src/main/a.ts", "src/main/b.ts", "README.md", "src/x.ts"], (p) => p)
  assert.deepEqual(
    tree.map((n) => [n.name, n.children.map((c) => c.name)]),
    [["src", ["main", "x.ts"]], ["README.md", []]],
  )
  assert.equal(tree[0].children[0].children[1].file, "src/main/b.ts")
})

test("folds a deep chain into one label", () => {
  const [n] = buildTree(["a/b/c/d.ts", "a/b/c/e.ts"], (p) => p)
  assert.equal(n.name, "a/b/c")
  assert.equal(n.path, "a/b/c")
})

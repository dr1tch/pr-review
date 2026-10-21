export type TreeNode<F> = { name: string; path: string; children: TreeNode<F>[]; file?: F }

// Builds a folder tree from paths, folding single-child folder chains ("src/main") like GitHub does.
export function buildTree<F>(files: F[], pathOf: (f: F) => string): TreeNode<F>[] {
  const root: TreeNode<F> = { name: "", path: "", children: [] }
  for (const f of files) {
    const parts = pathOf(f).split("/")
    let node = root
    parts.forEach((part, i) => {
      const path = parts.slice(0, i + 1).join("/")
      let child = node.children.find((c) => c.name === part && !c.file === (i < parts.length - 1))
      if (!child) {
        child = { name: part, path, children: [], file: i === parts.length - 1 ? f : undefined }
        node.children.push(child)
      }
      node = child
    })
  }
  const fold = (n: TreeNode<F>): TreeNode<F> => {
    while (!n.file && n.children.length === 1 && !n.children[0].file) {
      const c = n.children[0]
      n = { ...c, name: `${n.name}/${c.name}` }
    }
    return { ...n, children: sorted(n.children.map(fold)) }
  }
  const sorted = (ns: TreeNode<F>[]) => ns.sort((a, b) => Number(!!a.file) - Number(!!b.file) || a.name.localeCompare(b.name))
  return sorted(root.children.map(fold))
}

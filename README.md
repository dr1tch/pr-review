# PR Review

Desktop app (Linux + Windows) for reviewing a local branch like a GitHub pull request: `HEAD` vs a base branch (default `master`), split diff, file tree, inline Markdown comments, and buttons that run your Claude Code agents (`~/.claude/agents`, `<repo>/.claude/agents`) as reviewers.

Needs `git` and the `claude` CLI on PATH. Optional: `gh` (logged in) to show the GitHub PR's title, description, number and author avatars.

```bash
npm install
npm run build && npm start   # run from source
npm run dist:linux            # dist/*.AppImage + dist/*.deb
npm run dist:win              # dist/PR Review Setup *.exe (wine needed when building on Linux)
npm test && npm run typecheck
```

- Comments and agent runs are stored in SQLite (`node:sqlite`, no native module) at `<userData>/pr-review.db`
  (Linux `~/.config/pr-review/`, Windows `%APPDATA%\pr-review\`).
- Agents run `claude -p --agent <name>` in the repo with read-only tools; the diff is passed in the prompt and the reply's trailing JSON block becomes inline comments.
- Releases: push a tag (`git tag v0.2.0 && git push origin v0.2.0`) and `.github/workflows/release.yml` builds the AppImage, `.deb` and Windows installer and attaches them to a GitHub release.
- Linux: prefer the `.deb` — on Ubuntu 24.04+ the AppImage needs `--no-sandbox` because of AppArmor.

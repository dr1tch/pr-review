# PR Review

Review your local branch like a GitHub pull request, before you push it, with Claude Code agents as reviewers.

![PR Review demo](docs/demo.gif)

PR Review is a desktop app for Linux and Windows. Open a git repository and it shows `HEAD` against a base branch the way GitHub shows a pull request: a split diff with syntax highlighting, a file tree, the commit list and inline Markdown comments. Pick any of your Claude Code agents or skills from **Review with…** and its findings land as comments on the right lines.

## Features

- **GitHub-style diff:** split view, GitHub dark theme and syntax highlighting, a filterable file tree, and per-file `+/-` counts.
- **Inline comments:** click `+` on any line and write Markdown (with preview). Comments are stored locally in SQLite.
- **Commits:** commits grouped by day with author avatar and hash. Click a commit to see only its changes.
- **Uncommitted work:** edits and new files show up before you commit, in "All changes" and on their own under "Uncommitted changes".
- **Claude Code reviewers:** runs your agents and skills headless and read-only, then posts their findings as inline comments. Runs can be cancelled.
- **Built-in reviewers:** generic code, frontend, backend, and code health reviewers are included. The review menu separates built-ins, your home-folder agents and skills, repository agents and skills, and plugins. Personal instructions stay in their original folders.
- **Real PR context:** when `gh` is logged in, it shows the GitHub PR's title, description, number and author.
- **Create the pull request:** title, Markdown description (your PR template if the repo has one), base, reviewers, assignees, labels, milestone, draft or ready. It pushes the branch and opens the PR with `gh`.
- **Generate PR text:** draft an editable title and categorized description from committed changes against the selected base using Claude Code. A bundled generic skill follows the repository template without invoking personal skills. Generation does not push or create a PR.
- **Rebase-aware:** reload fetches `origin` and compares against the remote base when it is ahead, so a rebase doesn't show other people's changes.
- **Tabs and groups:** open several repositories at once, organize them into named color groups, and collapse groups to save space. Groups are restored when you reopen the app.

## Install

### Ubuntu / Debian (apt)

Add the repository once, then install and update with apt:

```bash
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://dr1tch.github.io/pr-review/pr-review.asc | sudo tee /etc/apt/keyrings/pr-review.asc > /dev/null
echo "deb [signed-by=/etc/apt/keyrings/pr-review.asc] https://dr1tch.github.io/pr-review ./" | sudo tee /etc/apt/sources.list.d/pr-review.list
sudo apt update && sudo apt install pr-review
```

New versions arrive with `sudo apt upgrade`.

### Other downloads

Get the `.deb`, AppImage or Windows installer from [Releases](https://github.com/dr1tch/pr-review/releases). The latest `.deb` is always at [`releases/latest/download/pr-review_amd64.deb`](https://github.com/dr1tch/pr-review/releases/latest/download/pr-review_amd64.deb). On Ubuntu 24.04+, prefer the `.deb`: AppArmor blocks the AppImage's sandbox unless you start it with `--no-sandbox`.

### Requirements

- `git` on `PATH`.
- [Claude Code](https://docs.claude.com/en/docs/claude-code) (`claude`) on `PATH`, logged in, to run reviews.
- Optional: [GitHub CLI](https://cli.github.com) (`gh`), logged in, for PR titles, descriptions and avatars.

## Usage

1. Click **Open repository** and pick a git repository on the branch you want to review.
2. Set the **base** branch (default `master`).
3. Read the diff in **Files changed** and add comments with the `+` on any line.
4. Click **Review with…** and pick an agent or skill. Its findings show up as comments when it finishes.

To group tabs, right-click a repository tab or open its **…** menu and choose **New group** or an existing group. Drag a tab onto a group label or one of its tabs to join it, or into the empty area after **+** to leave its group. Drop on the left or right side of a tab to reorder, and drag a group label to move the whole group. Collapsed groups accept dropped tabs and expand. Click a group name to collapse or expand it. The group's **…** menu lets you rename it, change its color, or ungroup its tabs without closing them. Tab menus and group editors also offer **Move left** and **Move right** for keyboard use.

From a terminal, `pr-review --group="<name>" --repo=<path> --repo=<path>::<base>` opens the repositories as one named group. Each tab diffs against the repository's default branch, or against `<base>` when given, so stacked branches show only their own changes. Running it again adds to the open app and reuses a group with the same name.

Reviewers are found the same way Claude Code finds them:

| Source | Location |
|---|---|
| User | `~/.claude/agents`, `~/.claude/skills` |
| Project | `<repo>/.claude/agents`, `<repo>/.claude/skills` |
| Plugins | agents and skills of your enabled Claude Code plugins |

Reviews run `claude -p` in the repository with read-only tools (`Read`, `Grep`, `Glob`, `Skill`, `Agent`, `Task`). Edits and the shell are disallowed. The diff is passed in the prompt, and the reply's trailing JSON block becomes inline comments.

## Screenshots

| Files changed | Commits |
|---|---|
| ![Files changed with a comment](docs/files-changed.png) | ![Commits grouped by day](docs/commits.png) |
| **Single commit** | **Review with an agent or skill** |
| ![Changes of one commit](docs/commit.png) | ![Reviewer menu](docs/review-menu.png) |

## Development

Electron, React, Tailwind and `node:sqlite` (no native modules). Needs Node 24.

```bash
npm install
npm run dev                  # run with hot reload
npm test && npm run typecheck
npm run dist:linux           # dist/*.AppImage + dist/*.deb
npm run dist:win             # dist/PR Review Setup *.exe (needs wine on Linux)
```

Data lives in `pr-review.db` in the app's user-data folder: `~/.config/pr-review/` on Linux, `%APPDATA%\pr-review\` on Windows.

### Releasing

Push a version tag. `.github/workflows/release.yml` builds the Linux and Windows installers and attaches them to a GitHub release. Then `.github/workflows/apt.yml` publishes that release's `.deb` to the APT repository on GitHub Pages, signed with the `APT_GPG_KEY` secret.

```bash
git tag v0.3.0 && git push origin v0.3.0
```

## License

[MIT](LICENSE)

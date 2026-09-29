# 🚨 CRITICAL GIT WORKTREE WORKFLOW - DO THIS FIRST! 🚨

**BEFORE ANY CODE CHANGES - USE WORKTREES:**

1. Run `git fetch origin main` to get latest from remote
2. Create worktree for new feature: `git worktree add worktrees/descriptive-name -b feat/descriptive-name`
3. Change to the new worktree: `cd worktrees/descriptive-name`
4. Run `mise trust && mise install` to make tools available
5. Run `bun install` to set up dependencies
6. ONLY THEN start making changes in the isolated worktree

- Always use turbo to run tasks.
- Always use Bun instead of node or npm.
- PR titles must follow conventional commits

## Worktree Structure

```
eventsourcing/            <- Repo root (main branch checkout)
├── .git/                <- Git directory
├── worktrees/           <- All feature worktrees go here
│   ├── feature-name-1/  <- Feature worktree
│   └── feature-name-2/  <- Another feature worktree
├── packages/            <- Source code
└── ...
```

## Worktree Benefits

- Each feature branch gets its own isolated working directory
- Never risk contaminating main branch with uncommitted changes
- Can work on multiple features simultaneously in parallel worktrees
- Clean separation between repo root and feature development

## Before Starting Work

- ALWAYS use `/start` command to create proper worktree setup
- Choose a short worktree name based on the work description (worktrees live in worktrees/ subdirectory)
- NEVER work directly in repo root for feature development - always use a worktree
- Verify you're in correct worktree with `pwd` and `git branch`
- Each worktree is a complete working copy with its own node_modules and mise config

## The tracker

The maintainers track work in a [bd (beads)](https://github.com/gastownhall/beads)
tracker that is not part of this repository. External contributors don't need it
and should use GitHub issues instead. `.beads/` is gitignored, and nothing
tracked here names a bead.

## Releasing

- Start each new piece of work in a new branch from the latest origin/main. Changes are always submitted via a PR.
- With each commit, review and update pending changesets accordingly.
- Changesets must be written with the package consumer in mind, telling them what they need to know about changes, not just what changed.
- Packages are released manually via GitHub UI, not automatically.

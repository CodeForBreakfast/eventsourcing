# 🚨 CRITICAL GIT WORKTREE WORKFLOW - DO THIS FIRST! 🚨

**BEFORE ANY CODE CHANGES - USE WORKTREES:**

1. Run `git fetch origin main` to get latest from remote
2. Create worktree for new feature: `git worktree add ../feat-descriptive-name feat/descriptive-name`
3. Change to the new worktree: `cd ../feat-descriptive-name`
4. Run `mise trust && mise install` to make tools available
5. Run `bun install` to set up dependencies
6. ONLY THEN start making changes in the isolated worktree

- Always use turbo to run tasks.
- Always use Bun instead of node or npm.
- PR titles must follow conventional commits

## Worktree Benefits

- Each feature branch gets its own isolated working directory
- Never risk contaminating main branch with uncommitted changes
- Can work on multiple features simultaneously in parallel worktrees
- Clean separation between main repo and feature development

## Before Starting Work

- ALWAYS use `/start` command to create proper worktree setup
- Choose a short branch/worktree name based on the work description
- NEVER work directly in main worktree for feature development
- Verify you're in correct worktree with `pwd` and `git branch`
- Each worktree is a complete working copy with its own node_modules and mise config

## Beads (bd) Issue Tracking

We track work in Beads (bd) instead of Markdown. Beads is a lightweight, git-based issue tracker designed for AI coding agents with dependency-aware task management.

### Critical Setup Notes

- **ALWAYS use `bd` CLI commands via Bash tool** - NEVER use MCP beads tools
- Daemon is disabled (`BEADS_NO_DAEMON=1`) for worktree safety - MCP won't work
- bd auto-discovers the shared `.beads/hp.db` from any worktree
- The `.beads/` directory lives in the main worktree and is shared across all feature worktrees
- Works from main or any feature worktree - bd walks up the tree to find the database

### The "Let's Continue" Protocol

**Start of every session:**

1. Check for abandoned work: `bd list --status in_progress`
2. If none, get ready work: `bd ready --limit 5`
3. Show top priority issue: `bd show hp-X`

When user says **"Let's continue"**, run these commands to resume work.

### Essential Commands

**Finding Work:**

- `bd ready` - Show tasks with no blockers (ready to work on)
- `bd ready --limit 5` - Show top 5 ready tasks
- `bd ready --priority 0` - Show only P0 ready tasks
- `bd list --status open` - List all open issues
- `bd list --status in_progress` - See what's currently being worked on
- `bd blocked` - Show blocked issues and what's blocking them
- `bd stats` - Show project statistics and progress

**Viewing Issues:**

- `bd show hp-123` - Show detailed info about an issue (including dependencies)
- `bd dep tree hp-123` - Show full dependency tree for an issue

**Creating Issues:**

- `bd create "Task title" -p 1` - Create task (priority 0=highest, 4=lowest)
- `bd create "Bug description" -p 0 -t bug` - Create a bug
- `bd create "New feature" -p 2 -t feature` - Create a feature
- `bd create "Epic: User Management" -p 1 -t epic` - Create an epic
- `bd create "Found issue" --deps discovered-from:hp-42` - Create discovered work

**Issue Types:** bug, feature, task, epic, chore

**Updating Issues:**

- `bd update hp-123 --status in_progress` - Claim work (mark as in-progress)
- `bd update hp-123 --status blocked` - Mark as blocked
- `bd update hp-123 --status open` - Unblock/reopen
- `bd update hp-123 --priority 0` - Change priority
- `bd close hp-123 --reason "Completed the work"` - Close an issue

**Status Values:** open, in_progress, blocked, closed

**Dependencies:**

- `bd dep add hp-456 hp-123` - Make hp-456 depend on hp-123 (hp-456 is blocked by hp-123)
- `bd dep tree hp-456` - Show dependency tree
- `bd dep remove hp-456 hp-123` - Remove a dependency

**Dependency Types:**

- `blocks` (default) - Hard blocker, prevents work
- `related` - Soft link, no blocking behavior
- `parent-child` - Epic/subtask relationship
- `discovered-from` - Found during work on another issue

### Workflow Patterns

**Working on a Task:**

```bash
# 1. Find ready work
bd ready

# 2. Claim it
bd update hp-123 --status in_progress

# 3. Do the work...

# 4. Complete it
bd close hp-123 --reason "Implemented feature with tests"

# 5. Check what's ready now (dependencies may have unblocked)
bd ready
```

**Discovering Blockers:**

```bash
# You realize hp-456 needs OAuth setup first
bd create "Set up OAuth providers" -p 1 -t task
bd dep add hp-456 hp-789  # hp-456 now blocked by hp-789
bd update hp-456 --status blocked
```

**Breaking Down Epics:**

```bash
bd create "Epic: User Management" -p 1 -t epic
bd create "User registration flow" -p 1 -t task
bd create "User login/logout" -p 1 -t task
bd dep add hp-11 hp-10 --type parent-child
bd dep add hp-12 hp-10 --type parent-child
```

### When to Create Issues

**DO create issues for:**

- Multi-step features that need planning
- Bugs discovered during work (use `discovered-from` dependency)
- Work that has dependencies or blockers
- Tasks that span multiple sessions
- Work that needs tracking across the team

**DON'T create issues for:**

- Trivial fixes you're doing immediately
- Simple one-line changes
- Work you're already completing in the current session

### Important Notes

- `bd ready` only shows issues with NO open blockers - this is the work queue
- Closing an issue may unblock other issues (check `bd ready` after closing)
- All changes are auto-synced to `.beads/issues.jsonl` (committed to git)
- Issue IDs use the prefix `hp-` (configured during `bd init`)
- Dependencies are directional: `bd dep add A B` means A depends on B (A is blocked by B)

## Releasing

- Start each new piece of work in a new branch from the latest origin/main. Changes are always submitted via a PR.
- With each commit, review and update pending changesets accordingly.
- Changesets must be written with the package consumer in mind, telling them what they need to know about changes, not just what changed.
- Packages are released manually via GitHub UI, not automatically.

- Always use Bun wherever possible.
- Always use turbo to run tasks.
- PR titles must follow conventional commits

## Before Starting Work
- ALWAYS check current branch with `git status` and `git branch`
- ALWAYS fetch latest from origin/main before creating new branches
- NEVER assume you're in the right branch - orient yourself first
- Verify the repository remote with `git remote -v` if unsure

## Releasing
1. `bun changeset` - create changeset after changes
2. `bun version` - update versions before release
3. `bun release` - publish to npm
- Start each new piece of work in a new branch from the latest origin/main. Changes are always submitted via a PR.
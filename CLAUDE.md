- Always use Bun wherever possible.
- Always use turbo to run tasks.
- PR titles must follow conventional commits

## Releasing
1. `bun changeset` - create changeset after changes
2. `bun version` - update versions before release
3. `bun release` - publish to npm
- Start each new piece of work in a new branch from the latest origin/main. Changes are always submitted via a PR.
#!/usr/bin/env bun

import { Effect, pipe } from 'effect';
import { Command, FileSystem, Path, Terminal } from '@effect/platform';
import { BunContext, BunRuntime } from '@effect/platform-bun';

const rootDir = pipe(
  Path.Path,
  Effect.andThen((path) => path.resolve(import.meta.dir, '..'))
);

const getAllPackages = pipe(
  rootDir,
  Effect.andThen((root) =>
    pipe(
      Path.Path,
      Effect.andThen((path) => path.join(root, 'packages'))
    )
  ),
  Effect.andThen((packagesDir) =>
    pipe(
      FileSystem.FileSystem,
      Effect.andThen((fs) => fs.readDirectory(packagesDir)),
      Effect.andThen((dirs) =>
        pipe(
          Effect.forEach(
            dirs,
            (dir) =>
              pipe(
                Path.Path,
                Effect.andThen((path) => path.join(packagesDir, dir, 'package.json')),
                Effect.andThen((packageJsonPath) =>
                  pipe(
                    FileSystem.FileSystem,
                    Effect.andThen((fs) => fs.exists(packageJsonPath)),
                    Effect.andThen((exists) =>
                      exists
                        ? pipe(
                            FileSystem.FileSystem,
                            Effect.andThen((fs) => fs.readFileString(packageJsonPath)),
                            Effect.map((content) => {
                              const pkg = JSON.parse(content) as { readonly name: string };
                              return { name: pkg.name, directory: dir } as const;
                            }),
                            Effect.map((p) => [p] as const)
                          )
                        : Effect.succeed([] as const)
                    )
                  )
                )
              ),
            { concurrency: 'unbounded' }
          ),
          Effect.map((results) => results.flat())
        )
      )
    )
  )
);

const getBaseBranch = Effect.sync(() => {
  const env = globalThis as { process?: { env?: Record<string, string> } };
  return env.process?.env?.['GITHUB_BASE_REF'] ?? 'origin/main';
});

const getChangedPackageNames = pipe(
  Effect.all([rootDir, getBaseBranch]),
  Effect.andThen(([root, baseBranch]) =>
    pipe(
      Command.make('git', 'diff', '--name-only', `${baseBranch}...HEAD`),
      Command.workingDirectory(root),
      Command.string,
      Effect.map((output) =>
        output
          .split('\n')
          .filter((f) => f.length > 0)
          .reduce((acc, file) => {
            const match = file.match(/^packages\/([^\/]+)\//);
            if (match?.[1]) {
              return new Set([...acc, match[1]]);
            }
            return acc;
          }, new Set<string>())
      ),
      Effect.andThen((changedDirectories) =>
        changedDirectories.size > 0
          ? pipe(
              getAllPackages,
              Effect.map((allPackages) =>
                allPackages
                  .filter((pkg) => changedDirectories.has(pkg.directory))
                  .map((pkg) => pkg.name)
              )
            )
          : Effect.succeed([] as readonly string[])
      ),
      Effect.catchAll(() =>
        pipe(
          Terminal.Terminal,
          Effect.andThen((terminal) =>
            terminal.display('⚠️  Could not determine changed packages, validating all packages\n')
          ),
          Effect.andThen(() => getAllPackages),
          Effect.map((packages) => packages.map((pkg) => pkg.name))
        )
      )
    )
  )
);

const displayPackages = (changedPackageNames: readonly string[]) =>
  changedPackageNames.length === 0
    ? pipe(
        Terminal.Terminal,
        Effect.andThen((terminal) => terminal.display('No changed packages detected\n'))
      )
    : pipe(
        Terminal.Terminal,
        Effect.andThen((terminal) =>
          Effect.forEach(changedPackageNames, (pkg) => terminal.display(`${pkg}\n`), {
            discard: true,
          })
        )
      );

const program = pipe(getChangedPackageNames, Effect.andThen(displayPackages));

BunRuntime.runMain(pipe(program, Effect.provide(BunContext.layer)));

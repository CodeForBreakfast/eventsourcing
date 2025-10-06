#!/usr/bin/env bun

import { Effect, pipe } from 'effect';
import { Command, FileSystem, Path, Terminal } from '@effect/platform';
import { BunContext, BunRuntime } from '@effect/platform-bun';

interface ChangesetStatus {
  readonly releases: ReadonlyArray<{ readonly name: string; readonly type: string }>;
  readonly changesets: ReadonlyArray<unknown>;
}

const rootDir = pipe(
  Path.Path,
  Effect.andThen((path) => path.resolve(import.meta.dir, '..'))
);

const getEnvVar = (key: string) =>
  Effect.sync(() => {
    const env = globalThis as { process?: { env?: Record<string, string> } };
    return env.process?.env?.[key];
  });

const isChangesetBranch = pipe(
  getEnvVar('GITHUB_HEAD_REF'),
  Effect.map((ref) => ref?.startsWith('changeset-release/') ?? false)
);

const fetchBaseBranch = pipe(
  Effect.all([rootDir, getEnvVar('GITHUB_BASE_REF')]),
  Effect.andThen(([root, baseBranch]) =>
    baseBranch
      ? pipe(
          Command.make('git', 'fetch', 'origin', `${baseBranch}:${baseBranch}`),
          Command.workingDirectory(root),
          Command.exitCode,
          Effect.catchAll(() => Effect.void)
        )
      : Effect.void
  )
);

const getChangesetStatus = pipe(
  rootDir,
  Effect.andThen((root) =>
    pipe(
      Command.make('bunx', 'changeset', 'status', '--output=status.json'),
      Command.workingDirectory(root),
      Command.exitCode,
      Effect.andThen(() =>
        pipe(
          Path.Path,
          Effect.andThen((path) => path.join(root, 'status.json')),
          Effect.andThen((statusPath) =>
            pipe(
              FileSystem.FileSystem,
              Effect.andThen((fs) => fs.readFileString(statusPath)),
              Effect.map((content) => JSON.parse(content) as ChangesetStatus),
              Effect.andThen((status) =>
                pipe(
                  FileSystem.FileSystem,
                  Effect.andThen((fs) => fs.remove(statusPath)),
                  Effect.as(status)
                )
              )
            )
          )
        )
      )
    )
  )
);

const getPackagesToValidate = pipe(
  Terminal.Terminal,
  Effect.andThen((terminal) =>
    terminal.display('🔍 Discovering packages that need validation...\n\n')
  ),
  Effect.andThen(() => isChangesetBranch),
  Effect.andThen((isChangeset) =>
    isChangeset
      ? pipe(
          Terminal.Terminal,
          Effect.andThen((terminal) => terminal.display('📦 Skipping validation (version PR)\n')),
          Effect.as([] as readonly string[])
        )
      : pipe(
          fetchBaseBranch,
          Effect.andThen(() => getChangesetStatus),
          Effect.andThen((status) =>
            status.releases && status.releases.length > 0
              ? pipe(
                  Effect.succeed(status.releases.map((release) => release.name)),
                  Effect.andThen((packageNames) =>
                    pipe(
                      Terminal.Terminal,
                      Effect.andThen((terminal) =>
                        pipe(
                          terminal.display(
                            `📦 Found ${packageNames.length} package(s) to validate:\n`
                          ),
                          Effect.andThen(() =>
                            Effect.forEach(
                              packageNames,
                              (pkg) => terminal.display(`   - ${pkg}\n`),
                              {
                                discard: true,
                              }
                            )
                          ),
                          Effect.andThen(() => terminal.display('\n')),
                          Effect.as(packageNames)
                        )
                      )
                    )
                  )
                )
              : pipe(
                  Terminal.Terminal,
                  Effect.andThen((terminal) =>
                    terminal.display('✅ No packages to release, no validation needed\n\n')
                  ),
                  Effect.as([] as readonly string[])
                )
          ),
          Effect.catchAll(() =>
            pipe(
              Terminal.Terminal,
              Effect.andThen((terminal) =>
                terminal.display(
                  '⚠️  Could not determine packages to validate, skipping pack validation\n\n'
                )
              ),
              Effect.as([] as readonly string[])
            )
          )
        )
  )
);

const validateChangesets = pipe(
  Terminal.Terminal,
  Effect.andThen((terminal) => terminal.display('🔍 Starting release validation...\n\n')),
  Effect.andThen(() =>
    pipe(
      Terminal.Terminal,
      Effect.andThen((terminal) => terminal.display('📦 Validating changesets...\n'))
    )
  ),
  Effect.andThen(() => rootDir),
  Effect.andThen((root) =>
    pipe(
      Command.make('bun', 'scripts/validate-changesets.ts'),
      Command.workingDirectory(root),
      Command.exitCode,
      Effect.andThen((exitCode) =>
        exitCode === 0
          ? Effect.void
          : pipe(
              Terminal.Terminal,
              Effect.andThen((terminal) => terminal.display('❌ Changeset validation failed\n')),
              Effect.andThen(() => Effect.fail('Changeset validation failed'))
            )
      )
    )
  )
);

const validatePackages = (packagesToValidate: readonly string[]) =>
  packagesToValidate.length === 0
    ? pipe(
        Terminal.Terminal,
        Effect.andThen((terminal) =>
          terminal.display('✅ Release validation complete - no packages to validate\n')
        )
      )
    : pipe(
        rootDir,
        Effect.andThen((root) => {
          const filterArgs = packagesToValidate.map((pkg) => `--filter=${pkg}`).join(' ');
          return pipe(
            Terminal.Terminal,
            Effect.andThen((terminal) =>
              terminal.display(
                `🏗️  Running validation for ${packagesToValidate.length} packages using Turbo...\n`
              )
            ),
            Effect.andThen(() =>
              pipe(
                Command.make('bunx', 'turbo', 'run', 'validate:pack', filterArgs),
                Command.workingDirectory(root),
                Command.exitCode,
                Effect.andThen((exitCode) =>
                  exitCode === 0
                    ? pipe(
                        Terminal.Terminal,
                        Effect.andThen((terminal) =>
                          pipe(
                            terminal.display('\n✅ All package validations passed!\n'),
                            Effect.andThen(() =>
                              terminal.display(
                                '   This PR should successfully release when merged.\n'
                              )
                            )
                          )
                        )
                      )
                    : pipe(
                        Terminal.Terminal,
                        Effect.andThen((terminal) =>
                          pipe(
                            terminal.display('\n❌ Package validation failed!\n'),
                            Effect.andThen(() =>
                              terminal.display(
                                '   Fix the validation errors above before merging.\n'
                              )
                            )
                          )
                        ),
                        Effect.andThen(() => Effect.fail('Package validation failed'))
                      )
                )
              )
            )
          );
        })
      );

const program = pipe(
  validateChangesets,
  Effect.andThen(() => getPackagesToValidate),
  Effect.andThen(validatePackages)
);

BunRuntime.runMain(pipe(program, Effect.provide(BunContext.layer)));

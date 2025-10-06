#!/usr/bin/env bun

import { Effect, pipe } from 'effect';
import { Command, Path, Terminal } from '@effect/platform';
import { BunContext, BunRuntime } from '@effect/platform-bun';

const rootDir = pipe(
  Path.Path,
  Effect.andThen((path) => path.resolve(import.meta.dir, '..'))
);

const discoverPackages = pipe(
  Terminal.Terminal,
  Effect.andThen((terminal) =>
    terminal.display('🔍 Discovering packages that need publish validation...\n')
  ),
  Effect.andThen(() => rootDir),
  Effect.andThen((root) =>
    pipe(
      Command.make('bun', 'scripts/validate-publish.ts'),
      Command.workingDirectory(root),
      Command.string,
      Effect.map((output) =>
        output
          .split('\n')
          .filter((line) => line.trim() && !line.includes('No changed packages detected'))
      ),
      Effect.catchAll(() =>
        pipe(
          Terminal.Terminal,
          Effect.andThen((terminal) => terminal.display('❌ Failed to discover packages\n')),
          Effect.andThen(() => Effect.fail('Failed to discover packages'))
        )
      )
    )
  )
);

const validatePackages = (packages: readonly string[]) =>
  pipe(
    Effect.if(packages.length === 0, {
      onTrue: () =>
        pipe(
          Terminal.Terminal,
          Effect.andThen((terminal) => terminal.display('✅ No packages need validation\n')),
          Effect.as(undefined)
        ),
      onFalse: () =>
        pipe(
          Terminal.Terminal,
          Effect.andThen((terminal) =>
            pipe(
              terminal.display(`📦 Found ${packages.length} package(s) to validate:\n`),
              Effect.andThen(() =>
                Effect.forEach(packages, (pkg) => terminal.display(`   - ${pkg}\n`), {
                  discard: true,
                })
              ),
              Effect.andThen(() => terminal.display('\n')),
              Effect.andThen(() => terminal.display('🏗️  Running validation using Turbo...\n'))
            )
          ),
          Effect.andThen(() => rootDir),
          Effect.andThen((root) => {
            const filterArgs = packages.map((pkg) => `--filter=${pkg}`).join(' ');
            return pipe(
              Command.make('bunx', 'turbo', 'run', 'validate:pack', filterArgs),
              Command.workingDirectory(root),
              Command.exitCode,
              Effect.andThen((exitCode) =>
                exitCode === 0
                  ? pipe(
                      Terminal.Terminal,
                      Effect.andThen((terminal) =>
                        terminal.display('\n✅ All package validations passed!\n')
                      )
                    )
                  : pipe(
                      Terminal.Terminal,
                      Effect.andThen((terminal) =>
                        terminal.display('\n❌ Package validation failed!\n')
                      ),
                      Effect.andThen(() => Effect.fail('Package validation failed'))
                    )
              )
            );
          })
        ),
    })
  );

const program = pipe(discoverPackages, Effect.andThen(validatePackages));

BunRuntime.runMain(pipe(program, Effect.provide(BunContext.layer)));

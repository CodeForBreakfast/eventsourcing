#!/usr/bin/env bun

import { Effect, pipe } from 'effect';
import { Command, Path, Terminal } from '@effect/platform';
import { BunContext, BunRuntime } from '@effect/platform-bun';

const rootDir = pipe(
  Path.Path,
  Effect.andThen((path) => path.resolve(import.meta.dir, '..'))
);

const displayDiscoveryFailure = pipe(
  Terminal.Terminal,
  Effect.andThen((terminal) => terminal.display('❌ Failed to discover packages\n')),
  Effect.andThen(() => Effect.fail('Failed to discover packages'))
);

const runDiscoveryCommand = (root: string) =>
  pipe(
    Command.make('bun', 'scripts/validate-publish.ts'),
    Command.workingDirectory(root),
    Command.string,
    Effect.map((output) =>
      output
        .split('\n')
        .filter((line) => line.trim() && !line.includes('No changed packages detected'))
    ),
    Effect.catchAll(() => displayDiscoveryFailure)
  );

const discoverPackages = pipe(
  Terminal.Terminal,
  Effect.andThen((terminal) =>
    terminal.display('🔍 Discovering packages that need publish validation...\n')
  ),
  Effect.andThen(() => rootDir),
  Effect.andThen(runDiscoveryCommand)
);

const displayNoPackagesMessage = pipe(
  Terminal.Terminal,
  Effect.andThen((terminal) => terminal.display('✅ No packages need validation\n')),
  Effect.as(undefined)
);

const displayPackageList = (packages: readonly string[]) => (terminal: Terminal.Terminal) => {
  const displayPackageCount = terminal.display(
    `📦 Found ${packages.length} package(s) to validate:\n`
  );
  return pipe(
    displayPackageCount,
    Effect.andThen(() =>
      Effect.forEach(packages, (pkg) => terminal.display(`   - ${pkg}\n`), {
        discard: true,
      })
    ),
    Effect.andThen(() => terminal.display('\n')),
    Effect.andThen(() => terminal.display('🏗️  Running validation using Turbo...\n'))
  );
};

const displayValidationSuccess = pipe(
  Terminal.Terminal,
  Effect.andThen((terminal) => terminal.display('\n✅ All package validations passed!\n'))
);

const displayValidationFailure = pipe(
  Terminal.Terminal,
  Effect.andThen((terminal) => terminal.display('\n❌ Package validation failed!\n')),
  Effect.andThen(() => Effect.fail('Package validation failed'))
);

const runTurboValidation = (root: string, filterArgs: readonly string[]) =>
  pipe(
    Command.make('bunx', 'turbo', 'run', 'validate:pack', ...filterArgs),
    Command.workingDirectory(root),
    Command.exitCode,
    Effect.andThen((exitCode) =>
      exitCode === 0 ? displayValidationSuccess : displayValidationFailure
    )
  );

const runValidationForPackages = (packages: readonly string[]) =>
  pipe(
    Terminal.Terminal,
    Effect.andThen(displayPackageList(packages)),
    Effect.andThen(() => rootDir),
    Effect.andThen((root) => {
      const filterArgs = packages.map((pkg) => `--filter=${pkg}`);
      return runTurboValidation(root, filterArgs);
    })
  );

const validatePackages = (packages: readonly string[]) =>
  pipe(
    Effect.if(packages.length === 0, {
      onTrue: () => displayNoPackagesMessage,
      onFalse: () => runValidationForPackages(packages),
    })
  );

const program = pipe(
  // eslint-disable-next-line effect/no-intermediate-effect-variables -- Script pattern: effect reused in main program logic
  discoverPackages,
  Effect.andThen(validatePackages)
);

BunRuntime.runMain(
  pipe(
    // eslint-disable-next-line effect/no-intermediate-effect-variables -- Script entry point pattern
    program,
    Effect.provide(BunContext.layer)
  )
);

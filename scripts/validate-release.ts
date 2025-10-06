#!/usr/bin/env bun

import { Effect, pipe } from 'effect';
import { Command, FileSystem, Path, Terminal } from '@effect/platform';
import { BunContext, BunRuntime } from '@effect/platform-bun';
import { Schema } from 'effect';

const ChangesetStatus = Schema.Struct({
  releases: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      type: Schema.String,
    })
  ),
  changesets: Schema.Array(Schema.Unknown),
});

type ChangesetStatus = typeof ChangesetStatus.Type;

const rootDir = pipe(
  Path.Path,
  Effect.andThen((path) => path.resolve(import.meta.dir, '..'))
);

const getEnvVar = (key: string) =>
  Effect.sync(() => {
    const env = globalThis as { readonly process?: { readonly env?: Record<string, string> } };
    return env.process?.env?.[key];
  });

const isChangesetBranch = pipe(
  'GITHUB_HEAD_REF',
  getEnvVar,
  Effect.map((ref) => ref?.startsWith('changeset-release/') ?? false)
);

const fetchGitOrigin = (root: string, baseBranch: string) =>
  pipe(
    Command.make('git', 'fetch', 'origin', `${baseBranch}:${baseBranch}`),
    Command.workingDirectory(root),
    Command.exitCode,
    Effect.catchAll(() => Effect.void)
  );

const getRootAndBaseBranch = Effect.all([rootDir, getEnvVar('GITHUB_BASE_REF')]);

const fetchBaseBranch = pipe(
  getRootAndBaseBranch,
  Effect.andThen(([root, baseBranch]) =>
    baseBranch ? fetchGitOrigin(root, baseBranch) : Effect.void
  )
);

const parseJson = (content: string) => Effect.sync(() => JSON.parse(content));

const parseAndDecodeStatus = (content: string) =>
  pipe(content, parseJson, Effect.andThen(Schema.decodeUnknown(ChangesetStatus)));

const readStatusFile = (statusPath: string) =>
  pipe(
    FileSystem.FileSystem,
    Effect.andThen((fs) => fs.readFileString(statusPath)),
    Effect.andThen(parseAndDecodeStatus)
  );

const removeStatusFile = (statusPath: string) =>
  pipe(
    FileSystem.FileSystem,
    Effect.andThen((fs) => fs.remove(statusPath))
  );

const cleanupWithStatus = (statusPath: string) => (status: ChangesetStatus) =>
  pipe(statusPath, removeStatusFile, Effect.as(status));

const readAndCleanupStatus = (statusPath: string) =>
  pipe(statusPath, readStatusFile, Effect.andThen(cleanupWithStatus(statusPath)));

const resolveStatusPath = (root: string) =>
  pipe(
    Path.Path,
    Effect.andThen((path) => path.join(root, 'status.json'))
  );

const resolveAndReadStatus = (root: string) =>
  pipe(root, resolveStatusPath, Effect.andThen(readAndCleanupStatus));

const runChangesetStatus = (root: string) =>
  pipe(
    Command.make('bunx', 'changeset', 'status', '--output=status.json'),
    Command.workingDirectory(root),
    Command.exitCode,
    Effect.andThen(() => resolveAndReadStatus(root))
  );

const getChangesetStatus = pipe(rootDir, Effect.andThen(runChangesetStatus));

const displayPackageList = (packageNames: readonly string[]) => (terminal: Terminal.Terminal) =>
  pipe(
    `📦 Found ${packageNames.length} package(s) to validate:\n`,
    terminal.display,
    Effect.andThen(() =>
      Effect.forEach(packageNames, (pkg) => terminal.display(`   - ${pkg}\n`), {
        discard: true,
      })
    ),
    Effect.andThen(() => terminal.display('\n')),
    Effect.as(packageNames)
  );

const displayPackages = (packageNames: readonly string[]) =>
  pipe(Terminal.Terminal, Effect.andThen(displayPackageList(packageNames)));

const extractPackageNames = (status: ChangesetStatus) =>
  Effect.succeed(status.releases.map((release) => release.name));

const handleReleasesFound = (status: ChangesetStatus) =>
  pipe(status, extractPackageNames, Effect.andThen(displayPackages));

const displayNoPackages = pipe(
  Terminal.Terminal,
  Effect.andThen((terminal) =>
    terminal.display('✅ No packages to release, no validation needed\n\n')
  ),
  Effect.as([] as readonly string[])
);

const displaySkipValidation = pipe(
  Terminal.Terminal,
  Effect.andThen((terminal) => terminal.display('📦 Skipping validation (version PR)\n')),
  Effect.as([] as readonly string[])
);

const displayValidationError = pipe(
  Terminal.Terminal,
  Effect.andThen((terminal) =>
    terminal.display('⚠️  Could not determine packages to validate, skipping pack validation\n\n')
  ),
  Effect.as([] as readonly string[])
);

const determinePackagesToValidate = pipe(
  fetchBaseBranch,
  Effect.andThen(() => getChangesetStatus),
  Effect.andThen((status) =>
    status.releases && status.releases.length > 0 ? handleReleasesFound(status) : displayNoPackages
  ),
  Effect.catchAll(() => displayValidationError)
);

const getPackagesToValidate = pipe(
  Terminal.Terminal,
  Effect.andThen((terminal) =>
    terminal.display('🔍 Discovering packages that need validation...\n\n')
  ),
  Effect.andThen(() => isChangesetBranch),
  Effect.andThen((isChangeset) =>
    isChangeset ? displaySkipValidation : determinePackagesToValidate
  )
);

const displayChangesetValidationStart = pipe(
  Terminal.Terminal,
  Effect.andThen((terminal) => terminal.display('📦 Validating changesets...\n'))
);

const displayChangesetValidationFailed = pipe(
  Terminal.Terminal,
  Effect.andThen((terminal) => terminal.display('❌ Changeset validation failed\n')),
  Effect.andThen(() => Effect.fail('Changeset validation failed'))
);

const runChangesetValidation = (root: string) =>
  pipe(
    Command.make('bun', 'scripts/validate-changesets.ts'),
    Command.workingDirectory(root),
    Command.exitCode,
    Effect.andThen((exitCode) => (exitCode === 0 ? Effect.void : displayChangesetValidationFailed))
  );

const validateChangesets = pipe(
  Terminal.Terminal,
  Effect.andThen((terminal) => terminal.display('🔍 Starting release validation...\n\n')),
  Effect.andThen(() => displayChangesetValidationStart),
  Effect.andThen(() => rootDir),
  Effect.andThen(runChangesetValidation)
);

const displayNoPackagesValidation = pipe(
  Terminal.Terminal,
  Effect.andThen((terminal) =>
    terminal.display('✅ Release validation complete - no packages to validate\n')
  )
);

const showValidationSuccess = (terminal: Terminal.Terminal) =>
  pipe(
    '\n✅ All package validations passed!\n',
    terminal.display,
    Effect.andThen(() => terminal.display('   This PR should successfully release when merged.\n'))
  );

const displayValidationSuccess = pipe(Terminal.Terminal, Effect.andThen(showValidationSuccess));

const showValidationFailure = (terminal: Terminal.Terminal) =>
  pipe(
    '\n❌ Package validation failed!\n',
    terminal.display,
    Effect.andThen(() => terminal.display('   Fix the validation errors above before merging.\n'))
  );

const displayValidationFailure = pipe(
  Terminal.Terminal,
  Effect.andThen(showValidationFailure),
  Effect.andThen(() => Effect.fail('Package validation failed'))
);

const runTurboValidation = (root: string, filterArgs: string) =>
  pipe(
    Command.make('bunx', 'turbo', 'run', 'validate:pack', filterArgs),
    Command.workingDirectory(root),
    Command.exitCode,
    Effect.andThen((exitCode) =>
      exitCode === 0 ? displayValidationSuccess : displayValidationFailure
    )
  );

const displayPackageValidationStart = (packagesToValidate: readonly string[]) =>
  pipe(
    Terminal.Terminal,
    Effect.andThen((terminal) =>
      terminal.display(
        `🏗️  Running validation for ${packagesToValidate.length} packages using Turbo...\n`
      )
    )
  );

const executePackageValidation = (packagesToValidate: readonly string[]) => (root: string) => {
  const filterArgs = packagesToValidate.map((pkg) => `--filter=${pkg}`).join(' ');
  return pipe(
    packagesToValidate,
    displayPackageValidationStart,
    Effect.andThen(() => runTurboValidation(root, filterArgs))
  );
};

const validatePackages = (packagesToValidate: readonly string[]) =>
  packagesToValidate.length === 0
    ? displayNoPackagesValidation
    : pipe(rootDir, Effect.andThen(executePackageValidation(packagesToValidate)));

const program = pipe(
  validateChangesets,
  Effect.andThen(() => getPackagesToValidate),
  Effect.andThen(validatePackages)
);

BunRuntime.runMain(pipe(program, Effect.provide(BunContext.layer)));

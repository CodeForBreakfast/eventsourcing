#!/usr/bin/env bun

/**
 * Validates that changesets exist when needed and include all necessary packages.
 * This runs in PR checks to prevent:
 * 1. Merging changes without changesets (would cause npm publish failures)
 * 2. Merging changesets that miss dependent packages
 */

import { Effect, pipe, Array as EffectArray, Option } from 'effect';
import { FileSystem, Path, Terminal, Command } from '@effect/platform';
import { BunContext, BunRuntime } from '@effect/platform-bun';

type PackageInternal = {
  readonly name: string;
  readonly version: string;
  readonly path: string;
};

type ChangesetInfoInternal = {
  readonly filename: string;
  readonly packages: ReadonlyArray<string>;
  readonly type: 'major' | 'minor' | 'patch';
};

type MissingDependentError = {
  readonly changed: string;
  readonly missing: readonly string[];
};

const resolveDirFromUrl = (path: Path.Path) =>
  pipe(
    () => new URL(import.meta.url).pathname,
    Effect.sync,
    Effect.map((currentPath) => path.dirname(currentPath)),
    Effect.map((scriptsDir) => path.resolve(scriptsDir, '..'))
  );

const getRootDir = pipe(Path.Path, Effect.flatMap(resolveDirFromUrl));

const parsePackageJsonContent = (packagePath: string) => (content: string) => {
  const pkg = JSON.parse(content);
  return Option.some<PackageInternal>({
    name: pkg.name,
    version: pkg.version,
    path: packagePath,
  });
};

const readPackageJson = (fs: FileSystem.FileSystem, packagePath: string) =>
  pipe(packagePath, fs.readFileString, Effect.map(parsePackageJsonContent(packagePath)));

const checkAndReadPackage =
  (fs: FileSystem.FileSystem, packagePath: string) => (exists: boolean) =>
    exists ? readPackageJson(fs, packagePath) : Effect.succeed(Option.none<PackageInternal>());

const readPackageIfExists = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  packagesDir: string,
  dir: string
) => {
  const packagePath = path.join(packagesDir, dir, 'package.json');
  return pipe(packagePath, fs.exists, Effect.flatMap(checkAndReadPackage(fs, packagePath)));
};

const readAllPackageDirectories =
  (fs: FileSystem.FileSystem, path: Path.Path, packagesDir: string) => (dirs: readonly string[]) =>
    pipe(
      dirs,
      EffectArray.map((dir) => readPackageIfExists(fs, path, packagesDir, dir)),
      Effect.all,
      Effect.map(EffectArray.getSomes)
    );

const readPackagesFromDirectory = ([fs, path, rootDir]: readonly [
  FileSystem.FileSystem,
  Path.Path,
  string,
]) => {
  const packagesDir = path.join(rootDir, 'packages');
  return pipe(
    packagesDir,
    fs.readDirectory,
    Effect.flatMap(readAllPackageDirectories(fs, path, packagesDir))
  );
};

const getAllPackages = pipe(
  [FileSystem.FileSystem, Path.Path, getRootDir] as const,
  Effect.all,
  Effect.flatMap(readPackagesFromDirectory)
);

const parseFrontmatter = (content: string): string => {
  const lines = content.split('\n');

  type FrontmatterState = {
    readonly inFrontmatter: boolean;
    readonly frontmatterContent: string;
    readonly done: boolean;
  };

  const result = lines.reduce<FrontmatterState>(
    (state, line) => {
      if (state.done) {
        return state;
      }

      if (line === '---') {
        if (!state.inFrontmatter) {
          return { ...state, inFrontmatter: true };
        }
        return { ...state, done: true };
      }

      if (state.inFrontmatter) {
        return {
          ...state,
          frontmatterContent: state.frontmatterContent + line + '\n',
        };
      }

      return state;
    },
    { inFrontmatter: false, frontmatterContent: '', done: false }
  );

  return result.frontmatterContent;
};

const parsePackagesFromFrontmatter = (
  frontmatterContent: string
): { readonly packages: readonly string[]; readonly changeType: 'major' | 'minor' | 'patch' } => {
  const packageRegex = /['"]([^'"]+)['"]\s*:\s*(major|minor|patch)/g;
  const matches = Array.from(frontmatterContent.matchAll(packageRegex));

  type ParseResult = {
    readonly packages: readonly string[];
    readonly changeType: 'major' | 'minor' | 'patch';
  };

  return matches.reduce<ParseResult>(
    (acc, match) => {
      const packageName = match[1];
      if (!packageName) {
        return acc;
      }

      const type = match[2] as 'major' | 'minor' | 'patch';
      const newChangeType =
        type === 'major'
          ? 'major'
          : type === 'minor' && acc.changeType !== 'major'
            ? 'minor'
            : acc.changeType;

      return {
        packages: [...acc.packages, packageName],
        changeType: newChangeType,
      };
    },
    { packages: [], changeType: 'patch' }
  );
};

const parseChangesetContent = (file: string) => (content: string) => {
  const frontmatterContent = parseFrontmatter(content);
  const { packages, changeType } = parsePackagesFromFrontmatter(frontmatterContent);
  return packages.length === 0
    ? Option.none<ChangesetInfoInternal>()
    : Option.some<ChangesetInfoInternal>({
        filename: file,
        packages,
        type: changeType,
      });
};

const parseChangesetFile =
  (fs: FileSystem.FileSystem, path: Path.Path, changesetsDir: string) => (file: string) =>
    pipe(
      path.join(changesetsDir, file),
      fs.readFileString,
      Effect.map(parseChangesetContent(file))
    );

const isChangesetFile = (file: string) =>
  file !== 'README.md' && file !== 'config.json' && file.endsWith('.md');

const parseChangesetFiles =
  (fs: FileSystem.FileSystem, path: Path.Path, changesetsDir: string) =>
  (files: readonly string[]) =>
    pipe(
      files,
      EffectArray.filter(isChangesetFile),
      EffectArray.map(parseChangesetFile(fs, path, changesetsDir)),
      Effect.all,
      Effect.map(EffectArray.getSomes)
    );

const readChangesetDirectory = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  changesetsDir: string
) =>
  pipe(
    changesetsDir,
    fs.readDirectory,
    Effect.flatMap(parseChangesetFiles(fs, path, changesetsDir))
  );

const checkAndReadChangesets =
  (fs: FileSystem.FileSystem, path: Path.Path, changesetsDir: string) => (exists: boolean) =>
    exists ? readChangesetDirectory(fs, path, changesetsDir) : Effect.succeed([]);

const readChangesetsFromDirectory = ([fs, path, rootDir]: readonly [
  FileSystem.FileSystem,
  Path.Path,
  string,
]) => {
  const changesetsDir = path.join(rootDir, '.changeset');
  return pipe(
    changesetsDir,
    fs.exists,
    Effect.flatMap(checkAndReadChangesets(fs, path, changesetsDir))
  );
};

const getChangesets = pipe(
  [FileSystem.FileSystem, Path.Path, getRootDir] as const,
  Effect.all,
  Effect.flatMap(readChangesetsFromDirectory)
);

const parsePackageDependencyOutput = (output: string): Record<string, readonly string[]> =>
  JSON.parse(output);

const handleDependencyCheckFailure = (terminal: Terminal.Terminal) => () =>
  pipe(
    terminal,
    (t) => t.display('❌ Failed to get package dependency information\n'),
    Effect.andThen(Effect.fail('Failed to get package dependency information'))
  );

const runDependencyCheck = (terminal: Terminal.Terminal) =>
  pipe(
    Command.make('bun', 'scripts/check-package-dependencies.ts'),
    Command.string,
    Effect.withSpan('check-package-dependencies'),
    Effect.map(parsePackageDependencyOutput),
    Effect.catchAll(handleDependencyCheckFailure(terminal))
  );

const getPackageDependencyMap = pipe(Terminal.Terminal, Effect.flatMap(runDependencyCheck));

const getBaseBranch = (): string => {
  const envVar = 'GITHUB_BASE_REF';
  const proc: Record<string, unknown> = globalThis as never;
  const env = (proc['process'] as Record<string, Record<string, string>> | undefined)?.['env'];
  return (env?.[envVar] as string | undefined) ?? 'origin/main';
};

const parseGitDiffOutput = (output: string): readonly string[] =>
  output.split('\n').filter((file) => file.length > 0);

const handleGitDiffFailure = (terminal: Terminal.Terminal) => () =>
  pipe(
    terminal,
    (t) => t.display('⚠️  Could not determine changed files, assuming this is not a PR\n'),
    Effect.as([] as readonly string[])
  );

const runGitDiff = (terminal: Terminal.Terminal) => {
  const baseBranch = getBaseBranch();
  return pipe(
    Command.make('git', 'diff', '--name-only', `${baseBranch}...HEAD`),
    Command.string,
    Effect.map(parseGitDiffOutput),
    Effect.catchAll(handleGitDiffFailure(terminal))
  );
};

const getChangedFiles = pipe(Terminal.Terminal, Effect.flatMap(runGitDiff));

const hasCodeChanges = (changedFiles: readonly string[]): boolean => {
  const codePatterns: readonly RegExp[] = [
    /^packages\//,
    /^scripts\//,
    /\.ts$/,
    /\.tsx$/,
    /\.js$/,
    /\.jsx$/,
    /^package\.json$/,
    /^bun\.lockb$/,
    /^tsconfig/,
    /^\.github\/workflows/,
  ];

  return changedFiles.some((file) => {
    if (file === 'scripts/validate-changesets.ts') {
      return false;
    }
    return codePatterns.some((pattern) => pattern.test(file));
  });
};

const extractUnpublishablePackages = (error: unknown): readonly string[] => {
  const errorWithOutput = error as { readonly stdout?: string; readonly stderr?: string };
  const output = errorWithOutput.stdout || errorWithOutput.stderr || '';
  const lines = output.split('\n');
  return lines.reduce<readonly string[]>((unpublishable, line) => {
    if (!line.includes('check:publishable') || !line.includes('FAILED')) {
      return unpublishable;
    }
    const match = line.match(/@[\w-]+\/[\w-]+/);
    if (!match) {
      return unpublishable;
    }
    return [...unpublishable, match[0]];
  }, []);
};

const handlePublishableCheckFailure = (error: unknown) =>
  Effect.sync(() => extractUnpublishablePackages(error));

const checkForUnpublishedPackages = pipe(
  Command.make('bunx', 'turbo', 'run', 'check:publishable'),
  Command.string,
  Effect.as([] as readonly string[]),
  Effect.catchAll(handlePublishableCheckFailure)
);

const validateChangesetPackages = (
  changesets: readonly ChangesetInfoInternal[],
  packages: readonly PackageInternal[],
  rootPackageJson: { readonly name: string }
): readonly string[] => {
  const validPackageNames = new Set(packages.map((p) => p.name));

  return changesets.flatMap((changeset) =>
    changeset.packages.flatMap((pkgName) => {
      if (validPackageNames.has(pkgName)) {
        return [];
      }

      if (pkgName === rootPackageJson.name) {
        return [
          `❌ Changeset ${changeset.filename} references the private monorepo root package: ${pkgName}`,
          '   The monorepo root is private and cannot be published to npm.',
        ];
      }

      return [
        `❌ Changeset ${changeset.filename} references non-existent package: ${pkgName}`,
        '   This package does not exist in the workspace.',
      ];
    })
  );
};

const displaySingleError = (terminal: Terminal.Terminal) => (err: string) =>
  terminal.display(`${err}\n`);

const displayErrors = (terminal: Terminal.Terminal, errors: readonly string[]) =>
  pipe(errors, EffectArray.map(displaySingleError(terminal)), Effect.all, Effect.asVoid);

const displaySinglePackage = (terminal: Terminal.Terminal) => (p: PackageInternal) =>
  terminal.display(`   - ${p.name}\n`);

const displayPackages = (terminal: Terminal.Terminal, packages: readonly PackageInternal[]) =>
  pipe(packages, EffectArray.map(displaySinglePackage(terminal)), Effect.all, Effect.asVoid);

const showValidationFailureMessages = (
  terminal: Terminal.Terminal,
  errors: readonly string[],
  packages: readonly PackageInternal[]
) =>
  pipe(
    terminal,
    (t) => t.display('❌ Invalid changesets detected!\n\n'),
    Effect.andThen(displayErrors(terminal, errors)),
    Effect.andThen(
      terminal.display(
        '\nThis would cause the release workflow to fail with:\n"Found changeset for package which is not in the workspace"\n\nTo fix this issue:\n1. Remove or update the invalid changeset file(s)\n2. Only reference packages that exist in packages/ directory\n3. Never reference the monorepo root package\n\nValid packages are:\n'
      )
    ),
    Effect.andThen(displayPackages(terminal, packages)),
    Effect.andThen(Effect.fail('Invalid changesets detected'))
  );

const displayValidationFailure = (
  errors: readonly string[],
  packages: readonly PackageInternal[]
) =>
  pipe(
    Terminal.Terminal,
    Effect.flatMap((terminal) => showValidationFailureMessages(terminal, errors, packages))
  );

const displaySingleFile = (terminal: Terminal.Terminal) => (file: string) =>
  terminal.display(`   - ${file}\n`);

const displayFileList = (terminal: Terminal.Terminal, files: readonly string[]) =>
  pipe(files, EffectArray.map(displaySingleFile(terminal)), Effect.all, Effect.asVoid);

const showChangedFilesList = (terminal: Terminal.Terminal, changedFiles: readonly string[]) => {
  const filesToShow = changedFiles
    .filter((f) => !f.startsWith('.changeset/') || f === '.changeset/config.json')
    .slice(0, 10);
  const moreFilesMessage =
    changedFiles.length > 10 ? `   ... and ${changedFiles.length - 10} more files\n\n` : '\n';
  return pipe(
    terminal,
    (t) => t.display('📝 Code changes detected in:\n'),
    Effect.andThen(displayFileList(terminal, filesToShow)),
    Effect.andThen(terminal.display(moreFilesMessage))
  );
};

const showMissingChangesetMessages = (terminal: Terminal.Terminal) =>
  pipe(
    terminal,
    (t) => t.display('❌ Validation Failed!\n\n'),
    Effect.andThen(terminal.display('This PR contains code changes but no changesets.\n\n')),
    Effect.andThen(
      terminal.display(
        'Without a changeset, the release workflow will fail because it will\nattempt to publish packages that are already published at their current versions.\n\n'
      )
    ),
    Effect.andThen(
      terminal.display(
        'To fix this issue:\n1. Run: bun changeset\n2. Select the packages that have changed\n3. Choose appropriate version bumps:\n   - patch: for bug fixes and minor updates (including docs)\n   - minor: for new features\n   - major: for breaking changes\n4. Write a summary focused on what consumers need to know\n5. Commit the changeset file\n\n'
      )
    ),
    Effect.andThen(Effect.fail('Missing changesets'))
  );

const displayMissingChangesetError = pipe(
  Terminal.Terminal,
  Effect.flatMap(showMissingChangesetMessages)
);

const displaySingleUnpublishablePackage = (terminal: Terminal.Terminal) => (pkg: string) =>
  terminal.display(`   - ${pkg}\n`);

const displayUnpublishablePackages = (
  terminal: Terminal.Terminal,
  unpublishable: readonly string[]
) =>
  pipe(
    unpublishable,
    EffectArray.map(displaySingleUnpublishablePackage(terminal)),
    Effect.all,
    Effect.asVoid
  );

const showUnpublishableMessages = (terminal: Terminal.Terminal, unpublishable: readonly string[]) =>
  pipe(
    terminal,
    (t) => t.display('❌ Validation Failed!\n\n'),
    Effect.andThen(terminal.display('The following package versions already exist on npm:\n')),
    Effect.andThen(displayUnpublishablePackages(terminal, unpublishable)),
    Effect.andThen(
      terminal.display(
        '\nThe release workflow would fail trying to republish these versions.\nYou must create a changeset to bump the versions.\n\n'
      )
    ),
    Effect.andThen(Effect.fail('Unpublishable packages'))
  );

const displayUnpublishableError = (unpublishable: readonly string[]) =>
  pipe(
    Terminal.Terminal,
    Effect.flatMap((terminal) => showUnpublishableMessages(terminal, unpublishable))
  );

const displayDocOnlyInfo = (terminal: Terminal.Terminal) =>
  pipe(
    terminal,
    (t) => t.display('\n'),
    Effect.andThen(
      terminal.display('ℹ️  Consider adding a changeset for documentation updates to:\n')
    ),
    Effect.andThen(terminal.display('   - Track the documentation change in version history\n')),
    Effect.andThen(terminal.display('   - Allow users to see docs were updated via npm\n')),
    Effect.andThen(terminal.display('   - Prevent potential CI issues\n\n'))
  );

const showDocOnlyMessages = (
  terminal: Terminal.Terminal,
  changesets: readonly ChangesetInfoInternal[]
) =>
  pipe(
    terminal,
    (t) => t.display('📄 Only documentation changes detected - changesets optional\n'),
    Effect.andThen(changesets.length === 0 ? displayDocOnlyInfo(terminal) : Effect.void)
  );

const displaySinglePackageName = (terminal: Terminal.Terminal) => (pkg: string) =>
  terminal.display(`   - ${pkg}\n`);

const displayPackageList = (terminal: Terminal.Terminal, packages: readonly string[]) =>
  pipe(packages, EffectArray.map(displaySinglePackageName(terminal)), Effect.all, Effect.asVoid);

const showChangesetPackagesList = (
  terminal: Terminal.Terminal,
  changesets: readonly ChangesetInfoInternal[]
) => {
  const changedPackages = changesets.reduce<ReadonlySet<string>>(
    (acc, changeset) =>
      changeset.packages.reduce((packageSet, pkg) => new Set([...packageSet, pkg]), acc),
    new Set<string>()
  );

  return pipe(
    terminal,
    (t) => t.display('📦 Packages with changesets:\n'),
    Effect.andThen(displayPackageList(terminal, Array.from(changedPackages))),
    Effect.andThen(terminal.display('\n')),
    Effect.as(changedPackages)
  );
};

const displaySingleMissingDependency = (terminal: Terminal.Terminal) => (dep: string) =>
  terminal.display(`       - ${dep}\n`);

const showMissingDependencies = (terminal: Terminal.Terminal, missing: readonly string[]) =>
  pipe(
    missing,
    EffectArray.map(displaySingleMissingDependency(terminal)),
    Effect.all,
    Effect.asVoid
  );

const displayDependencyError = (terminal: Terminal.Terminal, error: MissingDependentError) =>
  pipe(
    terminal,
    (t) => t.display(`  📦 ${error.changed} is being changed\n`),
    Effect.andThen(terminal.display(`     Missing changesets for dependent packages:\n`)),
    Effect.andThen(showMissingDependencies(terminal, error.missing)),
    Effect.andThen(terminal.display('\n'))
  );

const showSingleDependencyError = (terminal: Terminal.Terminal) => (error: MissingDependentError) =>
  displayDependencyError(terminal, error);

const displayDependencyErrors = (
  terminal: Terminal.Terminal,
  dependencyErrors: readonly MissingDependentError[]
) =>
  pipe(
    dependencyErrors,
    EffectArray.map(showSingleDependencyError(terminal)),
    Effect.all,
    Effect.asVoid
  );

const showDependencyValidationFailure = (
  terminal: Terminal.Terminal,
  dependencyErrors: readonly MissingDependentError[]
) =>
  pipe(
    terminal,
    (t) => t.display('❌ Validation Failed!\n\n'),
    Effect.andThen(
      terminal.display(
        'The following packages have workspace dependencies that also need changesets:\n\n'
      )
    ),
    Effect.andThen(displayDependencyErrors(terminal, dependencyErrors)),
    Effect.andThen(
      terminal.display(
        'To fix this issue:\n1. Create a changeset that includes ALL affected packages:\n   bun changeset\n2. Select both the changed packages and their dependents listed above\n3. Choose appropriate version bumps (usually patch for dependents)\n4. Write a consumer-focused summary of changes\n5. Commit the changeset file\n\nThis prevents npm publish failures where dependent packages\nstill reference old versions of their dependencies.\n\n'
      )
    ),
    Effect.andThen(Effect.fail('Missing dependent changesets'))
  );

const checkDependencyErrors = (
  terminal: Terminal.Terminal,
  changedPackages: ReadonlySet<string>,
  packageDependencyMap: Record<string, readonly string[]>
) => {
  const dependencyErrors = Array.from(changedPackages).reduce<readonly MissingDependentError[]>(
    (errors, changedPackage) => {
      const dependentNames = packageDependencyMap[changedPackage] || [];
      const missingDependents = dependentNames.filter((dep) => !changedPackages.has(dep));

      if (missingDependents.length === 0) {
        return errors;
      }

      return [
        ...errors,
        {
          changed: changedPackage,
          missing: missingDependents,
        },
      ];
    },
    []
  );

  if (dependencyErrors.length === 0) {
    return Effect.void;
  }

  return showDependencyValidationFailure(terminal, dependencyErrors);
};

const validateDependencies = (
  changedPackages: ReadonlySet<string>,
  packageDependencyMap: Record<string, readonly string[]>
) =>
  pipe(
    Terminal.Terminal,
    Effect.flatMap((terminal) =>
      checkDependencyErrors(terminal, changedPackages, packageDependencyMap)
    )
  );

const showSuccessMessages = (
  terminal: Terminal.Terminal,
  changesets: readonly ChangesetInfoInternal[]
) =>
  pipe(
    terminal,
    (t) => t.display('✅ Changeset validation passed!\n'),
    Effect.andThen(
      changesets.length > 0
        ? terminal.display('   All changesets include necessary dependent packages.\n')
        : Effect.void
    )
  );

const displaySuccess = (changesets: readonly ChangesetInfoInternal[]) =>
  pipe(
    Terminal.Terminal,
    Effect.flatMap((terminal) => showSuccessMessages(terminal, changesets))
  );

const validatePackageDependencies = (changedPackages: ReadonlySet<string>) =>
  pipe(
    getPackageDependencyMap,
    Effect.flatMap((packageDependencyMap) =>
      validateDependencies(changedPackages, packageDependencyMap)
    )
  );

const validateChangesetsFlow = (changesets: readonly ChangesetInfoInternal[]) =>
  pipe(
    Terminal.Terminal,
    Effect.flatMap((terminal) => showChangesetPackagesList(terminal, changesets)),
    Effect.flatMap(validatePackageDependencies),
    Effect.andThen(displaySuccess(changesets))
  );

const validateWithChangesets = (changesets: readonly ChangesetInfoInternal[]) =>
  validateChangesetsFlow(changesets);

const checkUnpublishableWhenNoChangesets = (
  unpublishable: readonly string[],
  changesets: readonly ChangesetInfoInternal[]
) =>
  unpublishable.length > 0 && changesets.length === 0
    ? displayUnpublishableError(unpublishable)
    : Effect.void;

const validateAfterCheckingPublishable = (changesets: readonly ChangesetInfoInternal[]) =>
  pipe(
    checkForUnpublishedPackages,
    Effect.flatMap((unpublishable) => checkUnpublishableWhenNoChangesets(unpublishable, changesets))
  );

const validateCodeChanges = (
  changedFiles: readonly string[],
  changesets: readonly ChangesetInfoInternal[]
) =>
  pipe(
    Terminal.Terminal,
    Effect.flatMap((terminal) => showChangedFilesList(terminal, changedFiles)),
    Effect.andThen(
      changesets.length === 0
        ? displayMissingChangesetError
        : validateAfterCheckingPublishable(changesets)
    ),
    Effect.andThen(changesets.length > 0 ? validateWithChangesets(changesets) : Effect.void)
  );

const validateDocChanges = (changesets: readonly ChangesetInfoInternal[]) =>
  pipe(
    Terminal.Terminal,
    Effect.flatMap((terminal) => showDocOnlyMessages(terminal, changesets)),
    Effect.andThen(changesets.length > 0 ? validateWithChangesets(changesets) : Effect.void)
  );

const validateChangesetLogic = (
  packages: readonly PackageInternal[],
  changesets: readonly ChangesetInfoInternal[],
  changedFiles: readonly string[],
  rootPackageJson: { readonly name: string }
) => {
  const errors = validateChangesetPackages(changesets, packages, rootPackageJson);

  if (errors.length > 0) {
    return displayValidationFailure(errors, packages);
  }

  if (changedFiles.length > 0 && hasCodeChanges(changedFiles)) {
    return validateCodeChanges(changedFiles, changesets);
  } else if (changedFiles.length === 0) {
    return pipe(
      Terminal.Terminal,
      Effect.flatMap((t) =>
        t.display('No changes detected. This might not be a PR or might be the first commit.\n')
      )
    );
  } else {
    return validateDocChanges(changesets);
  }
};

const parseRootPackageJson = (content: string) => JSON.parse(content);

const readRootPackageJson = (fs: FileSystem.FileSystem, path: Path.Path, rootDir: string) =>
  pipe(path.join(rootDir, 'package.json'), fs.readFileString, Effect.map(parseRootPackageJson));

const displayValidationStart = () =>
  pipe(
    Terminal.Terminal,
    Effect.flatMap((terminal) =>
      terminal.display('🔍 Validating changesets and release readiness...\n\n')
    )
  );

const validateWithRootPackage = (
  packages: readonly PackageInternal[],
  changesets: readonly ChangesetInfoInternal[],
  changedFiles: readonly string[],
  fs: FileSystem.FileSystem,
  path: Path.Path,
  rootDir: string
) =>
  pipe(
    readRootPackageJson(fs, path, rootDir),
    Effect.flatMap((rootPackageJson) =>
      validateChangesetLogic(packages, changesets, changedFiles, rootPackageJson)
    )
  );

const runValidationLogic = ([packages, changesets, changedFiles, [fs, path, rootDir]]: readonly [
  readonly PackageInternal[],
  readonly ChangesetInfoInternal[],
  readonly string[],
  readonly [FileSystem.FileSystem, Path.Path, string],
]) => validateWithRootPackage(packages, changesets, changedFiles, fs, path, rootDir);

const validateChangesets = pipe(
  Terminal.Terminal,
  Effect.andThen(
    Effect.all([
      getAllPackages,
      getChangesets,
      getChangedFiles,
      Effect.all([FileSystem.FileSystem, Path.Path, getRootDir] as const),
    ] as const)
  ),
  Effect.tap(displayValidationStart),
  Effect.flatMap(runValidationLogic)
);

const program = pipe(validateChangesets, Effect.provide(BunContext.layer));

BunRuntime.runMain(program);

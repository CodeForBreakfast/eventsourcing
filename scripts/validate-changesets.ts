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

const getRootDir = pipe(
  Path.Path,
  Effect.flatMap((path) =>
    pipe(
      Effect.sync(() => new URL(import.meta.url).pathname),
      Effect.map((currentPath) => path.dirname(currentPath)),
      Effect.map((scriptsDir) => path.resolve(scriptsDir, '..'))
    )
  )
);

const readPackageJson = (fs: FileSystem.FileSystem, packagePath: string) =>
  pipe(
    fs.readFileString(packagePath),
    Effect.map((content) => {
      const pkg = JSON.parse(content);
      return Option.some<PackageInternal>({
        name: pkg.name,
        version: pkg.version,
        path: packagePath,
      });
    })
  );

const readPackageIfExists = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  packagesDir: string,
  dir: string
) => {
  const packagePath = path.join(packagesDir, dir, 'package.json');
  return pipe(
    fs.exists(packagePath),
    Effect.flatMap((exists) =>
      exists ? readPackageJson(fs, packagePath) : Effect.succeed(Option.none<PackageInternal>())
    )
  );
};

const getAllPackages = pipe(
  Effect.all([FileSystem.FileSystem, Path.Path, getRootDir]),
  Effect.flatMap(([fs, path, rootDir]) => {
    const packagesDir = path.join(rootDir, 'packages');
    return pipe(
      fs.readDirectory(packagesDir),
      Effect.flatMap((dirs) =>
        pipe(
          dirs,
          EffectArray.map((dir) => readPackageIfExists(fs, path, packagesDir, dir)),
          Effect.all,
          Effect.map(EffectArray.getSomes)
        )
      )
    );
  })
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

const parseChangesetFile =
  (fs: FileSystem.FileSystem, path: Path.Path, changesetsDir: string) => (file: string) =>
    pipe(
      fs.readFileString(path.join(changesetsDir, file)),
      Effect.map((content) => {
        const frontmatterContent = parseFrontmatter(content);
        const { packages, changeType } = parsePackagesFromFrontmatter(frontmatterContent);
        return packages.length === 0
          ? Option.none<ChangesetInfoInternal>()
          : Option.some<ChangesetInfoInternal>({
              filename: file,
              packages,
              type: changeType,
            });
      })
    );

const getChangesets = pipe(
  Effect.all([FileSystem.FileSystem, Path.Path, getRootDir]),
  Effect.flatMap(([fs, path, rootDir]) => {
    const changesetsDir = path.join(rootDir, '.changeset');
    return pipe(
      fs.exists(changesetsDir),
      Effect.flatMap((exists) =>
        exists
          ? pipe(
              fs.readDirectory(changesetsDir),
              Effect.flatMap((files) =>
                pipe(
                  files,
                  EffectArray.filter(
                    (file) => file !== 'README.md' && file !== 'config.json' && file.endsWith('.md')
                  ),
                  EffectArray.map(parseChangesetFile(fs, path, changesetsDir)),
                  Effect.all,
                  Effect.map(EffectArray.getSomes)
                )
              )
            )
          : Effect.succeed([])
      )
    );
  })
);

const getPackageDependencyMap = pipe(
  Terminal.Terminal,
  Effect.flatMap((terminal) =>
    pipe(
      Command.make('bun', 'scripts/check-package-dependencies.ts'),
      Command.string,
      Effect.withSpan('check-package-dependencies'),
      Effect.map((output) => JSON.parse(output) as Record<string, readonly string[]>),
      Effect.catchAll(() =>
        pipe(
          terminal.display('❌ Failed to get package dependency information\n'),
          Effect.andThen(Effect.fail('Failed to get package dependency information'))
        )
      )
    )
  )
);

const getBaseBranch = (): string => {
  const envVar = 'GITHUB_BASE_REF';
  const proc: Record<string, unknown> = globalThis as never;
  const env = (proc['process'] as Record<string, Record<string, string>> | undefined)?.['env'];
  return (env?.[envVar] as string | undefined) ?? 'origin/main';
};

const getChangedFiles = pipe(
  Terminal.Terminal,
  Effect.flatMap((terminal) => {
    const baseBranch = getBaseBranch();
    return pipe(
      Command.make('git', 'diff', '--name-only', `${baseBranch}...HEAD`),
      Command.string,
      Effect.map((output) => output.split('\n').filter((file) => file.length > 0)),
      Effect.catchAll(() =>
        pipe(
          terminal.display('⚠️  Could not determine changed files, assuming this is not a PR\n'),
          Effect.as([] as readonly string[])
        )
      )
    );
  })
);

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

const checkForUnpublishedPackages = pipe(
  Command.make('bunx', 'turbo', 'run', 'check:publishable'),
  Command.string,
  Effect.as([] as readonly string[]),
  Effect.catchAll((error) =>
    pipe(
      Effect.sync(() => {
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
      })
    )
  )
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

const displayErrors = (terminal: Terminal.Terminal, errors: readonly string[]) =>
  pipe(
    errors,
    EffectArray.map((err) => terminal.display(`${err}\n`)),
    Effect.all,
    Effect.asVoid
  );

const displayPackages = (terminal: Terminal.Terminal, packages: readonly PackageInternal[]) =>
  pipe(
    packages,
    EffectArray.map((p) => terminal.display(`   - ${p.name}\n`)),
    Effect.all,
    Effect.asVoid
  );

const displayValidationFailure = (
  errors: readonly string[],
  packages: readonly PackageInternal[]
) =>
  pipe(
    Terminal.Terminal,
    Effect.flatMap((terminal) =>
      pipe(
        terminal.display('❌ Invalid changesets detected!\n\n'),
        Effect.andThen(displayErrors(terminal, errors)),
        Effect.andThen(
          terminal.display(
            '\nThis would cause the release workflow to fail with:\n"Found changeset for package which is not in the workspace"\n\nTo fix this issue:\n1. Remove or update the invalid changeset file(s)\n2. Only reference packages that exist in packages/ directory\n3. Never reference the monorepo root package\n\nValid packages are:\n'
          )
        ),
        Effect.andThen(displayPackages(terminal, packages)),
        Effect.andThen(Effect.fail('Invalid changesets detected'))
      )
    )
  );

const displayFileList = (terminal: Terminal.Terminal, files: readonly string[]) =>
  pipe(
    files,
    EffectArray.map((file) => terminal.display(`   - ${file}\n`)),
    Effect.all,
    Effect.asVoid
  );

const displayChangedFiles = (changedFiles: readonly string[]) =>
  pipe(
    Terminal.Terminal,
    Effect.flatMap((terminal) => {
      const filesToShow = changedFiles
        .filter((f) => !f.startsWith('.changeset/') || f === '.changeset/config.json')
        .slice(0, 10);
      const moreFilesMessage =
        changedFiles.length > 10 ? `   ... and ${changedFiles.length - 10} more files\n\n` : '\n';
      return pipe(
        terminal.display('📝 Code changes detected in:\n'),
        Effect.andThen(displayFileList(terminal, filesToShow)),
        Effect.andThen(terminal.display(moreFilesMessage))
      );
    })
  );

const displayMissingChangesetError = pipe(
  Terminal.Terminal,
  Effect.flatMap((terminal) =>
    pipe(
      terminal.display('❌ Validation Failed!\n\n'),
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
    )
  )
);

const displayUnpublishablePackages = (
  terminal: Terminal.Terminal,
  unpublishable: readonly string[]
) =>
  pipe(
    unpublishable,
    EffectArray.map((pkg) => terminal.display(`   - ${pkg}\n`)),
    Effect.all,
    Effect.asVoid
  );

const displayUnpublishableError = (unpublishable: readonly string[]) =>
  pipe(
    Terminal.Terminal,
    Effect.flatMap((terminal) =>
      pipe(
        terminal.display('❌ Validation Failed!\n\n'),
        Effect.andThen(terminal.display('The following package versions already exist on npm:\n')),
        Effect.andThen(displayUnpublishablePackages(terminal, unpublishable)),
        Effect.andThen(
          terminal.display(
            '\nThe release workflow would fail trying to republish these versions.\nYou must create a changeset to bump the versions.\n\n'
          )
        ),
        Effect.andThen(Effect.fail('Unpublishable packages'))
      )
    )
  );

const displayDocOnlyInfo = (terminal: Terminal.Terminal) =>
  pipe(
    terminal.display('\n'),
    Effect.andThen(
      terminal.display('ℹ️  Consider adding a changeset for documentation updates to:\n')
    ),
    Effect.andThen(terminal.display('   - Track the documentation change in version history\n')),
    Effect.andThen(terminal.display('   - Allow users to see docs were updated via npm\n')),
    Effect.andThen(terminal.display('   - Prevent potential CI issues\n\n'))
  );

const displayDocOnlyChanges = (changesets: readonly ChangesetInfoInternal[]) =>
  pipe(
    Terminal.Terminal,
    Effect.flatMap((terminal) =>
      pipe(
        terminal.display('📄 Only documentation changes detected - changesets optional\n'),
        Effect.andThen(changesets.length === 0 ? displayDocOnlyInfo(terminal) : Effect.void)
      )
    )
  );

const displayPackageList = (terminal: Terminal.Terminal, packages: readonly string[]) =>
  pipe(
    Array.from(packages),
    EffectArray.map((pkg) => terminal.display(`   - ${pkg}\n`)),
    Effect.all,
    Effect.asVoid
  );

const displayChangesetPackages = (changesets: readonly ChangesetInfoInternal[]) =>
  pipe(
    Terminal.Terminal,
    Effect.flatMap((terminal) => {
      const changedPackages = changesets.reduce<ReadonlySet<string>>(
        (acc, changeset) =>
          changeset.packages.reduce((packageSet, pkg) => new Set([...packageSet, pkg]), acc),
        new Set<string>()
      );

      return pipe(
        terminal.display('📦 Packages with changesets:\n'),
        Effect.andThen(displayPackageList(terminal, Array.from(changedPackages))),
        Effect.andThen(terminal.display('\n')),
        Effect.as(changedPackages)
      );
    })
  );

const displayDependencyError = (terminal: Terminal.Terminal, error: MissingDependentError) =>
  pipe(
    terminal.display(`  📦 ${error.changed} is being changed\n`),
    Effect.andThen(terminal.display(`     Missing changesets for dependent packages:\n`)),
    Effect.andThen(
      pipe(
        error.missing,
        EffectArray.map((dep) => terminal.display(`       - ${dep}\n`)),
        Effect.all,
        Effect.asVoid
      )
    ),
    Effect.andThen(terminal.display('\n'))
  );

const displayDependencyErrors = (
  terminal: Terminal.Terminal,
  dependencyErrors: readonly MissingDependentError[]
) =>
  pipe(
    dependencyErrors,
    EffectArray.map((error) => displayDependencyError(terminal, error)),
    Effect.all,
    Effect.asVoid
  );

const validateDependencies = (
  changedPackages: ReadonlySet<string>,
  packageDependencyMap: Record<string, readonly string[]>
) =>
  pipe(
    Terminal.Terminal,
    Effect.flatMap((terminal) => {
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

      return pipe(
        terminal.display('❌ Validation Failed!\n\n'),
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
    })
  );

const displaySuccess = (changesets: readonly ChangesetInfoInternal[]) =>
  pipe(
    Terminal.Terminal,
    Effect.flatMap((terminal) =>
      pipe(
        terminal.display('✅ Changeset validation passed!\n'),
        Effect.andThen(
          changesets.length > 0
            ? terminal.display('   All changesets include necessary dependent packages.\n')
            : Effect.void
        )
      )
    )
  );

const validateWithChangesets = (changesets: readonly ChangesetInfoInternal[]) =>
  pipe(
    displayChangesetPackages(changesets),
    Effect.flatMap((changedPackages) =>
      pipe(
        getPackageDependencyMap,
        Effect.flatMap((packageDependencyMap) =>
          validateDependencies(changedPackages, packageDependencyMap)
        )
      )
    ),
    Effect.andThen(displaySuccess(changesets))
  );

const validateCodeChanges = (
  changedFiles: readonly string[],
  changesets: readonly ChangesetInfoInternal[]
) =>
  pipe(
    displayChangedFiles(changedFiles),
    Effect.andThen(
      changesets.length === 0
        ? displayMissingChangesetError
        : pipe(
            checkForUnpublishedPackages,
            Effect.flatMap((unpublishable) =>
              unpublishable.length > 0 && changesets.length === 0
                ? displayUnpublishableError(unpublishable)
                : Effect.void
            )
          )
    ),
    Effect.andThen(changesets.length > 0 ? validateWithChangesets(changesets) : Effect.void)
  );

const validateDocChanges = (changesets: readonly ChangesetInfoInternal[]) =>
  pipe(
    displayDocOnlyChanges(changesets),
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

const readRootPackageJson = (fs: FileSystem.FileSystem, path: Path.Path, rootDir: string) =>
  pipe(
    fs.readFileString(path.join(rootDir, 'package.json')),
    Effect.map((content) => JSON.parse(content))
  );

const validateChangesets = pipe(
  Terminal.Terminal,
  Effect.andThen(
    Effect.all([
      getAllPackages,
      getChangesets,
      getChangedFiles,
      Effect.all([FileSystem.FileSystem, Path.Path, getRootDir]),
    ])
  ),
  Effect.tap(() =>
    pipe(
      Terminal.Terminal,
      Effect.flatMap((terminal) =>
        terminal.display('🔍 Validating changesets and release readiness...\n\n')
      )
    )
  ),
  Effect.flatMap(([packages, changesets, changedFiles, [fs, path, rootDir]]) =>
    pipe(
      readRootPackageJson(fs, path, rootDir),
      Effect.flatMap((rootPackageJson) =>
        validateChangesetLogic(packages, changesets, changedFiles, rootPackageJson)
      )
    )
  )
);

const program = pipe(validateChangesets, Effect.provide(BunContext.layer));

BunRuntime.runMain(program);

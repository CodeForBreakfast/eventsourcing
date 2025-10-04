#!/usr/bin/env bun

import { Effect, pipe, Array as EffectArray, Console, Option } from 'effect';
import { readdir, readFile, writeFile, mkdir, rm } from 'fs/promises';
import { join, relative } from 'path';

interface CodeBlock {
  readonly code: string;
  readonly file: string;
  readonly line: number;
  readonly index: number;
}

interface ValidationError {
  readonly file: string;
  readonly line: number;
  readonly index: number;
  readonly error: string;
}

interface ParserState {
  readonly blocks: readonly CodeBlock[];
  readonly inBlock: boolean;
  readonly currentBlock: readonly string[];
  readonly blockStartLine: number;
  readonly blockIndex: number;
}

const initialParserState: ParserState = {
  blocks: [],
  inBlock: false,
  currentBlock: [],
  blockStartLine: 0,
  blockIndex: 0,
};

const processMarkdownLine =
  (filePath: string, lineIndex: number) =>
  (state: ParserState, line: string | undefined): Effect.Effect<ParserState, never, never> => {
    const trimmed = line?.trim() ?? '';

    if (trimmed.match(/^```(?:typescript|ts)$/)) {
      return state.inBlock
        ? pipe(
            Console.error(
              `Malformed code block at ${filePath}:${lineIndex + 1} - nested code fence`
            ),
            Effect.map(() => state)
          )
        : Effect.succeed({
            ...state,
            inBlock: true,
            currentBlock: [],
            blockStartLine: lineIndex + 1,
          });
    }

    if (trimmed === '```' && state.inBlock) {
      return Effect.succeed({
        ...state,
        blocks: [
          ...state.blocks,
          {
            code: state.currentBlock.join('\n'),
            file: filePath,
            line: state.blockStartLine,
            index: state.blockIndex,
          },
        ],
        inBlock: false,
        currentBlock: [],
        blockIndex: state.blockIndex + 1,
      });
    }

    if (state.inBlock) {
      return Effect.succeed({
        ...state,
        currentBlock: [...state.currentBlock, line ?? ''],
      });
    }

    return Effect.succeed(state);
  };

const finalizeParserState =
  (filePath: string) =>
  (state: ParserState): Effect.Effect<readonly CodeBlock[], never, never> => {
    if (!state.inBlock) {
      return Effect.succeed(state.blocks);
    }

    return pipe(
      Console.warn(
        `Unclosed code block at ${filePath}:${state.blockStartLine} - treating as complete`
      ),
      Effect.map(() => [
        ...state.blocks,
        {
          code: state.currentBlock.join('\n'),
          file: filePath,
          line: state.blockStartLine,
          index: state.blockIndex,
        },
      ])
    );
  };

const extractCodeBlocks = (content: string, filePath: string) =>
  pipe(
    content.split('\n'),
    EffectArray.reduce(Effect.succeed(initialParserState), (accEffect, line, index) =>
      pipe(
        accEffect,
        Effect.flatMap((state) => processMarkdownLine(filePath, index)(state, line))
      )
    ),
    Effect.flatMap(finalizeParserState(filePath))
  );

const shouldSkipEntry = (name: string): boolean =>
  name === 'node_modules' || name === '.git' || name === 'dist';

const processDirectoryEntry =
  (currentDir: string, files: readonly string[]) =>
  (entry: {
    readonly name: string;
    readonly isDirectory: () => boolean;
    readonly isFile: () => boolean;
  }): Effect.Effect<readonly string[], Error, never> => {
    if (shouldSkipEntry(entry.name)) {
      return Effect.succeed(files);
    }

    const fullPath = join(currentDir, entry.name);

    if (entry.isDirectory()) {
      return processDirectory(fullPath, files);
    }

    if (entry.isFile() && entry.name.endsWith('.md')) {
      return Effect.succeed([...files, fullPath]);
    }

    return Effect.succeed(files);
  };

const processDirectory = (
  currentDir: string,
  files: readonly string[] = []
): Effect.Effect<readonly string[], Error, never> =>
  pipe(
    Effect.tryPromise({
      try: () => readdir(currentDir, { withFileTypes: true }),
      catch: (error) => new Error(`Failed to read directory ${currentDir}: ${error}`),
    }),
    Effect.flatMap((entries) =>
      pipe(
        entries as readonly {
          readonly name: string;
          readonly isDirectory: () => boolean;
          readonly isFile: () => boolean;
        }[],
        EffectArray.reduce(Effect.succeed(files), (acc, entry) =>
          pipe(
            acc,
            Effect.flatMap((currentFiles) => processDirectoryEntry(currentDir, currentFiles)(entry))
          )
        )
      )
    )
  );

const findMarkdownFiles = (dir: string) => processDirectory(dir, []);

const createCombinedTempFile = (
  blocks: readonly CodeBlock[],
  tempDir: string,
  packageDir: string
) =>
  pipe(
    Effect.tryPromise({
      try: () => readFile(join(packageDir, 'package.json'), 'utf-8'),
      catch: (error) => new Error(`Failed to read package.json: ${error}`),
    }),
    Effect.map((content) => JSON.parse(content).name as string),
    Effect.flatMap((packageName) => {
      const header = `// Auto-generated file for type checking all examples
// Import everything the user would import
import * as PackageExports from '${packageName}';
import { Effect, Stream, Scope, pipe, Schema, Chunk, Option, Layer, Context, Match, Data } from 'effect';

// Destructure package exports so they're available directly
const {} = PackageExports;

`;

      const wrappedBlocks = pipe(
        blocks,
        EffectArray.map(
          (block, idx) => `
// ===== Example ${idx}: ${block.file}:${block.line} =====
${block.code}
`
        )
      );

      const content = header + wrappedBlocks.join('\n');
      const filepath = join(tempDir, 'all-examples.ts');

      const tsconfigContent = {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          lib: ['ES2022'],
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          resolveJsonModule: true,
          noEmit: true,
        },
        include: ['*.ts'],
      };

      return pipe(
        Effect.all([
          Effect.tryPromise({
            try: () => writeFile(filepath, content),
            catch: (error) => new Error(`Failed to write temp file ${filepath}: ${error}`),
          }),
          Effect.tryPromise({
            try: () =>
              writeFile(join(tempDir, 'tsconfig.json'), JSON.stringify(tsconfigContent, null, 2)),
            catch: (error) => new Error(`Failed to write tsconfig: ${error}`),
          }),
        ]),
        Effect.map(() => filepath)
      );
    })
  );

const typeCheckFile = (filepath: string, tempDir: string) =>
  pipe(
    Effect.sync(() =>
      Bun.spawn(['bun', 'tsc', '--project', tempDir, '--noEmit'], {
        stderr: 'pipe',
        stdout: 'pipe',
      })
    ),
    Effect.flatMap((proc) =>
      pipe(
        Effect.all([
          Effect.promise(() => proc.exited),
          Effect.promise(() => new Response(proc.stdout).text()),
        ]),
        Effect.flatMap(([exitCode, stdoutText]) =>
          exitCode !== 0 ? Effect.fail(stdoutText) : Effect.void
        )
      )
    )
  );

const parseTypeErrors = (
  stdout: string,
  blocks: readonly CodeBlock[]
): readonly ValidationError[] =>
  pipe(
    stdout.split('\n'),
    EffectArray.filter((line) => line.includes('error TS')),
    (errorLines) =>
      errorLines.length > 0 && blocks.length > 0
        ? pipe(
            blocks[0],
            Option.fromNullable,
            Option.map((firstBlock) => [
              {
                file: firstBlock.file,
                line: firstBlock.line,
                index: 0,
                error: errorLines.join('\n'),
              },
            ]),
            Option.getOrElse(() => [] as readonly ValidationError[])
          )
        : []
  );

const cleanupTempDir = (tempDir: string) =>
  pipe(
    Effect.tryPromise({
      try: () => rm(tempDir, { recursive: true, force: true }),
      catch: () => new Error(`Failed to cleanup temp dir ${tempDir}`),
    }),
    Effect.orElseSucceed(() => undefined)
  );

const formatErrorLine = (line: string): Effect.Effect<void, never, never> =>
  !line.includes('example-') || line.includes('error TS')
    ? Console.error(`   ${line}`)
    : Effect.void;

const formatError = (error: ValidationError) =>
  pipe(
    Console.error(`\n❌ ${error.file}:${error.line} (example #${error.index + 1})`),
    Effect.flatMap(() => Console.error('   Type checking failed:')),
    Effect.flatMap(() =>
      pipe(
        error.error.split('\n'),
        EffectArray.filter((line) => line.trim().length > 0),
        EffectArray.reduce(Effect.void, (acc, line) =>
          pipe(
            acc,
            Effect.flatMap(() => formatErrorLine(line))
          )
        )
      )
    )
  );

const validateMarkdownExamples = pipe(
  Effect.sync(() => ({
    packageDir: process.cwd(),
    tempDir: join(process.cwd(), '.turbo', 'validate-docs'),
  })),
  Effect.flatMap(({ packageDir, tempDir }) =>
    pipe(
      Console.log(`🔍 Validating TypeScript examples in ${packageDir}...\n`),
      Effect.flatMap(() =>
        pipe(
          Effect.tryPromise({
            try: () => rm(tempDir, { recursive: true, force: true }),
            catch: () => new Error(`Failed to clean temp dir`),
          }),
          Effect.orElseSucceed(() => undefined)
        )
      ),
      Effect.flatMap(() =>
        Effect.tryPromise({
          try: () => mkdir(tempDir, { recursive: true }),
          catch: (error) => new Error(`Failed to create temp dir: ${error}`),
        })
      ),
      Effect.flatMap(() => findMarkdownFiles(packageDir)),
      Effect.tap((files) => Console.log(`📄 Found ${files.length} markdown files`)),
      Effect.flatMap((markdownFiles) =>
        pipe(
          markdownFiles,
          EffectArray.reduce(Effect.succeed([] as readonly CodeBlock[]), (acc, file) =>
            pipe(
              acc,
              Effect.flatMap((blocks) =>
                pipe(
                  Effect.tryPromise({
                    try: () => readFile(file, 'utf-8'),
                    catch: (error) => new Error(`Failed to read ${file}: ${error}`),
                  }),
                  Effect.flatMap((content) =>
                    extractCodeBlocks(content, relative(packageDir, file))
                  ),
                  Effect.map((newBlocks) => [...blocks, ...newBlocks])
                )
              )
            )
          )
        )
      ),
      Effect.flatMap((allBlocks) =>
        allBlocks.length === 0
          ? pipe(
              Console.log('✅ No TypeScript code blocks found - skipping validation'),
              Effect.flatMap(() => cleanupTempDir(tempDir)),
              Effect.asVoid
            )
          : pipe(
              Console.log(`📝 Found ${allBlocks.length} TypeScript code blocks\n`),
              Effect.flatMap(() => Console.log('⚙️  Type checking examples...\n')),
              Effect.flatMap(() => createCombinedTempFile(allBlocks, tempDir, packageDir)),
              Effect.flatMap((tempFile) =>
                pipe(
                  typeCheckFile(tempFile, tempDir),
                  Effect.map(() => [] as readonly ValidationError[]),
                  Effect.catchAll((stdout) =>
                    Effect.succeed(parseTypeErrors(stdout as string, allBlocks))
                  )
                )
              ),
              Effect.flatMap((errors) =>
                errors.length > 0
                  ? pipe(
                      Console.log(`\n❌ Found ${errors.length} invalid example(s):\n`),
                      Effect.flatMap(() =>
                        pipe(
                          errors,
                          EffectArray.reduce(Effect.void, (acc, error) =>
                            pipe(
                              acc,
                              Effect.flatMap(() => formatError(error))
                            )
                          )
                        )
                      ),
                      Effect.flatMap(() => Console.log('\n💡 To fix these issues:')),
                      Effect.flatMap(() =>
                        Console.log('   1. Update the code examples to match current APIs')
                      ),
                      Effect.flatMap(() =>
                        Console.log('   2. Add missing imports or type annotations')
                      ),
                      Effect.flatMap(() =>
                        Console.log('   3. Verify examples compile with: bun run validate:docs\n')
                      ),
                      Effect.flatMap(() => Effect.fail(new Error('Validation failed')))
                    )
                  : Console.log(`\n✅ All ${allBlocks.length} code examples are valid!`)
              )
            )
      )
    )
  )
);

const program = pipe(
  validateMarkdownExamples,
  Effect.catchAll((error) =>
    pipe(
      Console.error(`\n💥 ${error.message}`),
      Effect.flatMap(() => Effect.fail(error))
    )
  )
);

Effect.runPromise(program)
  .then(() => process.exit(0))
  .catch(() => process.exit(1));

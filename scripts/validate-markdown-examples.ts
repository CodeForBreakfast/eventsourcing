#!/usr/bin/env bun

import { Effect, pipe, Array as EffectArray, Chunk, Console } from 'effect';
import { readdir, readFile, writeFile, mkdir, rm } from 'fs/promises';
import { join, relative } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

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

const extractCodeBlocks = (content: string, filePath: string) =>
  Effect.gen(function* () {
    const lines = content.split('\n');
    const blocks: CodeBlock[] = [];
    let inBlock = false;
    let currentBlock: string[] = [];
    let blockStartLine = 0;
    let blockIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line?.trim().match(/^```(?:typescript|ts)$/)) {
        if (inBlock) {
          yield* Console.error(`Malformed code block at ${filePath}:${i + 1} - nested code fence`);
        } else {
          inBlock = true;
          currentBlock = [];
          blockStartLine = i + 1;
        }
      } else if (line?.trim() === '```' && inBlock) {
        blocks.push({
          code: currentBlock.join('\n'),
          file: filePath,
          line: blockStartLine,
          index: blockIndex++,
        });
        inBlock = false;
        currentBlock = [];
      } else if (inBlock) {
        currentBlock.push(line ?? '');
      }
    }

    if (inBlock) {
      yield* Console.warn(
        `Unclosed code block at ${filePath}:${blockStartLine} - treating as complete`
      );
      blocks.push({
        code: currentBlock.join('\n'),
        file: filePath,
        line: blockStartLine,
        index: blockIndex,
      });
    }

    return blocks;
  });

const findMarkdownFiles = (dir: string) =>
  Effect.gen(function* () {
    const files: string[] = [];

    const processDirectory = (currentDir: string): Effect.Effect<void, Error> =>
      Effect.gen(function* () {
        const entries = yield* Effect.tryPromise({
          try: () => readdir(currentDir, { withFileTypes: true }),
          catch: (error) => new Error(`Failed to read directory ${currentDir}: ${error}`),
        });

        for (const entry of entries) {
          const fullPath = join(currentDir, entry.name);

          if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') {
            continue;
          }

          if (entry.isDirectory()) {
            yield* processDirectory(fullPath);
          } else if (entry.isFile() && entry.name.endsWith('.md')) {
            files.push(fullPath);
          }
        }
      });

    yield* processDirectory(dir);
    return files;
  });

const createCombinedTempFile = (
  blocks: readonly CodeBlock[],
  tempDir: string,
  packageDir: string
) =>
  Effect.gen(function* () {
    const filename = 'all-examples.ts';
    const filepath = join(tempDir, filename);

    // Read package.json to get package name
    const packageJsonPath = join(packageDir, 'package.json');
    const packageJsonContent = yield* Effect.tryPromise({
      try: () => readFile(packageJsonPath, 'utf-8'),
      catch: (error) => new Error(`Failed to read package.json: ${error}`),
    });
    const packageJson = JSON.parse(packageJsonContent);
    const packageName = packageJson.name;

    // Auto-import exports from the package and Effect
    // This simulates what users would have available
    const header = `// Auto-generated file for type checking all examples
// Import everything the user would import
import * as PackageExports from '${packageName}';
import { Effect, Stream, Scope, pipe, Schema, Chunk, Option, Layer, Context, Match, Data } from 'effect';

// Destructure package exports so they're available directly
const {} = PackageExports;

`;

    const wrappedBlocks = blocks.map(
      (block, idx) => `
// ===== Example ${idx}: ${block.file}:${block.line} =====
${block.code}
`
    );

    const content = header + wrappedBlocks.join('\n');

    yield* Effect.tryPromise({
      try: () => writeFile(filepath, content),
      catch: (error) => new Error(`Failed to write temp file ${filepath}: ${error}`),
    });

    // Create a tsconfig.json for validation
    const tsconfigPath = join(tempDir, 'tsconfig.json');
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

    yield* Effect.tryPromise({
      try: () => writeFile(tsconfigPath, JSON.stringify(tsconfigContent, null, 2)),
      catch: (error) => new Error(`Failed to write tsconfig: ${error}`),
    });

    return filepath;
  });

const typeCheckFile = (filepath: string, tempDir: string) =>
  Effect.gen(function* () {
    // Run tsc with the project flag to use the tsconfig in tempDir
    const proc = Bun.spawn(['bun', 'tsc', '--project', tempDir, '--noEmit'], {
      stderr: 'pipe',
      stdout: 'pipe',
    });

    const [exitCode, stdoutText] = yield* Effect.all([
      Effect.promise(() => proc.exited),
      Effect.promise(() => new Response(proc.stdout).text()),
    ]);

    if (exitCode !== 0) {
      yield* Effect.fail(stdoutText);
    }
  });

const parseTypeErrors = (stdout: string, blocks: readonly CodeBlock[]): ValidationError[] => {
  const errors: ValidationError[] = [];
  const lines = stdout.split('\n');

  // Group all error lines for reporting
  const errorLines: string[] = [];

  for (const line of lines) {
    if (line.includes('error TS')) {
      errorLines.push(line);
    }
  }

  // If we have any errors, just report them all for the first block
  // (better than nothing - proper mapping would need line number tracking)
  if (errorLines.length > 0 && blocks.length > 0) {
    const firstBlock = blocks[0];
    if (firstBlock) {
      errors.push({
        file: firstBlock.file,
        line: firstBlock.line,
        index: 0,
        error: errorLines.join('\n'),
      });
    }
  }

  return errors;
};

const cleanupTempDir = (tempDir: string) =>
  Effect.tryPromise({
    try: () => rm(tempDir, { recursive: true, force: true }),
    catch: () => new Error(`Failed to cleanup temp dir ${tempDir}`),
  }).pipe(Effect.orElseSucceed(() => undefined));

const formatError = (error: ValidationError) =>
  Effect.gen(function* () {
    yield* Console.error(`\n❌ ${error.file}:${error.line} (example #${error.index + 1})`);
    yield* Console.error('   Type checking failed:');

    const errorLines = error.error.split('\n').filter((line) => line.trim().length > 0);
    for (const line of errorLines) {
      if (!line.includes('example-') || line.includes('error TS')) {
        yield* Console.error(`   ${line}`);
      }
    }
  });

const validateMarkdownExamples = Effect.gen(function* () {
  const packageDir = process.cwd();
  const tempDir = join(packageDir, '.turbo', 'validate-docs');

  yield* Console.log(`🔍 Validating TypeScript examples in ${packageDir}...\n`);

  yield* Effect.tryPromise({
    try: () => rm(tempDir, { recursive: true, force: true }),
    catch: () => new Error(`Failed to clean temp dir`),
  }).pipe(Effect.orElseSucceed(() => undefined));

  yield* Effect.tryPromise({
    try: () => mkdir(tempDir, { recursive: true }),
    catch: (error) => new Error(`Failed to create temp dir: ${error}`),
  });

  const markdownFiles = yield* findMarkdownFiles(packageDir);

  yield* Console.log(`📄 Found ${markdownFiles.length} markdown files`);

  const allBlocks: CodeBlock[] = [];

  for (const file of markdownFiles) {
    const content = yield* Effect.tryPromise({
      try: () => readFile(file, 'utf-8'),
      catch: (error) => new Error(`Failed to read ${file}: ${error}`),
    });

    const blocks = yield* extractCodeBlocks(content, relative(packageDir, file));
    allBlocks.push(...blocks);
  }

  if (allBlocks.length === 0) {
    yield* Console.log('✅ No TypeScript code blocks found - skipping validation');
    yield* cleanupTempDir(tempDir);
    return;
  }

  yield* Console.log(`📝 Found ${allBlocks.length} TypeScript code blocks\n`);

  yield* Console.log('⚙️  Type checking examples...\n');

  const tempFile = yield* createCombinedTempFile(allBlocks, tempDir, packageDir);

  const errors = yield* pipe(
    typeCheckFile(tempFile, tempDir),
    Effect.map(() => []),
    Effect.catchAll((stdout) =>
      Effect.gen(function* () {
        return parseTypeErrors(stdout as string, allBlocks);
      })
    )
  );

  // Keep temp dir for debugging, turbo will clean it up
  // yield* cleanupTempDir(tempDir);

  if (errors.length > 0) {
    yield* Console.log(`\n❌ Found ${errors.length} invalid example(s):\n`);

    for (const error of errors) {
      yield* formatError(error);
    }

    yield* Console.log('\n💡 To fix these issues:');
    yield* Console.log('   1. Update the code examples to match current APIs');
    yield* Console.log('   2. Add missing imports or type annotations');
    yield* Console.log('   3. Verify examples compile with: bun run validate:docs\n');

    return yield* Effect.fail(new Error('Validation failed'));
  }

  yield* Console.log(`\n✅ All ${allBlocks.length} code examples are valid!`);
});

const program = pipe(
  validateMarkdownExamples,
  Effect.catchAll((error) =>
    Effect.gen(function* () {
      yield* Console.error(`\n💥 ${error.message}`);
      return yield* Effect.fail(error);
    })
  )
);

Effect.runPromise(program)
  .then(() => process.exit(0))
  .catch(() => process.exit(1));

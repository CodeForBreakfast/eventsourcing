#!/usr/bin/env node
import { exec } from 'child_process';
import { promisify } from 'util';
import { rm } from 'fs/promises';
import { glob } from 'glob';
import * as esbuild from 'esbuild';
import path from 'path';

const execAsync = promisify(exec);

// Clean dist directory
await rm('dist', { recursive: true, force: true });

// Find all TypeScript files in src
const files = await glob('src/**/*.ts');
const entryPoints = files.filter(file => !file.includes('.test.') && !file.includes('.spec.'));

// Build with esbuild
await esbuild.build({
  entryPoints,
  outdir: './dist',
  platform: 'node',
  format: 'esm',
  target: 'node18',
  sourcemap: true,
  bundle: false,
  external: [
    'effect',
    '@effect/*',
    '@codeforbreakfast/*',
    'pg',
    'postgres'
  ],
});

// Generate TypeScript declarations
await execAsync('tsc --emitDeclarationOnly --declaration --declarationMap --outDir dist');

console.log('Build completed successfully');
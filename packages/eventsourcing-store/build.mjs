#!/usr/bin/env node

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, rm, mkdir, copyFile, stat } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));

async function getAllFiles(dir, ext = '.ts') {
  const files = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await getAllFiles(fullPath, ext));
    } else if (entry.name.endsWith(ext) &&
               !entry.name.includes('.test.') &&
               !entry.name.includes('.spec.')) {
      files.push(fullPath);
    }
  }

  return files;
}

async function build() {
  try {
    // Clean dist directory
    console.log('Cleaning dist directory...');
    await rm(join(__dirname, 'dist'), { recursive: true, force: true });

    // Compile TypeScript
    console.log('Compiling TypeScript...');
    const { stdout, stderr } = await execAsync('npx tsc --project tsconfig.build.json', {
      cwd: __dirname
    });

    if (stderr && !stderr.includes('warning')) {
      console.error('TypeScript compilation errors:', stderr);
      process.exit(1);
    }

    console.log('Build completed successfully');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
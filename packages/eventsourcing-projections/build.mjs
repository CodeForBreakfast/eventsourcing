#!/usr/bin/env node

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));

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
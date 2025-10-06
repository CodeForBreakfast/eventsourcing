// Test file for prefer-effect-platform rule

// Should error: Node.js fs imports
// eslint-disable-next-line effect/prefer-effect-platform, unused-imports/no-unused-imports -- Testing filesystem import
import fs from 'node:fs';
// eslint-disable-next-line effect/prefer-effect-platform, unused-imports/no-unused-imports -- Testing filesystem import
import { readFile } from 'fs/promises';

// Should error: Node.js http imports
// eslint-disable-next-line effect/prefer-effect-platform, unused-imports/no-unused-imports -- Testing http import
import http from 'node:http';
// eslint-disable-next-line effect/prefer-effect-platform, unused-imports/no-unused-imports -- Testing http import
import https from 'https';

// Should error: Node.js path imports
// eslint-disable-next-line effect/prefer-effect-platform, unused-imports/no-unused-imports -- Testing path import
import path from 'node:path';

// Should error: Node.js child_process imports
// eslint-disable-next-line effect/prefer-effect-platform, unused-imports/no-unused-imports -- Testing command import
import { spawn } from 'child_process';

// Should error: fetch usage
const fetchData = async () => {
  // eslint-disable-next-line effect/prefer-effect-platform -- Testing fetch call
  const response = await fetch('https://example.com');
  return response;
};

// Should error: console usage
const logMessage = () => {
  // eslint-disable-next-line effect/prefer-effect-platform -- Testing console call
  console.log('Hello, world!');
};

// Should error: process.stdout usage
const writeToStdout = () => {
  // eslint-disable-next-line effect/prefer-effect-platform -- Testing process.stdout
  process.stdout.write('output');
};

// Should error: process.env usage
const getEnv = () => {
  // eslint-disable-next-line effect/prefer-effect-platform -- Testing process.env
  return process.env.NODE_ENV;
};

// Should error: Bun file operations
const bunFileOps = () => {
  // eslint-disable-next-line effect/prefer-effect-platform -- Testing Bun.file
  const file = Bun.file('test.txt');
  // eslint-disable-next-line effect/prefer-effect-platform -- Testing Bun.write
  Bun.write('output.txt', 'content');
};

// Should error: Bun spawn
const bunSpawn = () => {
  // eslint-disable-next-line effect/prefer-effect-platform -- Testing Bun.spawn
  Bun.spawn(['echo', 'hello']);
};

// Should error: Deno file operations
const denoFileOps = async () => {
  // @ts-expect-error - Deno types not available in Node environment
  // eslint-disable-next-line effect/prefer-effect-platform -- Testing Deno.readFile
  await Deno.readFile('test.txt');
  // @ts-expect-error - Deno types not available in Node environment
  // eslint-disable-next-line effect/prefer-effect-platform -- Testing Deno.writeFile
  await Deno.writeFile('output.txt', new Uint8Array());
};

// Should error: Deno Command
const denoCommand = () => {
  // @ts-expect-error - Deno types not available in Node environment
  // eslint-disable-next-line effect/prefer-effect-platform -- Testing Deno.Command
  new Deno.Command('echo', { args: ['hello'] });
};

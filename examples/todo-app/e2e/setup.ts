import { test as setup } from '@playwright/test';
import { rmSync } from 'node:fs';
import { existsSync } from 'node:fs';

setup('clean up test data directories', async () => {
  const testDataDirs = ['./todo-data', './test-todo-data'];

  for (const dir of testDataDirs) {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
      console.log(`Cleaned up ${dir}`);
    }
  }
});

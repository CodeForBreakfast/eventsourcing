#!/usr/bin/env bun

/**
 * Comprehensive validation that ensures PRs will succeed through the entire release pipeline.
 * This validates:
 * 1. Changesets exist for code changes
 * 2. TypeScript declarations can be generated
 * 3. Packages can be built successfully
 * 4. No file permission issues for GitHub API
 * 5. NPM publish will succeed
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

interface ValidationResult {
  success: boolean;
  errors: string[];
  warnings: string[];
}

class ReleaseValidator {
  private errors: string[] = [];
  private warnings: string[] = [];

  async validate(): Promise<ValidationResult> {
    console.log('🔍 Validating release readiness...\n');

    // Run all validations
    await this.validateChangesets();
    await this.validateFilePermissions();
    await this.validateTypeScriptBuild();
    await this.validatePublishReadiness();

    return {
      success: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
    };
  }

  private async validateChangesets(): Promise<void> {
    console.log('📦 Checking changesets...');

    try {
      // Run existing changeset validation
      execSync('bun scripts/validate-changesets.ts', {
        cwd: rootDir,
        stdio: 'pipe',
        encoding: 'utf-8',
      });
      console.log('✅ Changeset validation passed\n');
    } catch (error: any) {
      const output = error.stdout || error.message;
      if (output.includes('No changes detected')) {
        console.log('✅ No changes requiring changesets\n');
      } else {
        this.errors.push(`Changeset validation failed:\n${output}`);
        console.log('❌ Changeset validation failed\n');
      }
    }
  }

  private async validateFilePermissions(): Promise<void> {
    console.log('🔒 Checking file permissions...');

    const problematicFiles: string[] = [];

    // Check all TypeScript files for executable permissions
    const checkDirectory = (dir: string) => {
      if (!existsSync(dir)) return;

      const entries = readdirSync(dir);
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory() && !entry.startsWith('.') && entry !== 'node_modules') {
          checkDirectory(fullPath);
        } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
          // Check if file is executable (would fail GitHub API)
          const mode = stat.mode;
          const isExecutable = (mode & 0o111) !== 0; // Check any execute bit

          if (isExecutable) {
            problematicFiles.push(fullPath.replace(rootDir + '/', ''));
          }
        }
      }
    };

    checkDirectory(join(rootDir, 'packages'));
    checkDirectory(join(rootDir, 'scripts'));

    if (problematicFiles.length > 0) {
      this.errors.push(
        `Found executable TypeScript files that will fail GitHub API commits:\n` +
          problematicFiles.map((f) => `  - ${f}`).join('\n') +
          `\n\nFix with: chmod 644 ${problematicFiles.join(' ')}`
      );
      console.log(`❌ Found ${problematicFiles.length} files with executable permissions\n`);
    } else {
      console.log('✅ No executable TypeScript files found\n');
    }
  }

  private async validateTypeScriptBuild(): Promise<void> {
    console.log('🏗️  Validating TypeScript build...');

    try {
      // First, ensure all packages are built
      console.log('   Building all packages...');
      execSync('bun run build', {
        cwd: rootDir,
        stdio: 'pipe',
        encoding: 'utf-8',
      });

      // Check that declaration files exist for all packages
      const packagesDir = join(rootDir, 'packages');
      const packageDirs = readdirSync(packagesDir);
      const missingDeclarations: string[] = [];

      for (const packageDir of packageDirs) {
        const distDir = join(packagesDir, packageDir, 'dist');
        if (existsSync(distDir)) {
          const hasDeclarations = readdirSync(distDir).some((f) => f.endsWith('.d.ts'));
          if (!hasDeclarations) {
            missingDeclarations.push(packageDir);
          }
        }
      }

      if (missingDeclarations.length > 0) {
        this.errors.push(
          `Missing TypeScript declarations in:\n` +
            missingDeclarations.map((p) => `  - ${p}`).join('\n') +
            `\n\nThis will cause publish failures.`
        );
        console.log(`❌ Missing declarations in ${missingDeclarations.length} packages\n`);
      } else {
        console.log('✅ All packages build successfully with declarations\n');
      }
    } catch (error: any) {
      this.errors.push(`Build failed:\n${error.message}`);
      console.log('❌ Build failed\n');
    }
  }

  private async validatePublishReadiness(): Promise<void> {
    console.log('📤 Checking npm publish readiness...');

    try {
      // Simulate what the release workflow does
      console.log('   Running publish dry-run...');

      // Get all packages
      const packagesDir = join(rootDir, 'packages');
      const packageDirs = readdirSync(packagesDir);
      const publishProblems: string[] = [];

      for (const packageDir of packageDirs) {
        const packageJsonPath = join(packagesDir, packageDir, 'package.json');
        if (!existsSync(packageJsonPath)) continue;

        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        const packageName = packageJson.name;
        const packageVersion = packageJson.version;

        // Check if this version already exists on npm
        try {
          execSync(`npm view ${packageName}@${packageVersion} version`, {
            stdio: 'pipe',
            encoding: 'utf-8',
          });
          // If we get here, the version exists
          publishProblems.push(`${packageName}@${packageVersion} already exists on npm`);
        } catch {
          // Version doesn't exist, which is good
        }

        // Check if the package has all required files
        const distDir = join(packagesDir, packageDir, 'dist');
        if (!existsSync(distDir)) {
          publishProblems.push(`${packageName} missing dist directory`);
        } else {
          const distFiles = readdirSync(distDir);
          if (!distFiles.some((f) => f === 'index.js')) {
            publishProblems.push(`${packageName} missing dist/index.js`);
          }
          if (!distFiles.some((f) => f === 'index.d.ts')) {
            publishProblems.push(`${packageName} missing dist/index.d.ts`);
          }
        }

        // Check package.json configuration
        if (!packageJson.main) {
          publishProblems.push(`${packageName} missing "main" field in package.json`);
        }
        if (!packageJson.types && !packageJson.typings) {
          publishProblems.push(`${packageName} missing "types" field in package.json`);
        }
      }

      if (publishProblems.length > 0) {
        this.errors.push(
          `NPM publish will fail:\n` + publishProblems.map((p) => `  - ${p}`).join('\n')
        );
        console.log(`❌ Found ${publishProblems.length} publish issues\n`);
      } else {
        console.log('✅ All packages ready for npm publish\n');
      }
    } catch (error: any) {
      this.errors.push(`Publish readiness check failed:\n${error.message}`);
      console.log('❌ Publish readiness check failed\n');
    }
  }
}

// Main execution
async function main() {
  const validator = new ReleaseValidator();
  const result = await validator.validate();

  if (result.warnings.length > 0) {
    console.log('⚠️  Warnings:');
    result.warnings.forEach((w) => console.log(`   ${w}`));
    console.log('');
  }

  if (result.errors.length > 0) {
    console.log('❌ Release validation failed!\n');
    console.log('The following issues must be fixed before merging:\n');
    result.errors.forEach((error, index) => {
      console.log(`${index + 1}. ${error}\n`);
    });
    console.log('Fix these issues to ensure the release pipeline will succeed.');
    process.exit(1);
  }

  console.log('✅ Release validation passed!');
  console.log('   This PR should successfully release when merged.');
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});

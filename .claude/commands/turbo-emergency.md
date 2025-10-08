# 🚨 TURBO EMERGENCY DIAGNOSTIC MODE 🚨

**CRITICAL: `turbo all` is not reporting problems it should be finding locally.**

## Your Mission

1. **STOP ALL OTHER WORK IMMEDIATELY**
2. **DO NOT fix any code issues yet** - we need to fix turbo's configuration FIRST
3. **DO NOT touch the cache** - no `--force`, no clearing, no cache manipulation
4. **DO NOT fix failing tests/lints/builds** - fix the CONFIG that's hiding them

## The Problem

Agents immediately try to fix code issues that `turbo all` should find, rather than fixing why `turbo all` isn't finding them. This creates a false sense of passing when the configuration is broken.

## Step 1: Diagnose Turbo Configuration

Run these diagnostic commands IN ORDER and analyze the output:

```bash
turbo all --summarize
turbo all --dry-run=json
turbo all --graph
```

Look for:

- Tasks that should run but don't
- Tasks that are cached when they shouldn't be
- Missing task dependencies
- Incorrect task pipeline configuration

## Step 2: Examine Configuration Files

Check ALL of these files for misconfigurations:

1. **Root and package turbo.json files**
   - Verify all tasks have corresponding scripts in package.json
   - Check `inputs` configuration (MOST COMMON ISSUE)
   - Check `outputs` configuration
   - Verify task pipeline dependencies

2. **All package.json files**
   - Ensure all scripts referenced by turbo.json exist
   - Verify scripts actually fail when they should (exit codes)
   - Check for missing scripts that should exist

3. **Tool configuration files that affect task behavior**
   - .eslintrc.\* / eslint.config.js (does lint actually fail on errors?)
   - tsconfig.json (are strict checks enabled?)
   - vitest.config.ts / jest.config.js (do tests fail properly?)
   - Other tool configs that might silently pass

## Step 3: Common Misconfigurations to Find

Look for these specific patterns:

- **Missing scripts**: Task in turbo.json but no script in package.json
- **Wrong inputs**: Task inputs that don't capture all relevant files (e.g., missing config files)
- **Incorrect outputs**: Outputs that cause cache hits when there should be misses
- **Silent failures**: Scripts that don't exit with error codes when they should
- **Wrong pipeline deps**: Tasks that depend on other tasks but aren't configured properly
- **Glob patterns**: Incorrect glob patterns in inputs that miss files

## Step 4: Fix ONLY Configuration Issues

Automatically fix these configuration problems:

- Add missing scripts to package.json
- Fix inputs/outputs in turbo.json
- Correct task dependencies in pipeline
- Add missing config files to inputs
- Fix script exit codes to fail properly

**DO NOT FIX:**

- Failing tests
- Lint errors
- Type errors
- Build failures

These MUST surface after the config is fixed.

## Step 5: Verify the Fix

After fixing configuration:

```bash
turbo all
```

This should now PROPERLY REPORT the real issues that were being hidden.

If it still doesn't report expected failures, return to Step 1 and dig deeper.

## Success Criteria

- `turbo all` now fails locally when it should
- All real code issues are now visible
- Configuration is correct and comprehensive
- Cache behavior is correct (not hiding problems)

Now we can fix the actual code issues that turbo is properly reporting.

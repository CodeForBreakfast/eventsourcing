import { $ } from "bun";
import { Glob } from "bun";

// Clean dist directory
await $`rm -rf dist`;

// Find all TypeScript files in src (excluding tests)
const glob = new Glob("src/**/*.ts");
const entrypoints = [];
for await (const file of glob.scan()) {
  if (!file.includes(".test.") && !file.includes(".spec.")) {
    entrypoints.push(file);
  }
}

// Build with Bun
const result = await Bun.build({
  entrypoints,
  outdir: "./dist",
  root: "./src",
  target: "bun",
  format: "esm",
  splitting: false,
  sourcemap: "external",
  minify: false,
  naming: {
    entry: "[dir]/[name].[ext]",
  },
  external: [
    "effect",
    "@effect/*",
    "@codeforbreakfast/*",
    "pg",
    "postgres"
  ],
});

if (!result.success) {
  console.error("Build failed");
  for (const message of result.logs) {
    console.error(message);
  }
  process.exit(1);
}

// Generate TypeScript declarations using the tsconfig
console.log("Generating TypeScript declarations...");
const tscResult = await $`bun x tsc --project tsconfig.build.json`.quiet();
if (tscResult.exitCode !== 0) {
  console.warn("TypeScript declaration generation had issues but continuing...");
}

console.log("Build completed successfully");
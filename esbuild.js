const esbuild = require("esbuild");
const fs = require("node:fs/promises");
const path = require("node:path");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: "esbuild-problem-matcher",

  setup(build) {
    build.onStart(() => {
      console.log("[watch] build started");
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(
          `    ${location.file}:${location.line}:${location.column}:`,
        );
      });
      console.log("[watch] build finished");
    });
  },
};

async function copyTreeSitterAssets() {
  const runtimeWasmPath = require.resolve(
    "web-tree-sitter/web-tree-sitter.wasm",
  );
  const pythonPackagePath = require.resolve("tree-sitter-python/package.json");
  const pythonPackageDirectory = path.dirname(pythonPackagePath);

  const runtimeOutputDirectory = path.join(
    "dist",
    "node_modules",
    "web-tree-sitter",
  );
  const pythonOutputDirectory = path.join(
    "dist",
    "node_modules",
    "tree-sitter-python",
  );

  await Promise.all([
    fs.mkdir(runtimeOutputDirectory, { recursive: true }),
    fs.mkdir(pythonOutputDirectory, { recursive: true }),
  ]);

  await Promise.all([
    fs.copyFile(
      runtimeWasmPath,
      path.join(runtimeOutputDirectory, "web-tree-sitter.wasm"),
    ),
    fs.copyFile(
      pythonPackagePath,
      path.join(pythonOutputDirectory, "package.json"),
    ),
    fs.copyFile(
      path.join(pythonPackageDirectory, "tree-sitter-python.wasm"),
      path.join(pythonOutputDirectory, "tree-sitter-python.wasm"),
    ),
  ]);
}

async function main() {
  await copyTreeSitterAssets();

  const contexts = await Promise.all([
    esbuild.context({
      entryPoints: ["src/extension.ts"],
      bundle: true,
      format: "cjs",
      minify: production,
      sourcemap: !production,
      sourcesContent: false,
      platform: "node",
      outfile: "dist/extension.js",
      external: ["vscode"],
      logLevel: "silent",
      plugins: [esbuildProblemMatcherPlugin],
    }),
    esbuild.context({
      entryPoints: ["src/webview/src/App.tsx"],
      bundle: true,
      format: "iife",
      minify: production,
      sourcemap: !production,
      sourcesContent: false,
      platform: "browser",
      outfile: "dist/webview/main.js",
      logLevel: "silent",
      plugins: [esbuildProblemMatcherPlugin],
    }),
  ]);

  if (watch) {
    await Promise.all(contexts.map((ctx) => ctx.watch()));
  } else {
    await Promise.all(contexts.map((ctx) => ctx.rebuild()));
    await Promise.all(contexts.map((ctx) => ctx.dispose()));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

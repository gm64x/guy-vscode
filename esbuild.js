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
  const runtimeOutputDirectory = path.join(
    "dist",
    "node_modules",
    "web-tree-sitter",
  );
  await fs.mkdir(runtimeOutputDirectory, { recursive: true });
  await fs.copyFile(runtimeWasmPath, path.join(runtimeOutputDirectory, "web-tree-sitter.wasm"));
  const packageJson = require("./package.json");
  const grammarPackages = Object.keys(packageJson.dependencies).filter(
    (name) => name.startsWith("tree-sitter-") && name !== "tree-sitter-wasm",
  );
  for (const packageName of grammarPackages) {
    const packagePath = require.resolve(`${packageName}/package.json`);
    const directory = path.dirname(packagePath);
    const files = await fs.readdir(directory);
    const wasmFiles = files.filter((file) => file.endsWith(".wasm"));
    if (wasmFiles.length === 0) {
      throw new Error(`Grammar package ${packageName} does not contain a WASM asset.`);
    }
    const output = path.join("dist", "node_modules", packageName);
    await fs.mkdir(output, { recursive: true });
    await fs.copyFile(packagePath, path.join(output, "package.json"));
    await Promise.all(wasmFiles.map((file) => fs.copyFile(path.join(directory, file), path.join(output, file))));
  }
  const wasmPackage = "tree-sitter-wasm";
  const wasmPackageEntry = require.resolve(wasmPackage);
  const wasmPackageDirectory = path.dirname(wasmPackageEntry);
  const wasmOutput = path.join("dist", "node_modules", wasmPackage);
  await fs.mkdir(path.join(wasmOutput, "out"), { recursive: true });
  await fs.copyFile(
    path.join(wasmPackageDirectory, "package.json"),
    path.join(wasmOutput, "package.json"),
  );
  await Promise.all(
    ["go/tree-sitter-go.wasm", "rust/tree-sitter-rust.wasm"].map(async (file) => {
      const output = path.join(wasmOutput, "out", file);
      await fs.mkdir(path.dirname(output), { recursive: true });
      await fs.copyFile(path.join(wasmPackageDirectory, "out", file), output);
    }),
  );
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
      entryPoints: ["src/webview/App.tsx"],
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

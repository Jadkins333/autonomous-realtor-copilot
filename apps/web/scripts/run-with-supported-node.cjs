const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] || "0", 10);
const command = process.argv[2];
const args = process.argv.slice(3);

if (!command) {
  console.error("[web validate] Missing command to execute.");
  process.exit(1);
}

const node20Path = "/opt/homebrew/opt/node@20/bin/node";
const shouldUseNode20 = nodeMajor >= 25;

if (shouldUseNode20 && !fs.existsSync(node20Path)) {
  console.error(
    `[web validate] Node ${process.versions.node} is unsupported for this command and Node 20 is not installed at ${node20Path}.`
  );
  process.exit(1);
}

const resolvedCommand = fs.realpathSync(path.resolve(__dirname, "..", command));
const runtime = shouldUseNode20 ? node20Path : process.execPath;
const result = spawnSync(runtime, [resolvedCommand, ...args], {
  cwd: path.resolve(__dirname, ".."),
  env: process.env,
  stdio: "inherit"
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);

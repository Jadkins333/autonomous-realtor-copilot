const { execSync } = require("node:child_process");
const path = require("node:path");

const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] || "0", 10);

if (nodeMajor >= 25) {
  const rootDir = path.resolve(__dirname, "../../..");
  console.log(`[web test] Node ${process.versions.node} detected; using Docker Node 20 test path.`);
  execSync("docker compose run --build --rm web pnpm run test:local", {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env,
  });
  process.exit(0);
}

execSync("vitest run", {
  cwd: path.resolve(__dirname, ".."),
  stdio: "inherit",
  env: process.env,
});

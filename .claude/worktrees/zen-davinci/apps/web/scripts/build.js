const { execSync } = require("node:child_process");
const path = require("node:path");

const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] || "0", 10);

if (nodeMajor >= 25) {
  const rootDir = path.resolve(__dirname, "../../..");
  console.log(`[web build] Node ${process.versions.node} detected; using Docker Node 20 build path.`);
  execSync("docker compose run --build --rm web pnpm build:local", {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env,
  });
  process.exit(0);
}

execSync("next build", {
  cwd: path.resolve(__dirname, ".."),
  stdio: "inherit",
  env: process.env,
});

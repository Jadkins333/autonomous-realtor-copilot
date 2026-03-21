import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const suites = {
  api: [
    {
      id: "pytest",
      cwd: path.join(repoRoot, "apps/api"),
      command: "python3",
      args: ["-m", "pytest", "-q"],
      timeoutMs: 180_000
    }
  ],
  web: [
    {
      id: "lint",
      cwd: path.join(repoRoot, "apps/web"),
      command: "pnpm",
      args: ["lint"],
      timeoutMs: 120_000
    },
    {
      id: "typecheck",
      cwd: path.join(repoRoot, "apps/web"),
      command: "pnpm",
      args: ["typecheck"],
      timeoutMs: 120_000
    },
    {
      id: "test",
      cwd: path.join(repoRoot, "apps/web"),
      command: "pnpm",
      args: ["test"],
      timeoutMs: 120_000
    },
    {
      id: "build",
      cwd: path.join(repoRoot, "apps/web"),
      command: "pnpm",
      args: ["build"],
      timeoutMs: 240_000
    }
  ],
  mobile: [
    {
      id: "typecheck",
      cwd: path.join(repoRoot, "apps/mobile"),
      command: "pnpm",
      args: ["typecheck"],
      timeoutMs: 120_000
    }
  ]
};

function expandTargets(target) {
  if (target === "all") {
    return ["api", "web", "mobile"];
  }
  if (!(target in suites)) {
    throw new Error(`Unknown validation suite "${target}". Expected one of: ${Object.keys(suites).join(", ")}, all.`);
  }
  return [target];
}

function parseArgs(argv) {
  const [target = "all", ...rest] = argv;
  const stepArg = rest.find((value) => value.startsWith("--step"));
  if (!stepArg) {
    return { target, step: null };
  }
  const [, rawStep = ""] = stepArg.split("=");
  if (rawStep) {
    return { target, step: rawStep };
  }
  const index = rest.indexOf(stepArg);
  return { target, step: rest[index + 1] || null };
}

function runStep(suiteName, step) {
  return new Promise((resolve) => {
    const label = `[validate:${suiteName}] ${step.id}`;
    const startedAt = Date.now();
    let finished = false;
    console.log(`${label} -> ${step.command} ${step.args.join(" ")}`);

    const child = spawn(step.command, step.args, {
      cwd: step.cwd,
      env: process.env,
      stdio: "inherit",
      detached: process.platform !== "win32"
    });

    const finish = (result) => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timer);
      resolve({
        ...result,
        durationMs: Date.now() - startedAt
      });
    };

    const timer = setTimeout(() => {
      if (process.platform === "win32") {
        child.kill("SIGTERM");
      } else {
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch {
          child.kill("SIGTERM");
        }
      }
      finish({
        ok: false,
        suiteName,
        stepId: step.id,
        reason: `timed out after ${step.timeoutMs}ms`
      });
    }, step.timeoutMs);

    child.on("error", (error) => {
      finish({
        ok: false,
        suiteName,
        stepId: step.id,
        reason: error.message
      });
    });

    child.on("exit", (code, signal) => {
      if (code === 0) {
        finish({ ok: true, suiteName, stepId: step.id });
        return;
      }
      const reason = signal ? `terminated by ${signal}` : `exited with code ${code ?? "unknown"}`;
      finish({
        ok: false,
        suiteName,
        stepId: step.id,
        reason
      });
    });
  });
}

async function main() {
  const { step, target } = parseArgs(process.argv.slice(2));
  const targets = expandTargets(target);
  const failures = [];

  for (const suiteName of targets) {
    const steps = suites[suiteName].filter((entry) => !step || entry.id === step);
    if (!steps.length) {
      throw new Error(`No validation step "${step}" found for suite "${suiteName}".`);
    }

    for (const validationStep of steps) {
      const result = await runStep(suiteName, validationStep);
      if (!result.ok) {
        failures.push(result);
        console.error(
          `[validate:${suiteName}] FAILED ${validationStep.id}: ${result.reason} (${result.durationMs}ms)`
        );
      } else {
        console.log(`[validate:${suiteName}] passed ${validationStep.id} (${result.durationMs}ms)`);
      }
    }
  }

  if (failures.length) {
    console.error("\nValidation summary:");
    for (const failure of failures) {
      console.error(`- ${failure.suiteName}/${failure.stepId}: ${failure.reason} (${failure.durationMs}ms)`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("\nValidation summary:");
  for (const suiteName of targets) {
    const steps = suites[suiteName].filter((entry) => !step || entry.id === step);
    for (const validationStep of steps) {
      console.log(`- ${suiteName}/${validationStep.id}: passed`);
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

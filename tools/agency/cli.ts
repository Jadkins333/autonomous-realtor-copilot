#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

type ParsedTemplate = {
  checklist: string[];
  guardrails: string[];
  deliverables: string[];
};

const ROLE_MAP: Record<string, string> = {
  "frontend developer": "frontend-developer.md",
  "backend architect": "backend-architect.md",
  "mobile app builder": "mobile-app-builder.md",
  "devops automator": "devops-automator.md",
  "ai engineer": "ai-engineer.md",
  "reality checker": "reality-checker.md"
};

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--")) {
      args[argv[i].slice(2)] = argv[i + 1] || "";
      i += 1;
    }
  }
  return args;
}

function parseSection(lines: string[], header: string): string[] {
  const start = lines.findIndex((line) => line.trim().toLowerCase() === `## ${header}`.toLowerCase());
  if (start === -1) return [];
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line.startsWith("## ")) break;
    if (line.startsWith("- ")) out.push(line.slice(2).trim());
  }
  return out;
}

function loadTemplate(role: string): ParsedTemplate {
  const key = role.trim().toLowerCase();
  const file = ROLE_MAP[key];
  if (!file) {
    throw new Error(`Unknown role: ${role}`);
  }

  const templatePath = path.join(process.cwd(), "tools", "agency", "templates", file);
  const raw = fs.readFileSync(templatePath, "utf-8");
  const lines = raw.split(/\r?\n/);
  return {
    checklist: parseSection(lines, "Checklist"),
    guardrails: parseSection(lines, "Guardrails"),
    deliverables: parseSection(lines, "Expected Deliverables")
  };
}

function buildPlan(role: string, task: string): string[] {
  const normalizedTask = task.toLowerCase();
  const steps = [
    `Scope the task for the ${role} role and identify impacted files/components.`,
    "Implement the smallest viable diff that solves the issue.",
    "Run focused verification for touched paths (runtime + tests).",
    "Document what changed, risks, and follow-up checks."
  ];

  if (normalizedTask.includes("docker") || normalizedTask.includes("macos")) {
    steps.unshift("Stabilize container mounts/path assumptions and ensure deterministic startup behavior.");
  }
  if (normalizedTask.includes("mobile")) {
    steps.unshift("Verify iPhone and iPad behavior, including layout and API base URL handling.");
  }
  if (normalizedTask.includes("web") || normalizedTask.includes("pwa")) {
    steps.unshift("Validate PWA/offline/auth behavior across dev and production modes.");
  }

  return steps.slice(0, 6);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const role = args.role || "Reality Checker";
  const task = args.task || "General repository hardening";

  const template = loadTemplate(role);
  const plan = buildPlan(role, task);

  const output = {
    role,
    task,
    checklist: template.checklist,
    guardrails: template.guardrails,
    expected_deliverables: template.deliverables,
    role_specific_plan: plan,
    acceptance_criteria: [
      "Changes are minimal and architecture-compatible.",
      "Commands to verify are explicit and reproducible.",
      "No fabricated data or compliance bypasses are introduced."
    ]
  };

  console.log(JSON.stringify(output, null, 2));
}

main();

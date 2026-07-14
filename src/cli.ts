import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CliError, parseArgs } from "./args.js";
import { resolveTranscript } from "./discover.js";
import {
  findLastCodexUsage,
  findLastUsage,
  readTranscript,
  type CodexUsageInfo,
} from "./usage.js";
import { resolveWindow } from "./window.js";
import { buildReport } from "./report.js";
import { formatCompact, formatJson } from "./format.js";
import { formatError } from "./errors.js";

const HELP = `usage: context-axi [flags]
Reports the active Claude Code or Codex session's context-window usage as a percentage.

flags[8]:
  --cwd <dir>          use this dir instead of process cwd to locate the session
  --session <id>        select a Claude session, or a Codex rollout with --harness codex
  --transcript <path>   use this transcript file directly
  --harness <name>      choose auto, claude, or codex (default: auto)
  --window <n>          override the context window size (tokens)
  --json                print the normalized report object only
  --help                show this help
  -v/--version          print version

behavior:
  Auto mode compares the newest Claude and Codex transcripts for the current
  working directory. A rollout path is detected as Codex automatically.
  Codex cwd matching is exact-string; trailing slashes and symlink paths must
  match the rollout's recorded cwd.
  Claude windows default to 200000 or 1000000 for known 1M variants.
  Codex windows default to 272000. --window always wins.

examples:
  context-axi
  context-axi --json
  context-axi --cwd /home/example/firstmate
  context-axi --harness codex
  context-axi --window 1000000
`;

export type CliStdout = Pick<NodeJS.WriteStream, "write">;

export async function main(
  argv: string[] = process.argv.slice(2),
  stdout: CliStdout = process.stdout,
  stderr: CliStdout = process.stderr,
): Promise<number> {
  try {
    return await run(argv, stdout, stderr);
  } catch (err) {
    if (err instanceof CliError) {
      stderr.write(formatError(err.code, err.message) + "\n");
      return err.exitCode;
    }
    const message = err instanceof Error ? err.message : String(err);
    stderr.write(formatError("internal_error", message) + "\n");
    return 1;
  }
}

async function run(
  argv: string[],
  stdout: CliStdout,
  stderr: CliStdout,
): Promise<number> {
  const args = parseArgs(argv);

  if (args.help) {
    stdout.write(HELP);
    return 0;
  }

  if (args.version) {
    stdout.write(readPackageVersion() + "\n");
    return 0;
  }

  const cwd = args.cwd ?? process.cwd();

  const discovery = resolveTranscript({
    cwd,
    session: args.session,
    transcript: args.transcript,
    harness: args.harness,
  });

  if (!discovery.ok) {
    stderr.write(formatError(discovery.error.code, discovery.error.message) + "\n");
    return 1;
  }

  if (!existsSync(discovery.transcript)) {
    stderr.write(
      formatError(
        "transcript_not_found",
        `Transcript file does not exist: ${discovery.transcript}`,
      ) + "\n",
    );
    return 1;
  }

  const content = readTranscript(discovery.transcript);
  const usage =
    discovery.harness === "codex" ? findLastCodexUsage(content) : findLastUsage(content);

  if (!usage) {
    stderr.write(
      formatError(
        "no_usage_found",
        discovery.harness === "codex"
          ? `No Codex token count event with usage data found in ${discovery.transcript}`
          : `No assistant turn with usage data found in ${discovery.transcript}`,
      ) + "\n",
    );
    return 1;
  }

  const { window, source } = resolveWindow({
    override: args.window,
    model: usage.model,
    harness: discovery.harness,
  });

  const sessionId =
    discovery.harness === "codex"
      ? (usage as CodexUsageInfo).sessionId ?? discovery.sessionId
      : discovery.sessionId;

  const report = buildReport({
    tokensUsed: usage.tokensUsed,
    window,
    windowSource: source,
    model: usage.model,
    sessionId,
    transcript: discovery.transcript,
  });

  stdout.write((args.json ? formatJson(report) : formatCompact(report)) + "\n");
  return 0;
}

function readPackageVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "..", "package.json"),
    join(here, "..", "..", "package.json"),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      const pkg = JSON.parse(readFileSync(path, "utf8")) as { version?: string };
      if (pkg.version) return pkg.version;
    }
  }
  throw new CliError(
    "package_json_not_found",
    `Could not locate package.json to read version (looked in: ${candidates.join(", ")}). This indicates a broken install.`,
    1,
  );
}

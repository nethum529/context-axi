import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CliError, parseArgs } from "./args.js";
import { resolveTranscript } from "./discover.js";
import { findLastUsage, readTranscript } from "./usage.js";
import { resolveWindow } from "./window.js";
import { buildReport } from "./report.js";
import { formatCompact, formatJson } from "./format.js";
import { formatError } from "./errors.js";

const HELP = `usage: context-axi [flags]
Reports the active Claude Code session's context-window usage as a percentage.

flags[7]:
  --cwd <dir>          use this dir instead of process cwd to locate the session
  --session <id>        use ~/.claude/projects/<encoded-cwd>/<id>.jsonl
  --transcript <path>   use this transcript file directly
  --window <n>          override the context window size (tokens)
  --json                print the normalized report object only
  --help                show this help
  -v/--version          print version

behavior:
  Running with no flags reports on the most-recently-modified transcript for
  the current working directory. Window size defaults to 200000, or 1000000
  when the model string looks like a 1M-context variant ([1m] or -1m); this
  is a best-effort guess, not read from the transcript itself.

examples:
  context-axi
  context-axi --json
  context-axi --cwd /home/example/firstmate
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
  const usage = findLastUsage(content);

  if (!usage) {
    stderr.write(
      formatError(
        "no_usage_found",
        `No assistant turn with usage data found in ${discovery.transcript}`,
      ) + "\n",
    );
    return 1;
  }

  const { window, source } = resolveWindow({
    override: args.window,
    model: usage.model,
  });

  const report = buildReport({
    tokensUsed: usage.tokensUsed,
    window,
    windowSource: source,
    model: usage.model,
    sessionId: discovery.sessionId,
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

import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Claude Code encodes a project cwd as a directory name by replacing every
 * `/` and `.` with `-`. e.g. /home/example/firstmate -> -home-example-firstmate */
export function encodeCwd(cwd: string): string {
  return cwd.replace(/[/.]/g, "-");
}

export function projectsRoot(): string {
  return join(homedir(), ".claude", "projects");
}

export function projectDir(cwd: string): string {
  return join(projectsRoot(), encodeCwd(cwd));
}

export type DiscoveryError = {
  code: "no_projects_dir" | "no_transcripts";
  message: string;
};

export type DiscoveryResult =
  | { ok: true; transcript: string; sessionId: string }
  | { ok: false; error: DiscoveryError };

function stem(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.endsWith(".jsonl") ? base.slice(0, -".jsonl".length) : base;
}

/** Locate the transcript to inspect, honoring --session / --transcript overrides,
 * falling back to the most-recently-modified .jsonl in the encoded project dir. */
export function resolveTranscript(options: {
  cwd: string;
  session?: string | undefined;
  transcript?: string | undefined;
}): DiscoveryResult {
  if (options.transcript) {
    return {
      ok: true,
      transcript: options.transcript,
      sessionId: stem(options.transcript),
    };
  }

  const dir = projectDir(options.cwd);

  if (options.session) {
    const path = join(dir, `${options.session}.jsonl`);
    return { ok: true, transcript: path, sessionId: options.session };
  }

  if (!existsSync(projectsRoot())) {
    return {
      ok: false,
      error: {
        code: "no_projects_dir",
        message: `No Claude projects directory found at ${projectsRoot()}`,
      },
    };
  }

  if (!existsSync(dir)) {
    return {
      ok: false,
      error: {
        code: "no_transcripts",
        message: `No transcripts found for cwd "${options.cwd}" (expected ${dir})`,
      },
    };
  }

  const jsonlFiles = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
  if (jsonlFiles.length === 0) {
    return {
      ok: false,
      error: {
        code: "no_transcripts",
        message: `No .jsonl transcripts found in ${dir}`,
      },
    };
  }

  let newest = jsonlFiles[0]!;
  let newestMtime = statSync(join(dir, newest)).mtimeMs;
  for (const f of jsonlFiles.slice(1)) {
    const mtime = statSync(join(dir, f)).mtimeMs;
    if (mtime > newestMtime) {
      newest = f;
      newestMtime = mtime;
    }
  }

  const path = join(dir, newest);
  return { ok: true, transcript: path, sessionId: stem(newest) };
}

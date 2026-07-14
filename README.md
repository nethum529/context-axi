# context-axi

AXI-shaped CLI that reports Claude Code and Codex session context-window usage as a percentage.
It is read-only and prints token counts without message content.

## Usage

```
context-axi
context-axi --json
context-axi --cwd /home/example/firstmate
context-axi --window 1000000
context-axi --session 96fb84df-557c-4c8c-bc1c-d21870c5e09f
context-axi --transcript /path/to/session.jsonl
context-axi --harness codex
```

With `--harness auto`, the default, it reports the newest matching Claude Code or Codex transcript for the current working directory.
Claude transcripts live under `~/.claude/projects/<encoded-cwd>/`, where `<encoded-cwd>` is the absolute cwd with every `/` and `.` replaced by `-`.
Codex rollouts live under `~/.codex/sessions/YYYY/MM/DD/` and record their cwd, so discovery only considers rollouts for the requested cwd.
Codex cwd matching uses exact strings, so trailing slashes and symlink paths must match the rollout's recorded cwd.
An explicit `--transcript` whose file name starts with `rollout-` is detected as Codex automatically.

Output is a compact TOON-style key:value block plus a short next-step hint.
`--json` prints the normalized report object only, with no hint line.

## Flags

- `--cwd <dir>` - use this dir instead of `process.cwd()` to locate the session.
- `--session <id>` - pick `<id>.jsonl` in the resolved Claude project dir, or a Codex rollout with this ID when `--harness codex` is set.
- `--transcript <path>` - use this transcript file directly, bypassing discovery.
- `--harness <auto|claude|codex>` - choose a transcript harness, with `auto` as the default.
- `--window <n>` - override the context window size in tokens.
- `--json` - print the normalized report object only.
- `--help` - show usage.
- `-v` / `--version` - print version.

Unknown flags fail loud: exit code 2 with a structured JSON error on stderr.

## The window assumption

Claude transcripts do not record the context window size, so `context-axi` uses this order:

1. `--window <n>` always wins.
2. If the model string looks like a 1M-context variant (contains `[1m]` or
   `-1m`), the window is assumed to be 1,000,000 tokens.
3. Otherwise it defaults to 200,000 tokens.

Codex sessions default to 272,000 tokens.
The `windowSource` field (`override` | `model` | `default`) in `--json` output and the `note:` line in compact output identify the selected value.
Some 1M Claude sessions use a model string without `[1m]` or `-1m`, such as plain `claude-opus-4-8`.
Those sessions fall back to 200,000 tokens and may need `--window 1000000`.

## Exit codes

- `0` - success.
- `1` - definitive failure: no session directory, no transcript for the resolved cwd, or no usage data in the transcript. Structured JSON error goes to stderr.
- `2` - bad invocation: unknown flag or missing flag value.

## Development

```
npm install
npm run build
npm test
```

# context-axi

AXI-shaped CLI that reports a Claude Code session's context-window usage as a
percentage. Read-only: it never writes transcripts and never prints message
content, only token counts.

## Usage

```
context-axi
context-axi --json
context-axi --cwd /home/example/firstmate
context-axi --window 1000000
context-axi --session 96fb84df-557c-4c8c-bc1c-d21870c5e09f
context-axi --transcript /path/to/session.jsonl
```

With no flags it reports on the most-recently-modified `.jsonl` transcript
for the current working directory, looked up under
`~/.claude/projects/<encoded-cwd>/`, where `<encoded-cwd>` is the absolute
cwd with every `/` and `.` replaced by `-`.

Output is a compact TOON-style key:value block plus a short next-step hint.
`--json` prints the normalized report object only, with no hint line.

## Flags

- `--cwd <dir>` - use this dir instead of `process.cwd()` to locate the session.
- `--session <id>` - pick `<id>.jsonl` in the resolved project dir.
- `--transcript <path>` - use this transcript file directly, bypassing discovery.
- `--window <n>` - override the context window size in tokens.
- `--json` - print the normalized report object only.
- `--help` - show usage.
- `-v` / `--version` - print version.

Unknown flags fail loud: exit code 2 with a structured JSON error on stderr.

## The window assumption

The transcript format doesn't record the context window size anywhere, only
token counts and the model name. `context-axi` guesses:

1. `--window <n>` always wins.
2. If the model string looks like a 1M-context variant (contains `[1m]` or
   `-1m`), the window is assumed to be 1,000,000 tokens.
3. Otherwise it defaults to 200,000 tokens.

This is a best-effort heuristic, not a fact read from the transcript. The
`windowSource` field (`override` | `model` | `default`) in `--json` output,
and the `note:` line in compact output, say which case applied. In practice,
some 1M-context sessions use a model string that does not carry the `[1m]`
or `-1m` marker (for example plain `claude-opus-4-8`) - in that case
`context-axi` falls back to the 200,000 default and reports a percentage
over 100%, which is a hint to pass `--window 1000000` explicitly.

## Exit codes

- `0` - success.
- `1` - definitive failure: no `~/.claude/projects` directory, no transcripts
  for the resolved cwd, or no assistant turn with usage data in the
  transcript. Structured JSON error on stderr.
- `2` - bad invocation: unknown flag or missing flag value.

## Development

```
npm install
npm run build
npm test
```

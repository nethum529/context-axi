# context-axi

How full is your agent's head?

`context-axi` is a tiny CLI that prints how much of your Claude Code or Codex session's context window is used up.
It reads token counts from the session transcript on disk.
It never touches message content and never writes anything.

## How it works

```
context-axi
    |
    | 1. find the newest transcript for this directory
    |      claude: ~/.claude/projects/<encoded-cwd>/*.jsonl
    |      codex:  ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
    |
    | 2. read the last token count in it
    |
    | 3. divide by the context window
    v
  percentUsed: 68
```

That's the whole trick.
The agent already wrote its token usage to disk; this just digs it up and does the division.

## Usage

```
context-axi                  # newest session for this directory
context-axi --json           # machine-readable report
context-axi --harness codex  # force codex instead of auto-detect
context-axi --window 1000000 # tell it the window size yourself
```

More flags: `--cwd <dir>`, `--session <id>`, `--transcript <path>`, `--help`, `--version`.
Run `context-axi --help` for the full list.

## The window guess

Transcripts don't record how big the context window is, so it guesses:

1. `--window <n>` always wins.
2. Claude model strings with `[1m]` or `-1m` get 1,000,000 tokens.
3. Other Claude sessions get 200,000; Codex sessions get 272,000.

The `windowSource` field in `--json` tells you which case applied.
If your percentage looks over 100%, the guess was wrong; pass `--window`.

## Exit codes

- `0` success.
- `1` no transcript or no usage data found (JSON error on stderr).
- `2` bad invocation, like an unknown flag.

## Development

```
npm install
npm run build
npm test
```

MIT licensed.

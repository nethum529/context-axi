# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Transcript formats

- Claude Code transcripts live under `~/.claude/projects/<encoded-cwd>/` and report current context input through assistant usage records.
- Codex rollouts live under `~/.codex/sessions/YYYY/MM/DD/` and store `cwd` plus `session_id` in `session_meta` records.
- Codex models appear in `turn_context` records, while current context input comes from the final `event_msg` `token_count` record's `info.last_token_usage.input_tokens`.
- Auto discovery compares matching Claude and Codex transcripts by modification time, while Codex discovery filters rollouts by their recorded cwd.

## Session identity

- One cwd can hold many transcripts. Newest-mtime discovery is a last resort, not the normal path.
- Claude Code exports `CLAUDE_CODE_SESSION_ID` and Codex exports `CODEX_SESSION_ID`. Prefer them over mtime.
- An env session id is only trusted when its transcript exists, so `--cwd` for another project still falls through to discovery.
- When two transcripts for the cwd are live inside `CONTEXT_AXI_LIVE_WINDOW_SECONDS`, discovery returns `ambiguous_session` rather than guessing.
- Codex ambiguity scanning walks rollouts newest first and stops at the cutoff, so it does not read metadata for every rollout on disk.

# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Transcript formats

- Claude Code transcripts live under `~/.claude/projects/<encoded-cwd>/` and report current context input through assistant usage records.
- Codex rollouts live under `~/.codex/sessions/YYYY/MM/DD/` and store `cwd` plus `session_id` in `session_meta` records.
- Codex models appear in `turn_context` records, while current context input comes from the final `event_msg` `token_count` record's `info.last_token_usage.input_tokens`.
- Auto discovery compares matching Claude and Codex transcripts by modification time, while Codex discovery filters rollouts by their recorded cwd.

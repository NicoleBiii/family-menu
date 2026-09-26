# Alternating Codex and Claude Code

The owner explicitly wants to alternate between Codex and Claude Opus when usage limits are reached. Keep one repository and one authoritative set of English documents. This is sequential development, not a request for background delegation or simultaneous changes.

## Shared context

| File                         | Responsibility                                                         |
| ---------------------------- | ---------------------------------------------------------------------- |
| AGENTS.md                    | Canonical working rules for both tools                                 |
| CLAUDE.md                    | Imports AGENTS.md using Claude Code's supported import syntax          |
| docs/HANDOFF.md              | Current task, verified state, pending work and resumption instructions |
| docs/PLAN.md                 | Task IDs and completion conditions                                     |
| docs/WORK_LOG.md             | Append-only progress and decisions                                     |
| docs/decisions/              | Focused engineering decisions                                          |
| Git commits and working diff | Actual source history; verify when documents are stale                 |

## Start a session

1. Open this repository root in the chosen tool. The parent ChatGPT mirror and the old planning directory are not the active source tree.
2. Read AGENTS.md and docs/HANDOFF.md. Check the latest Git commit, branch and working diff.
3. Run `npm run handoff:status`. If another agent is recorded, confirm it has stopped before changing anything.
4. Claim the task, e.g. `npm run handoff:claim -- claude AUTH-001` or `npm run handoff:claim -- codex AUTH-001`.
5. Verify that the documented setup and baseline actually work before building on an uncertain checkpoint.

The claim uses an exclusive local file, so two cooperative agents cannot claim the same checkout concurrently. It is advisory: it cannot prevent a tool that ignores it from writing. It is ignored by Git and does not coordinate separate clones or machines. Use a single active checkout for alternating work; later parallel work needs an explicitly agreed worktree/branch arrangement.

## Planned handover

1. Stop editing and finish or interrupt active tests/deployments intentionally.
2. Preserve the working diff. Make a coherent commit where appropriate; never discard uncommitted work to make a handover look clean.
3. Update HANDOFF.md with task, branch, latest implementation commit, dirty/untracked files, checks and results, failed/unfinished work, local services and next action. Update PLAN.md and append WORK_LOG.md.
4. Commit the handover records. The implementation commit can be named in the handoff; the receiving agent should inspect Git HEAD for the subsequent documentation commit.
5. Run `npm run handoff:release -- codex` (or `claude`) and stop the session.
6. Start the other tool in the same repository. Both tools must use the same installation/check commands.

## Unexpected usage limit or crash

Do not assume the previous agent had time to write a final summary. The receiving agent must inspect Git status/diff and recent commits, read any current handoff, and inspect the active claim. Confirm with the owner that the previous agent is stopped if uncertain. Only after that confirmation, release the recorded agent's stale claim with its name and claim the task for the new agent. Do not automatically expire claims or run reset/clean commands.

Preserve incomplete changes, determine which checks ran, then rerun only the checks needed to establish a trustworthy baseline. Mark uncertain results as unverified. Never claim a green CI run from an older commit validates the current diff.

## Switching machines

Use a selected remote repository and push/fetch the recorded branch/commit. A local commit is not an off-machine backup. Transfer secrets through the chosen secret manager or local environment setup, not chat or Git. The repository currently has no configured remote.

## If “Claude Opus” means a web chat

CLAUDE.md loading applies to Claude Code and compatible coding environments. A plain web chat does not automatically gain access to this local repository. Provide the current source archive or a connected repository and the handoff explicitly. Do not upload .env, database files, tokens, or customer data. Do not assume that merely choosing the Opus model enables filesystem access.

## Reusable starting prompt

> Continue Family Menu from this repository. Read AGENTS.md, docs/HANDOFF.md and the current task in docs/PLAN.md. Inspect Git status and recent commits before changing files. Follow docs/AGENT_HANDOVER.md and verify that the previous agent has stopped before claiming the checkout. Keep project artifacts in English and discuss with me in Chinese. Preserve the confirmed MVP scope and all-member editing of pending household orders. Reuse the locked toolchain; report checks actually run and any unfinished work. Update the handoff and work log before yielding. Do not assume prior chat history or private memory is authoritative.

## References checked 2026-09-25

- [Codex project instructions](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [Claude Code shared instructions and imports](https://code.claude.com/docs/en/memory#share-one-file-with-other-coding-tools)

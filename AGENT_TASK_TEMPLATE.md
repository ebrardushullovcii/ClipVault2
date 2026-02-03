## Context Files (READ IN ORDER)

1. **AGENTS.md** - Agent rules, build commands, code conventions (CRITICAL)
2. **PROGRESS.md** - Check "Current Status Overview" for active tasks
3. **AGENT_WORKFLOW.md** - Step-by-step development process
4. **PLAN.md** - Static roadmap if relevant to this feature
5. **CLAUDE.md** - Claude-specific notes (only if you're Claude)

## Rules (STRICT)

**NEVER commit or push without explicit permission from me.**

- You can stage changes: `git add`
- You can check status: `git status`
- You CANNOT commit: ❌ `git commit`
- You CANNOT push: ❌ `git push`
- Wait for me to say "commit and push" before doing so

## Verification Steps

Before saying you're done:

1. Build the project: `.\build.ps1`
2. Run the app: `.\bin\ClipVault.exe` (for backend) or `cd ui && npm run dev` (for UI)
3. Test the feature works as described
4. Check logs for errors
5. Update PROGRESS.md with what you completed
6. If we are implementing a feature that is not tested by the above flow write scripts and do whatever to test it and make sure to not submit it until you have tested it

## Questions?

Call out anything unclear before starting work.

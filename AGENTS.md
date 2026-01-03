<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

## Project-Specific Handover Requirements

**Mutter Snapshot Extension Installation:**

This project is a GNOME Shell extension that requires manual installation steps after development. When handing over work or after making changes to the extension skeleton, schemas, or configuration:

1. **Run the installation script** (see task `mutter-snapshot-djp` for implementation):
   ```bash
   ./install-extension.sh
   ```

2. **The script will:**
   - Copy extension to `~/.local/share/gnome-shell/extensions/mutter-snapshot@mario.work/`
   - Install GSettings schema to `/usr/share/glib-2.0/schemas/` (requires sudo)
   - Compile schemas with `glib-compile-schemas`
   - Provide instructions to reload GNOME Shell

3. **After script completion:**
   - Log out and log back in to reload GNOME Shell (required in Wayland)
   - Verify extension appears in `gnome-extensions list`
   - Check logs with: `journalctl -f -o cat /usr/bin/gnome-shell | grep MutterSnapshot`

**Note:** This is a one-time setup. Future changes to extension code can be reloaded by simply re-running the script.

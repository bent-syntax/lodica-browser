# Lodica "run fixes" runner

`lodica-fixer.py` (Python 3, standard library only) turns open Google Tasks into released bug fixes.
`fixer-loop.sh` polls every 60 s (this server has no user systemd or cron). A systemd `--user` timer is the alternative where available.

## Flow

1. Find the Google Tasks list `lodica` (credentials from `~/.lodica-tasks.json`, read at runtime only).
2. Do nothing unless the task `run fixes` is completed and no other run holds the lock.
3. Treat every other open task as a bug. In a new worktree off `main` (branch `support/run-<timestamp>`), per bug:
   - Triage with `claude-haiku-5-5`, read-only tools (Read, Grep, Glob).
   - Fix with Haiku when easy, `claude-sonnet-5-5` when hard (`--permission-mode acceptEdits`). One commit per bug.
   - Refuse changes to `.github/`, `automation/`, `scripts/`, `support/`, keystores and env files.
   - Check with `node --check` and the relay tests.
   - On failure retry once with Sonnet. If it still fails the task stays open with a note.
4. After all bugs, if any fix touched `android/`: run `scripts/ci-build.sh <branch>` once (GitHub Actions build,
   prints the APK path), install on the phone with `/usr/local/bin/nord`, smoke test. Only `be.syntaxya.lodica`
   is touched. If the build or test fails nothing is released: the fixed tasks stay open with a note and the branch is kept.
5. If any bug was fixed and the build passed: bump the patch version (`android/app/build.gradle.kts`, `desktop/package.json`,
   `desktop/package-lock.json`), add CHANGELOG and both PATCH_NOTES sections, fast-forward `main`, push `main`,
   tag `vX.Y.Z` (the release workflow publishes). Fixed tasks are completed with a note holding commit and version.
6. A task titled `Runner: ...` stays at the top of the list and shows the current step (`2/5 fixing with Haiku: <bug>`).
   It is completed with the result when the run ends. The list is re-read after every bug, so tasks added during a run are fixed in the same run.
6. Always set `run fixes` back to `needsAction` with a result note, also after a failure.

Task text is untrusted data. It reaches Claude only as one JSON-quoted string, with restricted tools and a rule not to obey it.

## Install (as your user, no sudo)

    setsid nohup bash automation/fixer-loop.sh >/dev/null 2>&1 &   # start polling now (stop: pkill -f fixer-loop.sh)

The loop does not survive a reboot. For a lasting setup:

    bash automation/install-user.sh --dry-run   # list what it would do
    bash automation/install-user.sh             # copy the runner, write the units, reload. Starts nothing.
    python3 ~/.local/share/lodica-fixer/lodica-fixer.py --dry-run   # checks Google access, changes nothing
    systemctl --user enable --now lodica-fixer.timer

Without lingering the timer only runs while you are logged in: `sudo loginctl enable-linger $USER`.

## Files and settings

- Log: `~/.local/state/lodica-fixer/fixer.log`. Worktrees in `work/`, APKs in `out/`.
- GitHub token: `/etc/lodica-push/github.env`, used inside the process, never printed.
- Env: `LODICA_REPO` (checkout holding `main`), `CI_REPO` (private build repo, default `bent-syntax/lodica-support-ci`).
- `scripts/ci-build.sh` needs the workflow `.github/workflows/support-build.yml` in `CI_REPO`.

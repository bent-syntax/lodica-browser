# Support

Users send a message from Settings > Contact support (Android and desktop). It goes to their relay
(`POST /api/support`). They get a notification when it is sent, and again when the team replies, asks
for more information, or marks it fixed.

## Relay

Create `/etc/lodica-relay/support-admin-token` (at least 16 characters, readable by the relay). Without it
the admin API (`/api/support/admin`) is off. Tickets are stored in `<dataDir>/support/` for 90 days.

## Bridge

`node relay/tools/support-bridge.js` on the maintainer's server. Environment:

- `SUPPORT_RELAY` relay base URL, `SUPPORT_ADMIN_TOKEN` or `SUPPORT_ADMIN_TOKEN_PATH`
- `SLACK_BOT_TOKEN` (scope `chat:write`), `SLACK_APP_TOKEN` (`connections:write`, Socket Mode on,
  Interactivity on), `SLACK_CHANNEL` (channel id, bot invited)
- optional: `LODICA_REPO`, `SUPPORT_BUILD_CMD`, `SUPPORT_TEST_CMD`, `SUPPORT_PUBLISH_CMD`

Flow: new ticket -> Slack message with an overview and Fix / Dismiss -> Fix runs a headless Claude in a
git worktree -> build -> phone test (`tools/support-phonetest.sh`) -> only if all pass, fast-forward the
repo and run the publish command -> Slack "done" and the ticket becomes `done` (the user is notified).
If the fixer needs more details it sets `needs-info` with a question and the user is asked in the app.
Ticket text is untrusted: nothing runs until Fix is pressed.

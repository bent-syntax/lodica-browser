# Lodica support desk

Tickets by email, plus in-app tickets from the relay. Node, no framework, JSON file storage in `SUPPORT_DATA`.

## How it works

- Mailbox `lodica@syntaxya.be`. SMTP and IMAP host and port come from the env file.
- Ticket ids are `LOD-NNNN`. Reply address is `lodica+LOD-NNNN@syntaxya.be` (plus-addressing).
- Users sign in with a 6-digit code sent by email. Rate limits apply.
- Owner replies by mail are accepted only when SPF or DKIM passes and DKIM does not fail. Quoted text is stripped.
- The owner gets a mail for each new ticket.
- On every new ticket and follow-up the desk also:
  1. POSTs `{kind:"new"|"follow-up", id, title, category, from, text}` to `SUPPORT_NOTIFY_URL` with a Bearer token.
  2. Adds a Google Task to the list `lodica suggestions` (`SUPPORT_SUGGESTIONS_LIST`, created if missing). Credentials are read at runtime from `~/.lodica-tasks.json` of the service user. Set `SUPPORT_TASKS=0` to turn it off.
- Every 60 s the desk checks the task lists:
  - A ticked suggestion is copied to the work list `lodica` (`SUPPORT_TASKS_LIST`). The sender gets a mail that it is on the list.
  - A completed work task with a `LOD-NNNN` id sends the sender an "added" or "fixed" mail, once. The note line `Added in ...` or `Fixed in ...` picks which. Ideas without that line count as added.
- Every new request gets a "we received it" mail.
- Mail sent straight to the mailbox becomes a ticket only when the sender linked that address in the app. Unlinked senders get one mail a day that explains how to link. Bulk and auto-replies are ignored.
- Ticket text is untrusted data. It is only stored, mailed escaped, and written as plain task text.
- Settings come from the first env file found: `$SUPPORT_ENV_FILE`, `/etc/lodica-support.env`, `~/.lodica-support.env`, `support/.env` (git-ignored).

## In-app support

`relay/src/support.js` forwards new tickets and messages to `POST /relay/ticket` on the desk, with the shared secret
(`/etc/lodica-relay/desk-secret`, set `LODICA_DESK_URL` on the relay). Owner mail replies go back through the relay admin API,
Failed answers are queued and retried.

Linking an email: Settings > Contact support > Email updates. The app calls `POST /api/support/link/start|verify|remove` on the relay,
which passes it to `/relay/link/...` on the desk. The desk mails a 6-digit code. The code gives a link token that the app keeps
and sends with new tickets, so updates for in-app tickets also go to that address.

## Install

    sudo bash support/install.sh

Asks for the mailbox password and the notify token. Creates `/etc/lodica-support.env` from `env.template` (mode 600),
generates the shared secret, installs `lodica-support.service` and a relay drop-in with `LODICA_DESK_URL`.
Then disable the retired Slack bridge: `sudo systemctl disable --now lodica-support-bridge`.

## Test

    cd support && npm install && npm test

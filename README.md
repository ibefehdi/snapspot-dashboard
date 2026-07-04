# SnapSpot Fleet Dashboard

Self-hosted monitoring dashboard for SnapSpot photobooth agents on a Tailscale network. Discovers agents via Tailscale, monitors them agentlessly over SSH, and provides fleet status, journey tracking, logs, remote actions, camera peek, alerting, and local SQLite history.

## Prerequisites

- Node.js 20.x
- [Tailscale](https://tailscale.com/) installed on the dashboard server and joined to the same tailnet as agents
- SSH access to agents tagged `tag:snapspot` via **Tailscale SSH** (default) or OpenSSH keys
- Build tools for native modules (`node-pty`, `better-sqlite3`) — Linux/macOS recommended for production

## Quick start

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for the full guide (Tailscale → SSH → systemd → Tailscale Serve).

```bash
cd dashboard
cp .env.example .env
# Edit .env with your settings

npm install
npm run dev      # development at http://localhost:5173
npm run build
npm start        # production at http://0.0.0.0:3000
```

Production uses `server.js`, which wraps the SvelteKit handler and adds WebSocket support for the in-browser SSH terminal.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Bind address |
| `PORT` | `3000` | HTTP port |
| `SSH_USER` | `snapspot` | SSH user on agents |
| `USE_TAILSCALE_SSH` | `true` | Use `tailscale ssh` (no keys); set `false` for OpenSSH |
| `SSH_CONCURRENCY` | `15` | Max parallel SSH probes |
| `SSH_USE_CONTROL_MASTER` | `true` | OpenSSH connection multiplexing (disable on Windows dev) |
| `SSH_TIMEOUT_MS` | `10000` | SSH command timeout |
| `POLL_TAILSCALE_MS` | `15000` | Tailscale discovery interval |
| `POLL_AGENT_MS` | `30000` | Agent probe interval |
| `JOURNEY_STALE_MIN` | `15` | Minutes before an active journey is treated as stale |
| `LOG_DIR` | `/home/snapspot/.local/share/com.snapspot.dev/logs` | App log directory on agents |
| `TAILSCALE_TAG` | `tag:snapspot` | Tailscale tag filter |
| `ALERTS_ENABLED` | `false` | Enable outbound alerts |
| `NTFY_TOPIC` | — | ntfy.sh topic for alerts |
| `TELEGRAM_BOT_TOKEN` | — | Telegram bot token |
| `TELEGRAM_CHAT_ID` | — | Telegram chat ID |
| `ALERT_OFFLINE_MIN` | `5` | Minutes offline before alert |
| `ALERT_APP_DOWN_MIN` | `2` | Minutes app down before alert |
| `ALERT_ERROR_STREAK` | `3` | Consecutive failed journeys before alert |
| `ALERT_CPU_TEMP_C` | `80` | CPU temp threshold (°C) |
| `SQLITE_PATH` | `./data/snapdash.db` | Local SQLite database path |
| `HISTORY_RETENTION_DAYS` | `90` | Days of history to retain |

## Features

- **Fleet grid**: online/offline status, app health (`cage-tty1`), journey step indicator, vitals, version drift
- **One-button logs**: last 5/50 app log entries or journalctl output
- **SSH terminal**: in-browser xterm.js session via WebSocket + Tailscale SSH
- **Remote actions**: restart app, restart ustreamer, reboot (with typed confirmation)
- **Camera peek**: MJPEG proxy from ustreamer (direct or via SSH tunnel)
- **Alerts**: ntfy/Telegram for offline, app down, error streaks, high CPU temp (persisted in SQLite)
- **History**: fleet-wide charts (journeys/day, step success rates, top errors, version rollout)
- **Journey explorer**: browse individual journeys with per-step breakdown
- **Log search**: full-text search across ingested fleet logs
- **Vitals sparklines**: 24h CPU/memory/disk trends per agent
- **Uptime timeline**: 7-day availability bar per agent
- **CSV export**: download journeys, errors, or vitals history

## Local history database

History is stored in a local SQLite file (`SQLITE_PATH`). Data is ingested automatically during agent SSH probes — no external database or Vector pipeline required. History builds up from first run; allow a few probe cycles before charts populate.

Back up the database:

```bash
sqlite3 data/snapdash.db ".backup 'snapdash-backup.db'"
```

## Security

The dashboard has no built-in login. For public internet access, put nginx in front with **HTTPS + basic auth** (see [DEPLOYMENT.md](./DEPLOYMENT.md) section 7).

- Bind the app to `127.0.0.1:3000` — only nginx faces the internet.
- The VPS stays on Tailscale to reach agents; users do not need Tailscale.
- The in-browser SSH terminal connects through the VPS to agents via `tailscale ssh`.

## systemd unit example

```ini
[Unit]
Description=SnapSpot Fleet Dashboard
After=network-online.target tailscaled.service
Wants=network-online.target

[Service]
Type=simple
User=snapspot
WorkingDirectory=/opt/snapspot-dashboard
EnvironmentFile=/opt/snapspot-dashboard/.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## Remote actions and sudo

Restart/reboot commands use `sudo systemctl …`. Whether passwordless sudo works depends on your NixOS agent config. If an action fails, the dashboard surfaces stderr in the UI — verify on a real agent and adjust sudo rules if needed.

## Development on Windows

Set `SSH_USE_CONTROL_MASTER=false` in `.env` — OpenSSH ControlMaster sockets require Unix.

## Tests

```bash
npm test
```

Unit tests cover journey step inference, log ingestion deduplication, and history queries.

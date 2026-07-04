# SnapSpot Fleet Dashboard

Self-hosted monitoring dashboard for SnapSpot photobooth agents on a Tailscale network. Discovers agents via Tailscale, monitors them agentlessly over SSH, and provides fleet status, journey tracking, logs, remote actions, camera peek, alerting, and ClickHouse history.

## Prerequisites

- Node.js 20.x
- [Tailscale](https://tailscale.com/) installed on the dashboard server and joined to the same tailnet as agents
- SSH access to agents tagged `tag:snapspot` (Tailscale SSH: `tailscale ssh snapspot@<hostname>`)
- Build tools for `node-pty` native module (Linux/macOS recommended for production)

## Quick start

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
| `CLICKHOUSE_URL` | — | ClickHouse endpoint (optional) |
| `CLICKHOUSE_USER` | — | ClickHouse username |
| `CLICKHOUSE_PASSWORD` | — | ClickHouse password |
| `CLICKHOUSE_DATABASE` | `default` | Database name |
| `CLICKHOUSE_TABLE` | `app_logs_etl` | Log table name |

## Features

- **Fleet grid**: online/offline status, app health (`cage-tty1`), journey step indicator, vitals, version drift
- **One-button logs**: last 5/50 app log entries or journalctl output
- **SSH terminal**: in-browser xterm.js session via WebSocket + Tailscale SSH
- **Remote actions**: restart app, restart ustreamer, reboot (with typed confirmation)
- **Camera peek**: MJPEG proxy from ustreamer `:8081/stream`
- **Alerts**: ntfy/Telegram for offline, app down, error streaks, high CPU temp
- **History**: fleet-wide ClickHouse charts (journeys/day, step success rates, top errors)

## Security

No app-level auth in v1 — bind to the tailnet interface only. For production, use `tailscale serve` to add Tailscale identity headers:

```bash
tailscale serve --bg --https=443 http://127.0.0.1:3000
```

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

Unit tests cover journey step inference from log events.

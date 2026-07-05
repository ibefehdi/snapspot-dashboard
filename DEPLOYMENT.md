# SnapSpot Fleet Dashboard — Full Deployment Guide

This guide walks through deploying the dashboard from zero: Tailscale, SSH access to agents, the app itself, and production hardening.

**Assumptions**

- You have a Linux VPS (Ubuntu 22.04/24.04 recommended) logged in as **`fehdi`**, with a public IP or domain name.
- The VPS runs **Tailscale** only to reach agents on the tailnet — users do **not** need Tailscale to open the dashboard.
- SnapSpot photobooth agents are on the same Tailscale network, tagged `tag:snapspot`.
- Agents run the `snapspot` user and expose SSH via Tailscale SSH.
- App install path: `/home/fehdi/snapspot-dashboard`

**How it works**

```
Your phone/laptop (anywhere, any network)
        │  HTTPS + login
        ▼
VPS (fehdi) — nginx → dashboard :3000
        │  tailscale ssh (tailnet only)
        ▼
Photobooth agents (chilly-hands, …)
```

The in-browser **SSH Terminal** on each agent page connects: your browser → dashboard VPS → `tailscale ssh snapspot@agent`. You never SSH to agents directly.

---

## 1. Install Tailscale on the dashboard server

### Linux (Ubuntu/Debian)

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Follow the URL printed in the terminal to authenticate the machine into your tailnet.

Verify:

```bash
tailscale status
tailscale ip -4
```

Note the hostname (e.g. `fleet-dashboard`) and Tailscale IP — you will use these later.

### macOS

```bash
brew install --cask tailscale
# Open Tailscale from Applications and sign in
tailscale status
```

---

## 2. Tag your agents in Tailscale

The dashboard discovers peers with the tag configured in `TAILSCALE_TAG` (default: `tag:snapspot`).

In the [Tailscale admin console](https://login.tailscale.com/admin/acls) → **Access controls**, ensure agents carry the tag. Example ACL fragment:

```json
"tagOwners": {
  "tag:snapspot": ["autogroup:admin"]
},
"nodeAttrs": [
  {
    "target": ["tag:snapspot"],
    "attr": ["tag:snapspot"]
  }
]
```

Apply tags to each agent device under **Machines** → select device → **Edit route settings** / tags.

Confirm agents appear with the tag:

```bash
tailscale status --json | python3 -c "
import json, sys
for p in json.load(sys.stdin).get('Peer', {}).values():
    if 'tag:snapspot' in (p.get('Tags') or []):
        print(p.get('HostName'), p.get('TailscaleIPs', [''])[0], 'online' if p.get('Online') else 'offline')
"
```

---

## 3. Agent access via Tailscale SSH (recommended)

The dashboard talks to agents over SSH for probes, logs, camera peek, and remote actions. By default it uses **`tailscale ssh`**, not OpenSSH keys — auth is handled by your tailnet ACLs.

Set in `.env`:

```bash
USE_TAILSCALE_SSH=true
SSH_USER=snapspot
```

### 3a. Enable Tailscale SSH in your ACL

In the [Tailscale admin console](https://login.tailscale.com/admin/acls) → **Access controls**, add an SSH rule allowing your dashboard machine to reach tagged agents:

```json
"ssh": [
  {
    "action": "accept",
    "src": ["YOUR_DASHBOARD_TAG_OR_USER"],
    "dst": ["tag:snapspot"],
    "users": ["snapspot"]
  }
]
```

Example if the dashboard VPS is logged in as **`fehdi@`**:

```json
"ssh": [
  {
    "action": "accept",
    "src": ["autogroup:member"],
    "dst": ["tag:snapspot"],
    "users": ["snapspot"]
  }
]
```

If you restrict by machine tag instead, add a tag to your VPS in the admin console and use that in `src`.

Save the ACL and wait a few seconds for it to propagate.

### 3b. Test from the dashboard server

```bash
tailscale ssh snapspot@chilly-hands "hostname && systemctl is-active cage-tty1 ustreamer"
```

Replace `chilly-hands` with a real agent hostname from `tailscale status`.

If that works, **no SSH keys are needed**. Deploy the dashboard and skip section 3c.

### 3c. Alternative: OpenSSH with keys

Only use this if Tailscale SSH is not enabled in your tailnet. Set `USE_TAILSCALE_SSH=false` in `.env`.

Generate a key on the dashboard server:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/snapdash -N "" -C "snapspot-dashboard"
cat ~/.ssh/snapdash.pub
```

Install the public key **on each agent** (not on the dashboard server):

```bash
echo 'PASTE_PUBLIC_KEY_HERE' | sudo tee -a /home/snapspot/.ssh/authorized_keys
sudo chmod 600 /home/snapspot/.ssh/authorized_keys
sudo chown snapspot:snapspot /home/snapspot/.ssh/authorized_keys
```

Test:

```bash
ssh -i ~/.ssh/snapdash snapspot@chilly-hands "hostname"
```

### 3d. Sudo for remote actions (optional)

Restart/reboot buttons run `sudo systemctl …` on agents. Passwordless sudo must be configured in your NixOS/agent image. Test with whichever SSH method you use:

```bash
tailscale ssh snapspot@chilly-hands "sudo systemctl is-active cage-tty1"
```

---

## 4. Install Node.js 20 and build tools

The app requires **Node.js 20.x** (not 22) and native modules (`better-sqlite3`, `node-pty`).

### Linux (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install -y curl git build-essential python3 \
  openssh-client sqlite3

# Node 20 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

node -v   # should print v20.x
npm -v
```

### macOS

```bash
brew install node@20 git sqlite
echo 'export PATH="/opt/homebrew/opt/node@20/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
node -v   # should print v20.x
```

---

## 5. Deploy the dashboard application

All commands below run as **`fehdi`** on the VPS (no separate service account needed).

### 5a. Clone the repo

```bash
cd ~
git clone https://github.com/YOUR_ORG/snapspot-dashboard.git
cd ~/snapspot-dashboard

# Or copy from your Mac:
# rsync -av --exclude node_modules ./snapspot-dashboard/ fehdi@YOUR_VPS:~/snapspot-dashboard/
```

### 5b. Install dependencies and build

```bash
cd ~/snapspot-dashboard
npm ci
npm run build
npm test
```

### 5c. Verify Tailscale SSH works as fehdi

If `USE_TAILSCALE_SSH=true` (default), no SSH keys are needed:

```bash
tailscale ssh snapspot@chilly-hands "echo ok"
```

If you set `USE_TAILSCALE_SSH=false`, generate a key and install it on agents (see section 3c):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/snapdash -N "" -C "snapspot-dashboard"
ssh -i ~/.ssh/snapdash snapspot@chilly-hands "echo ok"
```

### 5d. Create `.env`

```bash
cp ~/snapspot-dashboard/.env.example ~/snapspot-dashboard/.env
nano ~/snapspot-dashboard/.env
```

Minimal production `.env`:

```bash
HOST=127.0.0.1
PORT=3000

SSH_USER=snapspot
SSH_CONCURRENCY=15
USE_TAILSCALE_SSH=true
SSH_USE_CONTROL_MASTER=true
SSH_TIMEOUT_MS=10000

POLL_TAILSCALE_MS=15000
POLL_AGENT_MS=30000
JOURNEY_STALE_MIN=15

LOG_DIR=/home/snapspot/.local/share/com.snapspot.dev/logs
TAILSCALE_TAG=tag:snapspot

ALERTS_ENABLED=false

SQLITE_PATH=/home/fehdi/snapspot-dashboard/data/snapdash.db
HISTORY_RETENTION_DAYS=90
```

**Important:** keep `HOST=127.0.0.1` — nginx handles public access on port 443. Port 3000 stays local to the VPS.

Create the data directory:

```bash
mkdir -p ~/snapspot-dashboard/data
```

---

## 6. Run as a systemd service

```bash
sudo tee /etc/systemd/system/snapspot-dashboard.service << 'EOF'
[Unit]
Description=SnapSpot Fleet Dashboard
After=network-online.target tailscaled.service
Wants=network-online.target

[Service]
Type=simple
User=fehdi
Group=fehdi
WorkingDirectory=/home/fehdi/snapspot-dashboard
EnvironmentFile=/home/fehdi/snapspot-dashboard/.env
ExecStart=/usr/bin/node /home/fehdi/snapspot-dashboard/server.js
Restart=on-failure
RestartSec=5

# Tailscale CLI must be reachable for fleet discovery
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable snapspot-dashboard
sudo systemctl start snapspot-dashboard
sudo systemctl status snapspot-dashboard
```

View logs:

```bash
journalctl -u snapspot-dashboard -f
```

---

## 7. Expose on the public internet (any device)

The dashboard has no built-in login. Put **nginx** in front with HTTPS and a password so anyone on the internet can reach it securely.

Tailscale stays on the VPS for agent connectivity only — your phone/laptop does **not** need the Tailscale app.

### 7a. Install nginx and Certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx apache2-utils
```

Point a DNS A record at your VPS IP, e.g. `dashboard.yourdomain.com` → your VPS IP.

If you only have an IP and no domain, skip Certbot and use HTTP on port 80 (see note at end of this section).

### 7b. Create a login (required)

```bash
sudo htpasswd -c /etc/nginx/.htpasswd fehdi
# Enter a strong password when prompted
```

To add another user later: `sudo htpasswd /etc/nginx/.htpasswd otheruser`

### 7c. nginx site config

Replace `dashboard.yourdomain.com` with your domain (or VPS IP for HTTP-only):

```bash
sudo tee /etc/nginx/sites-available/snapspot-dashboard << 'EOF'
server {
    listen 80;
    server_name dashboard.ibefehdi.com;

    location / {
        auth_basic "SnapSpot Fleet";
        auth_basic_user_file /etc/nginx/.htpasswd;

        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE fleet stream
        proxy_buffering off;
        proxy_cache off;

        # In-browser SSH terminal (WebSocket)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/snapspot-dashboard /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 7d. HTTPS with Let's Encrypt

```bash
sudo certbot --nginx -d dashboard.ibefehdi.com
```

Certbot updates the nginx config for HTTPS automatically.

### 7e. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

Port 3000 is **not** opened — only nginx (80/443) is public.

### 7f. Open from any device

Go to `https://dashboard.yourdomain.com`, enter the `fehdi` password from step 7b.

On an agent page → **SSH Terminal** tab: your session runs on the VPS and connects to the agent via Tailscale SSH. Works from any phone or laptop without Tailscale installed.

**HTTP-only (no domain):** use your VPS IP in `server_name`, skip certbot, open `http://YOUR_VPS_IP`. Still set up `htpasswd` — never expose the dashboard without a password.

**Optional tailnet-only access:** if you also want HTTPS on the tailnet, you can additionally run `sudo tailscale serve --bg --https=443 http://127.0.0.1:3000` — but public nginx access is the primary path above.

---

## 8. Verify the deployment

Run these from the dashboard server:

```bash
# Tailscale sees tagged agents
tailscale status | grep -E 'tag:snapspot|snapspot'

# API responds locally
curl -s http://127.0.0.1:3000/api/fleet | python3 -m json.tool | head -30

# SSE stream works
curl -sN http://127.0.0.1:3000/api/events | head -5

# History DB is writable
curl -s http://127.0.0.1:3000/api/history | python3 -m json.tool

# SSH probe path (replace with a real agent hostname)
curl -s http://127.0.0.1:3000/api/agents/chilly-hands/logs?n=3 | python3 -m json.tool
```

In the browser (at `https://dashboard.yourdomain.com`):

1. **Fleet** — agents appear within ~30s (one probe cycle).
2. **History** — charts populate after a few probe cycles as logs are ingested.
3. **Agent page** — vitals, uptime bar, logs, camera peek.
4. **SSH Terminal** tab — shell on the agent, proxied through the VPS (no Tailscale needed on your device).

---

## 9. Optional: enable alerts

Edit `/home/fehdi/snapspot-dashboard/.env`:

### ntfy.sh

```bash
ALERTS_ENABLED=true
NTFY_TOPIC=your-secret-topic-name
```

Subscribe on your phone: install [ntfy](https://ntfy.sh/) and subscribe to the topic.

### Telegram

```bash
ALERTS_ENABLED=true
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_CHAT_ID=-1001234567890
```

Restart after changes:

```bash
sudo systemctl restart snapspot-dashboard
```

---

## 10. Backup and maintenance

### Back up SQLite history

```bash
sqlite3 ~/snapspot-dashboard/data/snapdash.db \
  ".backup '$HOME/snapspot-dashboard/data/snapdash-backup-$(date +%F).db'"
```

### Update the dashboard

```bash
sudo systemctl stop snapspot-dashboard
cd ~/snapspot-dashboard
git pull
npm ci
npm run build
npm test
sudo systemctl start snapspot-dashboard
```

### Log rotation

Application logs go to journald:

```bash
journalctl -u snapspot-dashboard --since "1 hour ago"
```

---

## 11. Optional: gallery S3 sync

The photo gallery can cache montage images in **AWS S3** and track sync state in **Redis**. An hourly systemd timer fetches montages from **online** agents over SSH and uploads them to S3 at `{host}/{journey_id}.png`. The gallery API serves from S3 first and falls back to SSH when an image is not yet synced.

### 11a. Install Redis

```bash
sudo apt install -y redis-server
sudo systemctl enable --now redis-server
```

Redis should listen on `127.0.0.1:6379` (default). Verify:

```bash
redis-cli ping
# PONG
```

### 11b. Create S3 bucket and IAM credentials

1. Create a private S3 bucket (e.g. `snapspot-gallery`) in your preferred AWS region.
2. Create an IAM user or role with this policy (replace `BUCKET_NAME`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:HeadObject"],
      "Resource": "arn:aws:s3:::BUCKET_NAME/*"
    }
  ]
}
```

3. Generate access keys for the IAM user.

Object layout in the bucket:

```
chilly-hands/j1.png
chilly-hands/j2.png
other-agent/abc123.png
```

Optional `S3_PREFIX` env var prepends a folder (e.g. `gallery/chilly-hands/j1.png`).

### 11c. Configure environment

Add to `/home/fehdi/snapspot-dashboard/.env`:

```bash
REDIS_URL=redis://127.0.0.1:6379
GALLERY_SYNC_ENABLED=true
AWS_REGION=eu-central-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET=snapspot-gallery
S3_PREFIX=
```

Restart the dashboard after changing `.env`:

```bash
sudo systemctl restart snapspot-dashboard
```

### 11d. Hourly sync timer (systemd)

Create the service unit:

```bash
sudo tee /etc/systemd/system/snapspot-gallery-sync.service << 'EOF'
[Unit]
Description=SnapSpot gallery S3 sync
After=network-online.target redis-server.service
Wants=network-online.target

[Service]
Type=oneshot
User=fehdi
WorkingDirectory=/home/fehdi/snapspot-dashboard
EnvironmentFile=/home/fehdi/snapspot-dashboard/.env
ExecStart=/usr/bin/npm run sync:gallery
EOF
```

Create the timer:

```bash
sudo tee /etc/systemd/system/snapspot-gallery-sync.timer << 'EOF'
[Unit]
Description=Run SnapSpot gallery S3 sync hourly

[Timer]
OnCalendar=hourly
Persistent=true

[Install]
WantedBy=timers.target
EOF
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now snapspot-gallery-sync.timer
```

### 11e. Verify sync

Run a manual sync (loads `.env` from the project root automatically):

```bash
cd ~/snapspot-dashboard
npm run sync:gallery
```

If you run the script outside npm, ensure `.env` is loaded (systemd does this via `EnvironmentFile`).

Expected output:

```
Gallery sync: 2 hosts, 5 uploaded, 10 skipped, 0 failed
```

Check Redis keys:

```bash
redis-cli keys 'gallery:s3:*'
redis-cli get 'gallery:sync:last:chilly-hands'
```

Check S3 objects in the AWS console or with `aws s3 ls s3://snapspot-gallery/`.

Open the gallery page — images should load from S3 (no SSH delay for synced montages).

View timer logs:

```bash
journalctl -u snapspot-gallery-sync.service -n 50 --no-pager
systemctl list-timers snapspot-gallery-sync.timer
```

---

## 12. Development setup (Mac or Windows)

For local dev without systemd:

```bash
git clone https://github.com/YOUR_ORG/snapspot-dashboard.git
cd snapspot-dashboard
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:5173

On **Windows**, set in `.env`:

```bash
SSH_USE_CONTROL_MASTER=false
```

Ensure Tailscale is running and `tailscale status` works from the same shell.

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Empty fleet grid | `tailscale status --json` — are agents tagged `tag:snapspot`? Does `TAILSCALE_TAG` match? |
| All agents UNREACHABLE | `tailscale ssh snapspot@AGENT hostname` — check Tailscale SSH ACL (run as `fehdi`) |
| `tailscale status timed out` | Is `tailscaled` running? Is the service user PATH correct? |
| Camera peek fails | ustreamer binds to `127.0.0.1:8081` on agents — dashboard falls back to SSH curl; ensure SSH works |
| Remote actions fail | Agent sudo rules for `systemctl restart/reboot` |
| History empty | Wait 2–3 probe cycles (~90s). Check `data/snapdash.db` exists and is writable |
| Gallery images slow | Enable S3 sync (section 11). Check `npm run sync:gallery` and Redis keys `gallery:s3:*` |
| Gallery sync fails | `journalctl -u snapspot-gallery-sync.service`. Verify AWS credentials, bucket name, and agent SSH |
| Node version errors | Must be Node 20: `node -v` → `v20.x` |

### Useful debug commands

```bash
# What the dashboard sees
curl -s http://127.0.0.1:3000/api/fleet | python3 -m json.tool

# Tailscale discovery raw
tailscale status --json | python3 -m json.tool | head -50

# Probe script manually
tailscale ssh snapspot@AGENT 'systemctl is-active cage-tty1 ustreamer vector'

# Service logs
journalctl -u snapspot-dashboard -n 100 --no-pager
```

---

## Quick reference — copy/paste checklist

```bash
# 1. Tailscale
curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up

# 2. Tailscale SSH test
tailscale ssh snapspot@YOUR-AGENT "echo ok"

# 3. Node 20 + deps (Ubuntu)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git build-essential sqlite3

# 4. Deploy (as fehdi)
cd ~
git clone REPO_URL snapspot-dashboard
cd ~/snapspot-dashboard && npm ci && npm run build

# 5. Configure
cp .env.example .env
# Edit .env: HOST=127.0.0.1, USE_TAILSCALE_SSH=true, SQLITE_PATH=/home/fehdi/snapspot-dashboard/data/snapdash.db
mkdir -p ~/snapspot-dashboard/data

# 6. systemd
sudo systemctl enable --now snapspot-dashboard

# 7. Public access (nginx + login + HTTPS)
sudo apt install -y nginx certbot python3-certbot-nginx apache2-utils
sudo htpasswd -c /etc/nginx/.htpasswd fehdi
# Configure nginx site (see section 7c), then:
sudo certbot --nginx -d dashboard.yourdomain.com
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
```

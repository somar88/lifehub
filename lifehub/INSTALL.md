# LifeHub — Installation & First-Time Setup Guide

## Table of Contents

0. [Docker Deployment (Recommended)](#0-docker-deployment-recommended)
1. [Prerequisites](#1-prerequisites)
2. [Get the Code](#2-get-the-code)
3. [Install Dependencies](#3-install-dependencies)
4. [Configure Environment Variables](#4-configure-environment-variables)
5. [Run the Provisioning Wizard](#5-run-the-provisioning-wizard)
6. [Start the Server](#6-start-the-server)
7. [Verify the Installation](#7-verify-the-installation)
8. [Admin Dashboard](#8-admin-dashboard)
9. [Web Client](#9-web-client)
10. [Telegram Bot (optional)](#10-telegram-bot-optional)
11. [Running as a Linux Service](#11-running-as-a-linux-service)
12. [Ongoing Maintenance](#12-ongoing-maintenance)

---

## 0. Docker Deployment (Recommended)

The fastest way to run LifeHub is with Docker Compose. This starts MongoDB, the API server, and the client with a single command.

**Prerequisites:** Docker and Docker Compose installed.

```bash
# 1. Copy and fill in secrets
cp .env.example .env
nano .env   # set the required values listed below
```

**Required `.env` values for Docker:**

| Variable | Description |
|---|---|
| `JWT_SECRET` | Random 64-char hex string (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
| `ENCRYPTION_KEY` | Random 64-char hex string (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
| `MONGO_ROOT_PASSWORD` | Strong password for the MongoDB root user — **change this!** |

```bash
# 2. Start all services
docker compose up -d

# 3. Watch the API start up (waits for MongoDB to be healthy first)
docker compose logs -f api

# 4. Verify
curl http://localhost:3000/health
# → {"status":"ok","timestamp":"..."}

# 5a. Create first admin (interactive wizard — recommended)
docker compose exec -it api node scripts/provision.js

# 5b. Or non-interactively (CI / automated setup)
docker compose exec api node scripts/create-admin.js \
  --email admin@example.com \
  --password yourpassword \
  --name "Admin"
```

- API:    http://localhost:3000
- Client: http://localhost:8080
- Docs:   http://localhost:3000/api/docs

To stop: `docker compose down`  
To update: `git pull && docker compose up -d --build`

### Upgrading an existing Docker install (adding MongoDB auth)

If you previously ran LifeHub without MongoDB authentication, follow these steps to enable it without losing data:

```bash
# 1. Stop the stack
docker compose down

# 2. Add credentials to your .env
echo "MONGO_ROOT_USER=lifehub" >> .env
echo "MONGO_ROOT_PASSWORD=your_new_strong_password" >> .env

# 3. Start only Mongo temporarily WITHOUT auth to create the root user
docker run --rm -v lifehub_mongo_data:/data/db mongo:7 \
  mongosh --eval "
    use admin;
    db.createUser({ user: 'lifehub', pwd: 'your_new_strong_password',
      roles: [{ role: 'root', db: 'admin' }] });
  "

# 4. Restart the full stack (now with auth)
docker compose up -d
```

### Resource limits

The docker-compose file sets the following default resource limits:

| Service | CPU | Memory |
|---|---|---|
| mongo | 2 cores | 1 GB |
| api | 1 core | 512 MB |
| client | 0.5 cores | 128 MB |

Adjust these in `docker-compose.yml` under each service's `deploy.resources` block if needed.

---

## 1. Prerequisites

Before you begin, make sure the following are installed on the server.

### Node.js (v18 or higher)

```bash
node --version   # must print v18.x.x or higher
```

If you need to install or upgrade Node.js, use [nvm](https://github.com/nvm-sh/nvm):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22
```

### MongoDB (v6 or higher)

**Option A — Local MongoDB on Linux:**

```bash
# Ubuntu 22.04 (Jammy) — MongoDB 7
sudo apt-get install -y gnupg curl
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
  sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] \
  https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
  sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod
```

```bash
# Ubuntu 24.04 (Noble) — MongoDB 8 (required; 7 does not support Noble)
sudo apt-get install -y gnupg curl
curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc | \
  sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] \
  https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse" | \
  sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod
```

> **WSL note:** If `systemctl` is unavailable, start MongoDB manually:
> `sudo mongod --fork --logpath /var/log/mongod.log --dbpath /var/lib/mongodb`

**Option B — MongoDB Atlas (cloud, no local install required):**

1. Create a free account at [mongodb.com/atlas](https://www.mongodb.com/atlas)
2. Create a free M0 cluster
3. Under **Database Access**, create a user with a strong password
4. Under **Network Access**, allow your server's IP address
5. Click **Connect → Drivers** and copy the connection string  
   (looks like `mongodb+srv://user:password@cluster0.xxxxx.mongodb.net/lifehub`)

---

## 2. Get the Code

```bash
git clone <your-repository-url> lifehub
cd lifehub
```

If you received a zip file instead:

```bash
unzip lifehub.zip
cd lifehub
```

---

## 3. Install Dependencies

```bash
npm install
```

This installs all runtime and development dependencies listed in `package.json`.

> **Note:** The test suite uses `mongodb-memory-server`, which downloads a MongoDB binary on first run. This can take a minute on the first `npm test`.

---

## 4. Configure Environment Variables

Copy the example file to create your own `.env`:

```bash
cp .env.example .env
```

Now edit `.env` and fill in each value:

```bash
nano .env    # or use any editor
```

### Required settings

| Variable | Description | Example |
|---|---|---|
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/lifehub` |
| `JWT_SECRET` | Secret for signing tokens — keep private | *(generate below)* |
| `ENCRYPTION_KEY` | 32-byte hex key for encrypting DB config | *(generate below)* |
| `APP_URL` | Public URL of the server | `http://your-server-ip:3000` |

### Generate the secrets

Run these commands and paste the output into `.env`:

```bash
# JWT_SECRET — any long random string
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# ENCRYPTION_KEY — must be exactly 64 hex characters (32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Optional settings

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `JWT_EXPIRES_IN` | `7d` | How long login tokens stay valid |
| `LOG_LEVEL` | `info` | Log verbosity: `error`, `warn`, `info`, `debug` |
| `NODE_ENV` | `production` | Set to `development` for detailed error responses |
| `CLIENT_URL` | `*` | Origin allowed by CORS — set to your client URL in production |
| `GMAIL_USER` | — | Fallback Gmail address (if not configured via wizard) |
| `GMAIL_APP_PASSWORD` | — | Fallback Gmail App Password |
| `TELEGRAM_BOT_TOKEN` | — | Token from [@BotFather](https://t.me/BotFather) — bot disabled if not set |
| `TELEGRAM_WEBHOOK_URL` | — | Public HTTPS URL of the server (for webhook mode in production) |
| `TELEGRAM_USE_POLLING` | `false` | Set to `true` for local development (long-polling instead of webhook) |

### Minimal working `.env`

```dotenv
PORT=3000
MONGODB_URI=mongodb://localhost:27017/lifehub
JWT_SECRET=<output of first command above>
JWT_EXPIRES_IN=7d
ENCRYPTION_KEY=<output of second command above>
APP_URL=http://localhost:3000
CLIENT_URL=http://localhost:8080
LOG_LEVEL=info
NODE_ENV=production
```

---

## 5. Run the Provisioning Wizard

The provisioning wizard creates the first admin user and configures the email service. Run it once before starting the server for the first time.

```bash
npm run provision
```

The wizard walks you through 5 steps:

### Step 1 — Database connection

Enter your MongoDB URI (press Enter to accept the default from `.env`). The wizard tests the connection and exits if it fails.

### Step 2 — Admin user

Enter the name, email and password for the first administrator account.  
This account will have access to the admin dashboard and all admin API routes.

- Password requirements: minimum 8 characters, with at least one uppercase letter, one lowercase letter, one number, and one special character (e.g. `MyPass1!`)
- If an admin already exists you can skip or create a second one

### Step 3 — Email service

Choose how LifeHub sends emails (welcome messages, password resets):

**Option A — Gmail SMTP (simpler)**

1. Enable 2-Step Verification on the Gmail account at [myaccount.google.com/security](https://myaccount.google.com/security)
2. Generate an App Password at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)  
   — select app: **Mail**, device: **Other (custom name)**
3. Copy the 16-character password shown (spaces are stripped automatically)
4. Enter the Gmail address and App Password in the wizard

**Option B — Gmail OAuth2 (better for production, no password stored)**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project → Enable the **Gmail API**
3. Under **APIs & Services → Credentials**, create an OAuth2 Client ID (Desktop app)
4. Generate a refresh token using the OAuth2 Playground or a one-time script
5. Enter Client ID, Client Secret, and Refresh Token in the wizard

**Option C — Skip**  
Configure email later from the admin dashboard.

### Step 4 — Test email

Sends a test welcome email to the admin address to confirm delivery. You can skip this and test from the dashboard later.

### Step 5 — Summary

Shows a configuration summary and the commands to start the server.

---

## 6. Start the Server

### Production (keep running)

```bash
npm start
```

### Development (auto-restarts on file changes)

```bash
npm run dev
```

You should see:

```
2026-04-22 16:00:00 [info]: MongoDB connected
2026-04-22 16:00:00 [info]: LifeHub server running on port 3000
```

---

## 7. Verify the Installation

### Health check

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{ "status": "ok", "timestamp": "2026-04-22T16:00:00.000Z" }
```

### Test the auth API and core modules

```bash
# Register a user and capture the token
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@example.com","password":"MyPass1!"}' \
  | jq -r .token)

echo "Token: $TOKEN"

# Get your profile
curl -s http://localhost:3000/api/users/me \
  -H "Authorization: Bearer $TOKEN" | jq .

# Create a task
curl -s -X POST http://localhost:3000/api/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"First task","priority":"high"}' | jq .

# Check task stats (confirms DB read/write working)
curl -s http://localhost:3000/api/tasks/stats \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Expected stats response: `{ "todo": 1, "in-progress": 0, "done": 0, "overdue": 0 }`

---

## 8. Admin Dashboard

Open a browser and go to:

```
http://your-server-ip:3000/admin
```

Log in with the admin credentials you set in Step 2 of the provisioning wizard.

### What you can do from the dashboard

| Section | Actions |
|---|---|
| **Dashboard** | View server uptime, database status, email service status, user counts |
| **Email Config** | Switch between Gmail SMTP and OAuth2, update credentials, send a test email |
| **Users** | View and search users by name or email; approve or reject applications; create and invite users directly; resend invite emails; revoke all active sessions; toggle active/inactive; promote to admin |

### User lifecycle

Registration is invite-only — users cannot create their own accounts. The admin controls who joins:

```
POST /api/auth/apply                        →  pending
PATCH /api/admin/users/:id/approve          →  invited  (invitation email sent)
POST  /api/admin/users/:id/resend-invite    →  re-sends invite to same address
GET   /api/auth/verify-invite               →  validate invite link
POST  /api/auth/accept-invite               →  active   (user sets password)

PATCH /api/admin/users/:id/reject           →  deleted
POST  /api/admin/users                      →  invited  (admin creates directly, email sent immediately)
POST  /api/admin/users/:id/revoke-sessions  →  invalidates all active tokens for the user
```

### Admin API (for programmatic access)

All admin endpoints require a valid admin JWT in the `Authorization: Bearer <token>` header.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/admin/system/status` | Server and database health; user counts by status (active, invited, inactive, pending) |
| GET | `/api/admin/config/email` | Current email config (secrets masked) |
| PUT | `/api/admin/config/email` | Update email provider and credentials |
| POST | `/api/admin/config/email/test` | Send test email to the calling admin |
| GET | `/api/admin/users` | Paginated user list — supports `?status=pending\|invited\|active\|inactive` and `?search=xxx` |
| POST | `/api/admin/users` | Create and invite a user directly (`{ name, email, role? }`) |
| PATCH | `/api/admin/users/:id/approve` | Approve a pending application → sends invite email |
| PATCH | `/api/admin/users/:id/reject` | Reject and delete a pending application |
| PATCH | `/api/admin/users/:id` | Toggle `isActive` or change `role` |
| POST | `/api/admin/users/:id/resend-invite` | Re-send invite email to an invited user (generates a fresh token) |
| POST | `/api/admin/users/:id/revoke-sessions` | Invalidate all active sessions for a user |
| GET | `/api/admin/audit-log` | Paginated admin action log — supports `?action=xxx&adminId=xxx&targetId=xxx` |

---

## 9. Web Client

LifeHub includes a standalone web client (SPA) in the `lifehub-client/` directory. It connects to the API server over HTTP.

### Setup

```bash
cd Projects/lifehub-client
# No npm install needed — no build step, pure vanilla JS
```

### Start

```bash
# Using serve (recommended)
npx serve -l 8080 .

# Or live-server for auto-reload during development
npx live-server --port=8080 .
```

Then open `http://localhost:8080` in your browser.

### Configure the API URL

Edit [lifehub-client/config.js](../lifehub-client/config.js) to point at your API server:

```js
window.CONFIG = { apiUrl: 'http://localhost:3000' };
```

Change `http://localhost:3000` to your server's public URL when deploying to production.

### Make sure CORS is configured

Set `CLIENT_URL` in the server's `.env` to the client's origin:

```dotenv
CLIENT_URL=http://localhost:8080
```

### What the client provides

| Screen / Section | Description |
|---|---|
| **Login** | Email + password; link to the Apply screen |
| **Apply** | Submit an account application (first name, last name, email) |
| **Accept Invite** | Reached via invite link email — set a password to activate the account; live strength meter guides complexity |
| **Dashboard** | Open task count, upcoming events, monthly income/expense summary |
| **Tasks** | Create, edit, filter, and delete tasks with status and priority |
| **Calendar** | Create and manage events; per-event reminder minutes |
| **Contacts** | Full contact list with search, favorites, and tags |
| **Budget** | Category manager, transaction list, monthly summary with income/expense cards |
| **Shopping** | Multiple lists, item-level check-off, inline item add |
| **Profile → Account** | Change name, email, password (live strength meter); delete account |
| **Profile → Telegram** | Generate OTP to link Telegram; unlink button |

---

## 10. Telegram Bot (optional)

The Telegram bot lets linked users manage their LifeHub data from any device via Telegram. If `TELEGRAM_BOT_TOKEN` is not set in `.env`, the bot is silently disabled and the rest of the server works normally.

### Create the bot

1. Open Telegram and start a chat with [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow the prompts
3. Copy the token (format: `123456789:ABC...`)
4. Add it to `.env`: `TELEGRAM_BOT_TOKEN=your-token-here`

### Development mode (long-polling)

No public URL needed. Add to `.env`:

```dotenv
TELEGRAM_USE_POLLING=true
```

Then start the server with `npm run dev`. The bot connects automatically.

### Production mode (webhook)

The server must be reachable over HTTPS — Telegram's API rejects plain HTTP and self-signed certificates. The simplest path is nginx as a reverse proxy with a Let's Encrypt certificate.

**Install nginx and certbot (Ubuntu/Debian):**

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

**Get a certificate** (replace `your-domain.com`):

```bash
sudo certbot --nginx -d your-domain.com
```

**Create `/etc/nginx/sites-available/lifehub`:**

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/lifehub /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Then set in `.env`:

```dotenv
TELEGRAM_WEBHOOK_URL=https://your-domain.com
TELEGRAM_USE_POLLING=false
```

### Linking a Telegram account to LifeHub

Users link their Telegram account via an OTP generated in the web client:

1. Open the web client → **Profile → Telegram** tab
2. Click **Link Telegram** — a 6-character code appears (valid 15 minutes)
3. Open the bot in Telegram and send `/link XXXXXX`
4. The bot confirms and the web client shows "Linked"

---

## 11. Running as a Linux Service

For a server that survives reboots and restarts on crashes, use systemd.

### Create the service file

```bash
sudo nano /etc/systemd/system/lifehub.service
```

Paste (replace paths and username):

```ini
[Unit]
Description=LifeHub API Server
After=network.target mongod.service

[Service]
Type=simple
User=your-linux-username
WorkingDirectory=/home/your-linux-username/lifehub
EnvironmentFile=/home/your-linux-username/lifehub/.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=lifehub

[Install]
WantedBy=multi-user.target
```

### Enable and start

```bash
sudo systemctl daemon-reload
sudo systemctl enable lifehub
sudo systemctl start lifehub
sudo systemctl status lifehub
```

### View logs

```bash
# Live log stream
sudo journalctl -u lifehub -f

# Last 100 lines
sudo journalctl -u lifehub -n 100

# Application log files (errors)
tail -f /home/your-linux-username/lifehub/logs/error.log
```

---

## 12. Ongoing Maintenance

### Run tests

```bash
npm test                  # run all tests once
npm run test:watch        # watch mode (re-runs on file changes)
npm run test:coverage     # coverage report in coverage/
```

### Re-run the provisioning wizard

Safe to run again at any time — it will skip the admin step if an admin already exists.

```bash
npm run provision
```

### Update email configuration without the wizard

Log in to the admin dashboard at `/admin` → **Email** section.

### Rotate secrets

If you need to change `JWT_SECRET` or `ENCRYPTION_KEY`:

1. Stop the server
2. Update the values in `.env`  
   **Warning:** changing `ENCRYPTION_KEY` invalidates all encrypted values currently stored in the database (email credentials). Re-run the provisioning wizard or reconfigure email from the dashboard after rotating the key.
3. Start the server
4. All existing JWT tokens are invalidated — users will need to log in again

### Backup the database

```bash
# Local MongoDB
mongodump --uri="mongodb://localhost:27017/lifehub" --out=./backup-$(date +%Y%m%d)

# Restore
mongorestore --uri="mongodb://localhost:27017/lifehub" ./backup-20260422/lifehub
```

---

## API Reference Summary

All endpoints (except `/health`, `/api/auth/register`, `/api/auth/login`, `/api/auth/forgot-password`, `/api/auth/reset-password`) require:

```
Authorization: Bearer <jwt-token>
```

---

### Auth — `/api/auth`

| Method | Path | Description |
|---|---|---|
| POST | `/apply` | Submit account application (`{ firstName, lastName, email }`) — no password needed |
| GET | `/verify-invite` | Validate an invite link (`?token=xxx`) — returns `{ valid, email, name }` |
| POST | `/accept-invite` | Activate invited account (`{ token, password }`) — returns user + JWT |
| POST | `/login` | Log in — returns user + token |
| POST | `/forgot-password` | Send password reset email |
| POST | `/reset-password` | Set new password using reset token |

**Rate limiting:**

| Endpoint | Limit | Window |
|---|---|---|
| `POST /login` | 10 requests | per 15 minutes per IP |
| `POST /forgot-password` | 5 requests | per 1 hour per IP |
| `POST /apply` | 5 requests | per 1 hour per IP |

Exceeding the limit returns `429 Too Many Requests` with a JSON error message. Responses include standard `RateLimit-*` headers so clients can see the current limit and when the window resets.

---

### Users — `/api/users`

| Method | Path | Description |
|---|---|---|
| GET | `/me` | Get own profile (includes `lastLoginAt`, `timezone`) |
| PATCH | `/me` | Update name, timezone, or daily digest hour |
| POST | `/me/password` | Change password (requires `currentPassword` + `newPassword`) — returns new token |
| PATCH | `/me/email` | Initiate email change — sends verification link to new address (requires `email` + `currentPassword`) |
| GET | `/me/email/verify` | Apply pending email change (`?token=xxx`) — no auth required |
| DELETE | `/me` | Delete own account and all data (requires `password`) |

---

### Tasks — `/api/tasks`

| Method | Path | Description |
|---|---|---|
| GET | `/` | List tasks |
| POST | `/` | Create task |
| GET | `/stats` | Counts by status + overdue count |
| GET | `/:id` | Get single task |
| POST | `/:id/duplicate` | Clone task (status reset to `todo`) |
| PATCH | `/:id` | Update task |
| DELETE | `/:id` | Delete task |

**GET / query parameters:**

| Parameter | Values | Description |
|---|---|---|
| `status` | `todo` \| `in-progress` \| `done` | Filter by status |
| `priority` | `low` \| `medium` \| `high` | Filter by priority |
| `tag` | any string | Filter by tag |
| `dueAfter` | ISO 8601 date | Tasks due on or after this date |
| `dueBefore` | ISO 8601 date | Tasks due on or before this date |
| `sortBy` | `createdAt` \| `dueDate` \| `priority` | Sort field (default: `createdAt`) |
| `order` | `asc` \| `desc` | Sort direction (default: `desc`) |
| `page` / `limit` | numbers | Pagination (default: page 1, limit 20) |

---

### Calendar — `/api/calendar`

| Method | Path | Description |
|---|---|---|
| GET | `/` | List events |
| POST | `/` | Create event |
| GET | `/upcoming` | Next N events from now (sorted by start) |
| GET | `/:id` | Get single event |
| PATCH | `/:id` | Update event |
| DELETE | `/:id` | Delete event |

**GET / query parameters:**

| Parameter | Values | Description |
|---|---|---|
| `from` | ISO 8601 date | Start of date range (inclusive, overlap logic) |
| `to` | ISO 8601 date | End of date range (inclusive, overlap logic) |
| `allDay` | `true` \| `false` | Filter all-day vs timed events |
| `search` | any string | Search title and description |
| `page` / `limit` | numbers | Pagination (default: page 1, limit 50) |

**GET /upcoming query parameters:**

| Parameter | Default | Description |
|---|---|---|
| `limit` | `5` | Number of events to return (max 50) |

---

### Contacts — `/api/contacts`

| Method | Path | Description |
|---|---|---|
| GET | `/` | List contacts |
| POST | `/` | Create contact |
| GET | `/:id` | Get single contact |
| PATCH | `/:id` | Update contact |
| PATCH | `/:id/favorite` | Toggle favorite on/off |
| DELETE | `/:id` | Delete contact |

**GET / query parameters:**

| Parameter | Values | Description |
|---|---|---|
| `search` | any string | Case-insensitive match across name, email, phone, company, address |
| `tag` | any string | Filter by tag |
| `sortBy` | `firstName` \| `lastName` \| `company` \| `createdAt` | Sort field (default: `firstName`) |
| `order` | `asc` \| `desc` | Sort direction (default: `asc`) |
| `page` / `limit` | numbers | Pagination (default: page 1, limit 50) |

---

### Budget — `/api/budget`

| Method | Path | Description |
|---|---|---|
| GET | `/categories` | List own categories |
| POST | `/categories` | Create category |
| GET | `/categories/:id` | Get single category |
| PATCH | `/categories/:id` | Update category |
| DELETE | `/categories/:id` | Delete category (nullifies related transactions) |
| GET | `/transactions` | List transactions |
| POST | `/transactions` | Create transaction |
| GET | `/transactions/:id` | Get single transaction (category populated) |
| PATCH | `/transactions/:id` | Update transaction |
| DELETE | `/transactions/:id` | Delete transaction |
| GET | `/summary` | Income/expense totals, balance, breakdown by category |

**GET /transactions query parameters:**

| Parameter | Values | Description |
|---|---|---|
| `type` | `income` \| `expense` | Filter by type |
| `categoryId` | MongoDB ObjectId | Filter by category |
| `from` | ISO 8601 date | Transactions on or after this date |
| `to` | ISO 8601 date | Transactions on or before this date |
| `page` / `limit` | numbers | Pagination (default: page 1, limit 50) |

**GET /summary query parameters:** same `from` / `to` date range as transactions.

---

### Shopping Lists — `/api/shopping`

| Method | Path | Description |
|---|---|---|
| GET | `/` | List own shopping lists |
| POST | `/` | Create shopping list |
| GET | `/:id` | Get single list with all items |
| PATCH | `/:id` | Rename list |
| DELETE | `/:id` | Delete list |
| POST | `/:id/items` | Add item to list |
| PATCH | `/:id/items/:itemId` | Update item fields |
| PATCH | `/:id/items/:itemId/toggle` | Toggle item checked on/off |
| DELETE | `/:id/items/:itemId` | Remove item from list |

**GET / query parameters:**

| Parameter | Default | Description |
|---|---|---|
| `page` / `limit` | page 1, limit 20 | Pagination |

**POST / body:**

| Field | Required | Description |
|---|---|---|
| `name` | Yes | List name (max 200 characters) |

**POST /:id/items body:**

| Field | Required | Description |
|---|---|---|
| `name` | Yes | Item name (max 200 characters) |
| `quantity` | No | Quantity (default: `1`) |
| `unit` | No | Unit label, e.g. `kg`, `L`, `pcs` (default: empty) |

**PATCH /:id/items/:itemId body:** same optional fields as above (`name`, `quantity`, `unit`). `checked` is managed via the `/toggle` endpoint.

---

### Admin — `/api/admin` *(admin role required)*

| Method | Path | Description |
|---|---|---|
| GET | `/system/status` | Server uptime, DB state, email status, user counts by status |
| GET | `/config/email` | Current email config (secrets masked) |
| PUT | `/config/email` | Update email provider and credentials |
| POST | `/config/email/test` | Send test email to the calling admin |
| GET | `/users` | Paginated user list — `?status=pending\|invited\|active\|inactive`, `?search=xxx` |
| POST | `/users` | Create and invite a user (`{ name, email, role? }`) |
| PATCH | `/users/:id/approve` | Approve pending user → sends invite email |
| PATCH | `/users/:id/reject` | Delete pending user |
| PATCH | `/users/:id` | Toggle `isActive` or change `role` |
| POST | `/users/:id/resend-invite` | Re-send invite email (new token) |
| POST | `/users/:id/revoke-sessions` | Invalidate all active sessions for a user |
| GET | `/audit-log` | Paginated admin action log (`?action=xxx&adminId=xxx&targetId=xxx&page=1&limit=20`) |

---

### Telegram — `/api/telegram` *(auth required)*

| Method | Path | Description |
|---|---|---|
| POST | `/link-code` | Generate a 6-char OTP for bot linking — returns `{ code, expiresIn: 900 }` |
| DELETE | `/link` | Unlink Telegram — clears `telegramChatId` |

Rate limit on `POST /link-code`: 5 requests per hour per user.

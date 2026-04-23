# LifeHub — Deployment Package

This folder is the self-contained deployment package for LifeHub.  
It was assembled by `build.sh` from the source repository.

```
dist/
├── README.md              ← you are here
├── docker-compose.yml     ← starts all three services
├── .env.example           ← copy to .env and fill in secrets
├── server/                ← Node/Express API + admin UI
│   ├── Dockerfile
│   ├── package.json
│   ├── server.js
│   ├── src/
│   ├── public/            ← admin dashboard static files
│   ├── scripts/           ← provisioning wizard
│   ├── INSTALL.md         ← full installation guide
│   └── USER_GUIDE.md      ← API reference + bot commands
└── client/                ← vanilla JS web client (served by nginx)
    ├── index.html
    ├── app.js
    ├── style.css
    ├── utils.js
    └── config.js
```

---

## Quick start (Docker — recommended)

**Prerequisites:** Docker and Docker Compose installed.

```bash
# 1. Copy and fill in secrets
cp .env.example .env
nano .env          # set JWT_SECRET and ENCRYPTION_KEY at minimum

# 2. Start all services
docker compose up -d

# 3. Watch the API start
docker compose logs -f api

# 4. Verify
curl http://localhost:3000/health
# → {"status":"ok","timestamp":"..."}
```

- API:    http://localhost:3000
- Client: http://localhost:8080
- Docs:   http://localhost:3000/api/docs
- Admin:  http://localhost:3000/admin

### Generate secrets

```bash
# JWT_SECRET (paste into .env)
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# ENCRYPTION_KEY — must be exactly 64 hex chars (paste into .env)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## First-time setup

After the containers are running, create the first admin account using one of two methods:

### Interactive wizard (recommended for first-time users)

```bash
docker compose exec -it api node scripts/provision.js
```

The wizard walks through admin user creation, email config, and a test email.

### Non-interactive (CI / Docker bootstrap)

```bash
docker compose exec api node scripts/create-admin.js \
  --email admin@example.com \
  --password yourpassword \
  --name "Admin"
```

Configure email later from the admin dashboard at `/admin`.

---

## Manual (non-Docker) install

See `server/INSTALL.md` for the full step-by-step guide including:
- Installing Node.js 18+ and MongoDB 6+
- Configuring environment variables
- Running the provisioning wizard
- Setting up a systemd service for auto-start

---

## Updating

```bash
# Pull the new dist package, then:
docker compose up -d --build
```

Data in MongoDB is preserved in the `mongo_data` Docker volume.

---

## Stopping / removing

```bash
docker compose down          # stop containers, keep data
docker compose down -v       # stop containers AND delete all data
```

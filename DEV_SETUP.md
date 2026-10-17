# UniFlow Ops — Development Environment Setup

This document describes how to set up and run the **development** deployment alongside the existing **production** deployment on the VM, using Git branch `dev-1`.

---

## Architecture Overview

| Concern | Production | Development |
|---|---|---|
| Git branch | `main` | `dev-1` |
| Compose file | `docker-compose.yml` | `docker-compose.dev.yml` |
| Container name | `uniflow_ops_app` | `uniflow_ops_dev_app` |
| Host port | `4000` | `4001` |
| Env file | `.env` | `.env.dev` |
| Database | `uniflow_ops` | `uniflow_ops_dev` |
| DB user | `uniflow_ops_app` | `uniflow_ops_dev` |
| Docker image | `Dockerfile` | `Dockerfile.dev` |

Both deployments share the existing Docker network `mysql-server_default` and MySQL container `mysql_server`.

---

## Step 0 — Prerequisites

These steps must be completed **once** by a VM administrator **before** the dev container can start.

### 0a. Create the development database and user

Connect to MySQL on the VM using an account with `GRANT` privileges (e.g. root or the MySQL admin):

```bash
# Connect to the running MySQL container
docker exec -it mysql_server mysql -u root -p
```

Then run:

```sql
-- Create the development database
CREATE DATABASE IF NOT EXISTS uniflow_ops_dev
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Create the development user
-- IMPORTANT: Choose a strong, unique password different from the production password.
CREATE USER IF NOT EXISTS 'uniflow_ops_dev'@'%' IDENTIFIED BY 'REPLACE_WITH_STRONG_DEV_PASSWORD';

-- Grant permissions ONLY on the development database.
-- This user has zero access to uniflow_ops (production).
GRANT ALL PRIVILEGES ON uniflow_ops_dev.* TO 'uniflow_ops_dev'@'%';

-- Apply
FLUSH PRIVILEGES;

-- Verify (should show uniflow_ops_dev.* GRANT only)
SHOW GRANTS FOR 'uniflow_ops_dev'@'%';
```

> **Safety**: `uniflow_ops_dev` has **no access** to `uniflow_ops`. Even if the dev container misconfigures its database name, the MySQL server will reject the connection.

### 0b. Create the `.env.dev` file on the VM

```bash
# Navigate to the project directory on the VM (dev-1 checkout)
cp .env.dev.example .env.dev
nano .env.dev
```

Replace **every** placeholder value:

| Variable | Required value |
|---|---|
| `DB_NAME` | Must be exactly `uniflow_ops_dev` |
| `DB_USER` | Must be exactly `uniflow_ops_dev` |
| `DB_PASSWORD` | The password set in Step 0a |
| `JWT_SECRET` | A long random secret (different from production) |
| `BOOTSTRAP_ADMIN_PASSWORD` | Dev-only admin password |
| `BOOTSTRAP_SUPERVISOR_PASSWORD` | Dev-only supervisor password |
| `BOOTSTRAP_OPERATOR_PASSWORD` | Dev-only operator password |

`.env.dev` is excluded from Git and must **never** be committed.

---

## Step 1 — Git Workflow: Make and Push Changes

Work in Antigravity (locally), then commit and push to the `dev-1` branch:

```bash
# On your local machine — inside the project directory

# Ensure you are on the dev-1 branch
git checkout dev-1

# Stage and commit your changes
git add .
git commit -m "feat: describe your change here"

# Push to dev-1
git push origin dev-1
```

> **Rule**: Never merge `dev-1` into `main` automatically. Production updates are handled separately and intentionally.

---

## Step 2 — On the VM: Pull dev-1

```bash
# SSH into the VM
# Navigate to the development checkout directory
cd /path/to/uniflow-dev     # This must be a SEPARATE directory from the production checkout

# Pull the latest dev-1 changes
git pull origin dev-1
```

> Keep the production directory (`main` branch) completely separate from the development directory (`dev-1` branch). Never run `git pull` inside the production directory unless you intend to update production.

---

## Step 3 — Build and Start the Development Container

Always specify `docker-compose.dev.yml` explicitly to avoid accidentally affecting production:

```bash
# Build and start the development container
docker compose -f docker-compose.dev.yml up -d --build

# Follow startup logs
docker compose -f docker-compose.dev.yml logs -f uniflow-ops-dev
```

The development app will be available at `http://<VM-IP>:4001/`.

The startup log will confirm:
- Which port is used (`PORT=4001`)
- Which database is connected (`DB_NAME=uniflow_ops_dev`)

If `DB_NAME` or `DB_USER` are missing or point to the production database, the server will **refuse to start** with a `[DEV GUARD]` error. This prevents accidental migration of the production database.

---

## Step 4 — Health Check

```bash
curl http://localhost:4001/api/health
```

Expected response:
```json
{ "status": "ok", "database": "connected" }
```

---

## Step 5 — First-Time Dev Admin Bootstrap

On the first startup against an empty `uniflow_ops_dev`:

```bash
docker compose -f docker-compose.dev.yml exec uniflow-ops-dev \
  node dist-server/db/bootstrap-admin.js
```

---

## Step 6 — Stop the Development Container

```bash
docker compose -f docker-compose.dev.yml down
```

This only stops the `uniflow_ops_dev_app` container. Production (`uniflow_ops_app`) is completely unaffected.

---

## Updating the Development Deployment

```bash
# On the VM — inside the dev-1 directory
git pull origin dev-1
docker compose -f docker-compose.dev.yml up -d --build
docker compose -f docker-compose.dev.yml logs -f uniflow-ops-dev
```

---

## Updating Production (Separate, Intentional Step)

```bash
# On the VM — inside the PRODUCTION directory (main branch)
git pull origin main
docker compose -f docker-compose.yml up -d --build
docker compose -f docker-compose.yml logs -f uniflow-ops
curl http://localhost:4000/api/health
```

---

## Safety Rules

1. **Never** use `docker-compose.yml` in the dev directory.
2. **Never** use `docker-compose.dev.yml` in the production directory.
3. **Never** set `DB_NAME=uniflow_ops` in `.env.dev` — the app will refuse to start.
4. **Never** commit `.env.dev` — it is excluded by `.gitignore`.
5. **Never** merge `dev-1` into `main` without an intentional review.
6. **Always** use `-f docker-compose.dev.yml` explicitly for dev commands.
7. **Always** use `-f docker-compose.yml` explicitly for prod commands.

---

## Port Conflict Check (Precaution)

Before starting the dev container, verify port 4001 is free on the VM:

```bash
ss -tlnp | grep 4001
```

If output is empty, port 4001 is available.

---

## Unresolved Prerequisites

Before the dev container can run, a VM administrator must complete:

- [ ] Step 0a: Create `uniflow_ops_dev` database and `uniflow_ops_dev` MySQL user
- [ ] Step 0b: Create `.env.dev` from `.env.dev.example` with real credentials
- [ ] Confirm port `4001` is accessible through any VM firewall/security group if remote access is needed
- [ ] (Optional) Configure `devuniflow.innovus.lk` DNS and reverse proxy if a subdomain is desired

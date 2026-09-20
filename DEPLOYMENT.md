# UniFlow Ops — VM Docker Deployment Guide

This guide details step-by-step instructions for deploying **UniFlow Ops** on a Virtual Machine using Docker, connecting to an existing MySQL container (`mysql_eco360`) running on the Docker network `mysql-server_default`.

---

## Prerequisites
- Docker & Docker Compose V2 installed on the VM.
- Existing MySQL container `mysql_eco360` running on network `mysql-server_default`.
- MySQL database `uniflow_ops` created with user `uniflow_ops_app` granted privileges.

---

## 1. Initial Setup & Configuration

Clone the repository and prepare the production environment file:

```bash
# 1. Clone repository
git clone <your-repository-url>
cd UniFlowOps

# 2. Copy environment template
cp .env.example .env

# 3. Edit .env and configure secrets
nano .env
```

Ensure `.env` contains the required production values:
```env
NODE_ENV=production
PORT=4000
DB_HOST=mysql_eco360
DB_PORT=3306
DB_NAME=uniflow_ops
DB_USER=uniflow_ops_app
DB_PASSWORD=your_secure_mysql_password
JWT_SECRET=your_secure_jwt_secret
BOOTSTRAP_ADMIN_USERNAME=admin
BOOTSTRAP_ADMIN_PASSWORD=your_secure_admin_password
```

---

## 2. Build & Deploy with Docker Compose

Build and launch the application container in detached mode:

```bash
# Build and start container
docker compose up -d --build

# Follow container startup logs
docker compose logs -f uniflow-ops
```

---

## 3. Health Check Verification

Verify that the container health check and MySQL connection are working cleanly:

```bash
# Check container status & health
docker compose ps

# Test health endpoint
curl http://localhost:4000/api/health
```

Expected HTTP 200 Response:
```json
{
  "status": "ok",
  "database": "connected"
}
```

---

## 4. First-Deployment Admin Bootstrap

On initial deployment to an empty database, create the initial System Admin account:

```bash
docker compose exec uniflow-ops npm run bootstrap:admin
```

This command:
- Reads `BOOTSTRAP_ADMIN_USERNAME` and `BOOTSTRAP_ADMIN_PASSWORD` from `.env`.
- Hashes the password securely using bcryptjs.
- Creates an `ADMIN` user only if the username does not already exist (idempotent).
- Does NOT seed demo data or overwrite existing users.

---

## 5. Run Automated Container Verification

Execute the containerized deployment verification suite directly inside the running container:

```bash
docker compose exec uniflow-ops npm run verify:deployment
```

This verifies:
1. Versioned MySQL schema migrations (001 and 002) applied in `schema_migrations`.
2. Optional `sales_orders.shift_id` creation metadata behavior.
3. Strict operator allocation & Sales Order visibility scoping via `operator_work_assignments`.
4. Exact normalized box lookup via `GET /api/boxes/by-code/:boxCode` and resolver `POST /api/boxes/resolve`.
5. MySQL transaction wrapper with `SELECT ... FOR UPDATE` pessimistic row locking and active box item updates.

---

## 6. One-Time SQLite Data Import (Optional)

If you have existing SQLite production data (`server/data/uniflow.db`) and wish to import it into MySQL without duplicate records:

```bash
docker compose exec uniflow-ops npm run import:sqlite
```

---

## 7. Future Application Updates

To pull updates and re-deploy without downtime or data loss:

```bash
# 1. Fetch latest changes
git pull origin main

# 2. Rebuild and restart container
docker compose up -d --build

# 3. Verify health status
curl http://localhost:4000/api/health

# 4. Verify logic suite inside container
docker compose exec uniflow-ops npm run verify:deployment
```

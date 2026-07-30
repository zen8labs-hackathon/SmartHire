# SmartHire Logging Setup

> **Stack:** Pino (structured JSON logs) + Promtail (Docker log collector) + Loki (log storage, 30-day retention) + Grafana (dashboard).
> Production: only `error` level logs. Development: all levels with pino-pretty.

---

## 1. Setup on Server

### 1.1 Pull latest code

```bash
cd /opt/smarthire/app
git fetch origin
git checkout feature/logging-loki-grafana
git pull
```

### 1.2 Set Grafana password

In `.env` (not committed — same file used for `docker compose`):

```bash
# Add these if not already present:
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=your_strong_password_here
```

### 1.3 Start the logging stack

```bash
# From /opt/smarthire/app (repo root):
docker compose -f docker-compose.prod.yml up -d loki promtail grafana
```

Wait ~10s for Loki to become healthy, then Grafana will be available.

### 1.4 Access Grafana

**Option A — via nginx proxy (recommended, no port-forward):**

Add this to your nginx site config (e.g., `smart-hire.zen8labs.io.conf`):

```nginx
# Add inside the `server { }` block:
include /opt/smarthire/app/deploy/nginx/snippets/grafana-proxy.conf;
```

Then reload nginx and open directly:

```
https://smart-hire.zen8labs.io/log
https://smart-hire-dev.zen8labs.io/log   # for dev stack
```

**Option B — via SSM port-forward (if not using nginx):**

```bash
aws ssm start-session \
  --target <ec2-instance-id> \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{"host":["127.0.0.1"],"portNumber":["3001"],"localPortNumber":["3001"]}'
```

Then open: `http://127.0.0.1:3001`

Login: `admin` / `GrafanaAdminPassword` you set in `.env`.

### 1.5 Stop the logging stack

```bash
docker compose -f docker-compose.prod.yml stop loki promtail grafana
# Or remove entirely:
docker compose -f docker-compose.prod.yml down
```

Volumes (`smarthire_loki_data`, `smarthire_grafana_data`) persist — logs survive container restart.

---

## 2. Query Logs in Grafana

Open **Explore** (sidebar icon) → select datasource **Loki**.

### Quick filters

| What | LogQL |
|------|-------|
| All SmartHire app logs | `{service="smarthire"}` |
| Only errors | `{service="smarthire"} \| json \| level="error"` |
| By container name | `{container=~"smarthire_app.*"}` |
| Dev stack logs | `{container=~"smarthire_dev.*"}` |

### Search by X-Request-Id (fastest — indexed label)

```
{service="smarthire"} | json | X-Request-Id="paste-your-id-here"
```

Paste the `X-Request-Id` from browser DevTools/F12 response headers or error messages.

### Search by path

```
{service="smarthire"} | json | path="/api/admin/candidates"
```

### Search by keyword (full-text, slower)

```
{container=~"smarthire_app.*"} |= "ECONNREFUSED"
{container=~"smarthire_app.*"} | json | msg=~".*timeout.*"
```

### Combine filters

```
{service="smarthire"} | json | level="error" | path="/api/admin/jobs"
```

---

## 3. Setup — grafana-proxy (nginx subpath /log)

> Instead of port-forwarding, Grafana is served at `https://smart-hire.zen8labs.io/log` via nginx.

### What this does

```
Browser ──▶ https://smart-hire.zen8labs.io/log ──▶ nginx ──▶ localhost:3001 (Grafana)
```

### Server setup

1. **Copy the nginx snippet** (already added to the site configs in this branch):

   In `smart-hire.zen8labs.io.conf` and `smart-hire-dev.zen8labs.io.conf`:
   ```nginx
   include /opt/smarthire/app/deploy/nginx/snippets/grafana-proxy.conf;
   ```

2. **Test & reload nginx:**
   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```

3. **Run Grafana** (if not already):
   ```bash
   docker compose -f docker-compose.prod.yml up -d loki promtail grafana
   ```

4. **Open in browser:**
   - Production: `https://smart-hire.zen8labs.io/log`
   - Development: `https://smart-hire-dev.zen8labs.io/log`

   Grafana root URL is configured to `%(protocol)s://%(domain)s/log` — all links and redirects will work correctly.

---

## 3. Architecture

```
┌──────────────────┐     ┌──────────────┐     ┌───────┐     ┌────────┐
│  App (Pino)      │     │  Promtail    │     │ Loki  │     │Grafana │
│  stdout JSON     │────▶│  Docker sock │────▶│ :3102 │────▶│ :3001  │
│  (error only)    │     │  extract     │     │ 30d   │     │ Explore│
└──────────────────┘     │  labels      │     └───────┘     └────────┘
                         └──────────────┘
```

### Data flow

1. **App** (`smarthire_app`) writes JSON to stdout (Pino, only `error` in production).
2. **Docker** keeps container stdout (viewable with `docker logs`).
3. **Promtail** reads stdout via Docker socket, extracts JSON fields as **Loki labels**.
4. **Loki** stores logs (30-day retention, then auto-deleted).
5. **Grafana** queries Loki via Explore UI.

---

## 4. Log format

Production JSON output from Pino:

```json
{
  "level": "error",
  "time": "2026-07-30T09:00:00.000Z",
  "service": "smarthire",
  "msg": "DB query failed",
  "path": "/api/admin/candidates",
  "X-Request-Id": "abc-123-def-456",
  "err": {
    "message": "connection refused",
    "stack": "Error: connection refused\n    at Pool.connect..."
  }
}
```

In development (`LOG_LEVEL=debug` with `pino-pretty`):

```
[2026-07-30 09:00:00] INFO (smarthire): User signed in  {"userId":"u-xyz","path":"/api/auth/signin"}
[2026-07-30 09:00:01] ERROR (smarthire): DB query failed  {"path":"/api/admin/candidates","X-Request-Id":"abc-123","err":{...}}
```

---

## 5. Loki retention

Logs are retained for **3 days** (72 hours). After that, Loki's compactor automatically deletes old chunks.

To check disk usage:

```bash
docker exec smarthire_loki du -sh /loki
```

To change retention (e.g., to 7 days), edit `deploy/logging/loki-config.yml`:

```yaml
limits_config:
  retention_period: 168h   # 7 days
```

Then restart Loki:

```bash
docker compose -f docker-compose.prod.yml restart loki
```

---

## 6. Troubleshooting

### No logs in Grafana

1. Check Promtail is running:
   ```bash
   docker ps | grep promtail
   docker logs smarthire_promtail
   ```

2. Check Loki is receiving:
   ```bash
   curl http://localhost:3102/ready
   ```

3. Check Promtail positions file exists:
   ```bash
   docker exec smarthire_promtail cat /var/lib/promtail/positions.yaml
   ```

### Labels not extracted (logs show raw JSON in Grafana)

Promtail needs to scrape containers by name. Verify container names match in `promtail-config.yml`:
```bash
docker ps --format "{{.Names}}"
```

Update `docker_sd_configs[].filters[].values` in `deploy/logging/promtail-config.yml` if names differ.

### "Grafana is not reachable" in browser

Make sure SSM port-forward is still active. The tunnel drops after some inactivity — reconnect if needed.

---

## 7. Adding new log points

Use the logger in any file:

```typescript
import { logError, logWarn, logInfo, logDebug } from "@/lib/logger";

// For errors (always logged in prod):
logError("DB transaction failed", error instanceof Error ? error : undefined, {
  X-Request-Id: "optional-id",
  path: "/api/admin/candidates",
  userId: auth.user.id,
});

// For warnings/info/debug (only in dev):
logWarn("JD match returned low score", { score: jdMatch.score });
logDebug("Processing file", { filename, size });
```

### Adding X-Request-Id to logs

When handling a request, generate or read the ID, then pass it to child logger:

```typescript
import { createRequestLogger } from "@/lib/logger";

// Read incoming X-Request-Id (or create one):
const requestId = request.headers.get("X-Request-Id") ?? crypto.randomUUID();

// Create child logger with requestId attached to every log line:
const log = createRequestLogger(requestId);
log.error("Something failed", { path: "/api/admin/candidates" });

// In the JSON output:
{ "level": "error", "X-Request-Id": "abc-123", "path": "/api/admin/candidates", ... }
```

Search in Grafana: `{service="smarthire"} | json | X-Request-Id="abc-123"`

---

## 8. Production vs Development

| | Production | Development |
|--|-----------|-------------|
| **Log level** | `error` only | `debug` (pino-pretty) |
| **Where to view** | Grafana (`:3001`) | Terminal (stdout) + Grafana |
| **X-Request-Id** | in JSON (for Grafana search) | same |
| **Query Grafana** | Yes | Optional (if running logging stack) |
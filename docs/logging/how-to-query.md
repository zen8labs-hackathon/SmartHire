# Logging — Query, Architecture & Reference

Common tasks, LogQL queries, architecture, log format, retention, troubleshooting, and how to add new log points.

---

## Common Tasks

### Stop / Restart logging stack

```bash
cd /opt/smarthire/app

# Stop
docker compose -f docker-compose.prod.yml stop loki promtail grafana

# Restart
docker compose -f docker-compose.prod.yml restart loki promtail grafana

# Remove (volume data will be lost!)
docker compose -f docker-compose.prod.yml down
```

Volumes (`smarthire_loki_data`, `smarthire_grafana_data`) persist across stop/restart — logs are preserved.

---

## Query Logs in Grafana

Open **Explore** (sidebar icon) → select datasource **Loki**.

### Quick filters

| What                   | LogQL                                          |
| ---------------------- | ---------------------------------------------- |
| All SmartHire app logs | `{service="smarthire"}`                        |
| Only errors           | `{service="smarthire"} | json | level="error"` |
| Prod container         | `{container=~"smarthire_app.*"}`              |
| Dev stack logs         | `{container=~"smarthire_dev.*"}`             |

### Search by X-Request-Id (fastest — indexed label)

```
{service="smarthire"} | json | X-Request-Id="paste-your-id-here"
```

### Search by path

```
{service="smarthire"} | json | path="/api/admin/candidates"
```

### Search by keyword (full-text)

```
{container=~"smarthire_app.*"} |= "ECONNREFUSED"
{container=~"smarthire_app.*"} | json | msg=~".*timeout.*"
```

### Combine filters

```
{service="smarthire"} | json | level="error" | path="/api/admin/jobs"
```

---

## Architecture

```
App (Pino)        Promtail          Loki (:3102)    Grafana (:3001)
stdout JSON  -->  Docker sock  -->  Store (3d)  -->  Explore UI
(error only)      extract labels    Compactor       /log
                  X-Request-Id       auto-delete
                  level, path
```

1. App (`smarthire_app`) writes JSON to stdout (Pino, only `error` in production).
2. Docker keeps container stdout.
3. Promtail reads via Docker socket, extracts JSON fields as **Loki labels**.
4. Loki stores logs (3 days, then auto-deleted).
5. Grafana queries Loki via Explore UI.

---

## Log format

Production JSON (Pino):

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

Development (pino-pretty, LOG_LEVEL=debug):

```
[2026-07-30 09:00:00] INFO (smarthire): User signed in  {"userId":"u-xyz","path":"/api/auth/signin"}
[2026-07-30 09:00:01] ERROR (smarthire): DB query failed  {"path":"/api/admin/candidates","X-Request-Id":"abc-123","err":{...}}
```

---

## Loki retention

Logs are retained for **3 days** (72h). After that, compactor automatically deletes old chunks.

Check disk usage:

```bash
docker exec smarthire_loki du -sh /loki
```

Change retention (e.g., to 7 days) — edit `deploy/logging/loki-config.yml`:

```yaml
limits_config:
  retention_period: 168h   # 7 days
```

```bash
docker compose -f docker-compose.prod.yml restart loki
```

---

## Troubleshooting

### No logs in Grafana

```bash
docker ps | grep promtail
docker logs smarthire_promtail
curl http://localhost:3102/ready
```

### Labels not extracted (raw JSON displayed)

Check container names in `promtail-config.yml`:

```bash
docker ps --format "{{.Names}}"
```

If names differ, update `docker_sd_configs[].filters[].values` in `deploy/logging/promtail-config.yml`.

### Grafana not reachable

```bash
sudo nginx -t && sudo systemctl status nginx
curl -I https://smart-hire.zen8labs.io/log
```

---

## Adding new log points

```typescript
import { logError, logWarn, logInfo, logDebug } from "@/lib/logger";

// Errors (always logged in prod):
logError("DB transaction failed", error instanceof Error ? error : undefined, {
  path: "/api/admin/candidates",
});

// Warnings/info/debug (dev only):
logWarn("Low JD match score", { score: jdMatch.score });
logDebug("Processing file", { filename });
```

### With X-Request-Id

```typescript
import { createRequestLogger } from "@/lib/logger";

const requestId = request.headers.get("X-Request-Id") ?? crypto.randomUUID();
const log = createRequestLogger(requestId);

log.error("Something failed", { path: "/api/admin/candidates" });
// Output: { "level": "error", "X-Request-Id": "abc-123", "path": "...", ... }
```

Search: `{service="smarthire"} | json | X-Request-Id="abc-123"`

---

## Production vs Development

|                    | Production        | Development           |
| ------------------ | ----------------- | --------------------- |
| **Log level**      | `error` only      | `debug` (pino-pretty) |
| **Where to view**  | Grafana at `/log` | Terminal + Grafana    |
| **X-Request-Id**  | In JSON          | In JSON              |
| **Loki retention**| 3 days           | 3 days               |
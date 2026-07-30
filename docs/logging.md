# SmartHire Logging Setup

> **Stack:** Pino (structured JSON logs) + Promtail (Docker log collector) + Loki (log storage, 3-day retention) + Grafana (dashboard).
> Production: only `error` level logs. Development: all levels with pino-pretty.

---

## 1. Deploy Logging Stack

Logging stack (Loki + Promtail + Grafana) deploy **một lần** trên EC2, dùng chung cho cả prod và develop.

### 1.1 Pull code

```bash
# Production — /opt/smarthire/app
cd /opt/smarthire/app
git fetch origin
git checkout develop
git pull

# Develop — /opt/smarthire/app-develop
cd /opt/smarthire/app-develop
git fetch origin
git checkout develop
git pull
```

### 1.2 Thêm Grafana password

Trong file `.env` của production (`/opt/smarthire/app/.env`):

```bash
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=your_strong_password_here
```

### 1.3 Copy nginx config + reload

```bash
# Production
sudo cp /opt/smarthire/app/deploy/nginx/smart-hire.zen8labs.io.conf \
   /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/smart-hire.zen8labs.io.conf \
   /etc/nginx/sites-enabled/

# Develop
sudo cp /opt/smarthire/app-develop/deploy/nginx/smart-hire-dev.zen8labs.io.conf \
   /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/smart-hire-dev.zen8labs.io.conf \
   /etc/nginx/sites-enabled/

# Copy grafana-proxy.conf vao thu muc develop tren server (neu chua co)
sudo mkdir -p /opt/smarthire/app-develop/deploy/nginx/snippets
sudo cp /opt/smarthire/app/deploy/nginx/snippets/grafana-proxy.conf \
   /opt/smarthire/app-develop/deploy/nginx/snippets/grafana-proxy.conf

# Reload nginx
sudo nginx -t && sudo systemctl reload nginx
```

### 1.4 Start logging stack

```bash
cd /opt/smarthire/app
docker compose -f docker-compose.prod.yml up -d loki promtail grafana
```

Doi ~10s cho Loki khoi dong xong.

---

## 2. Access Grafana

```
https://smart-hire.zen8labs.io/log   (production)
https://smart-hire-dev.zen8labs.io/log   (develop)
```

Login: `admin` / `GRAFANA_ADMIN_PASSWORD` trong `.env`

**Hoac** qua SSM port-forward:

```bash
aws ssm start-session \
  --target <ec2-instance-id> \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{"host":["127.0.0.1"],"portNumber":["3001"],"localPortNumber":["3001"]}'
```
Then open: `http://127.0.0.1:3001`

---

## 3. Stop / Restart

```bash
cd /opt/smarthire/app

# Stop
docker compose -f docker-compose.prod.yml stop loki promtail grafana

# Restart
docker compose -f docker-compose.prod.yml restart loki promtail grafana

# Remove (data trong volume se mat!)
docker compose -f docker-compose.prod.yml down
```

Volumes (`smarthire_loki_data`, `smarthire_grafana_data`) persist khi stop/restart — logs khong mat.

---

## 4. Query Logs in Grafana

Open **Explore** (sidebar icon) → select datasource **Loki**.

### Quick filters

| What | LogQL |
|------|-------|
| All SmartHire app logs | `{service="smarthire"}` |
| Only errors | `{service="smarthire"} \| json \| level="error"` |
| Prod container | `{container=~"smarthire_app.*"}` |
| Dev stack logs | `{container=~"smarthire_dev.*"}` |

### Search by X-Request-Id (fastest — indexed label)

```
{service="smarthire"} | json | X-Request-Id="paste-your-id-here"
```

Paste `X-Request-Id` tu DevTools/F12 response headers hoac error messages.

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

## 5. Architecture

```
App (Pino)        Promtail          Loki (:3102)    Grafana (:3001)
stdout JSON  -->  Docker sock  -->  Store (3d)  -->  Explore UI
(error only)      extract labels    Compactor       /log
                  X-Request-Id       auto-delete
                  level, path
```

1. App (`smarthire_app`) ghi JSON ra stdout (Pino, chi `error` trong prod).
2. Docker luu stdout container.
3. Promtail doc qua Docker socket, extract JSON fields thanh **Loki labels**.
4. Loki luu logs (3 ngay roi tu xoa).
5. Grafana query Loki qua Explore UI.

---

## 6. Log format

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

## 7. Loki retention

Logs luu **3 ngay** (72h). Sau do compactor tu xoa.

Kiem tra disk:

```bash
docker exec smarthire_loki du -sh /loki
```

Doi retention (vd. 7 ngay):

```yaml
# deploy/logging/loki-config.yml
limits_config:
  retention_period: 168h   # 7 days
```

```bash
docker compose -f docker-compose.prod.yml restart loki
```

---

## 8. Troubleshooting

### Khong thay log trong Grafana

```bash
# Promtail co chay khong?
docker ps | grep promtail
docker logs smarthire_promtail

# Loki co nhan du lieu?
curl http://localhost:3102/ready
```

### Labels khong extract (log hien thi JSON thay vi parsed)

Kiem tra container names trong `promtail-config.yml`:

```bash
docker ps --format "{{.Names}}"
```

Neu ten khac, cap nhat `docker_sd_configs[].filters[].values` trong `deploy/logging/promtail-config.yml`.

### Grafana not reachable

Kiem tra nginx proxy:

```bash
sudo nginx -t && sudo systemctl status nginx
curl -I https://smart-hire.zen8labs.io/log
```

---

## 9. Adding new log points

```typescript
import { logError, logWarn, logInfo, logDebug } from "@/lib/logger";

// Errors (luon log trong prod):
logError("DB transaction failed", error instanceof Error ? error : undefined, {
  path: "/api/admin/candidates",
});

// Warnings/info/debug (chi trong dev):
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

## 10. Production vs Development

| | Production | Development |
|--|-----------|-------------|
| **Log level** | `error` only | `debug` (pino-pretty) |
| **Where to view** | Grafana at `/log` | Terminal + Grafana |
| **X-Request-Id** | Co trong JSON | Co trong JSON |
| **Loki retention** | 3 ngay | 3 ngay |
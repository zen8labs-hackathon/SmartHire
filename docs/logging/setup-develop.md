# Logging Setup — Development (`/opt/smarthire/app-develop`)

Stack: Pino + Promtail + Loki + Grafana (3-day retention, Grafana at `/log`).
Logging stack runs in prod compose (`loki`, `promtail`, `grafana`) — no need to start additional containers.

---

## B1. Pull code

```bash
cd /opt/smarthire/app-develop
git fetch origin
git checkout develop
git pull
```

## B2. Copy nginx config + grafana-proxy.conf

```bash
# Copy nginx site config
sudo cp /opt/smarthire/app-develop/deploy/nginx/smart-hire-dev.zen8labs.io.conf \
   /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/smart-hire-dev.zen8labs.io.conf \
   /etc/nginx/sites-enabled/

# Copy grafana-proxy.conf (needed by app-develop)
sudo mkdir -p /opt/smarthire/app-develop/deploy/nginx/snippets
sudo cp /opt/smarthire/app/deploy/nginx/snippets/grafana-proxy.conf \
   /opt/smarthire/app-develop/deploy/nginx/snippets/grafana-proxy.conf

# Reload nginx
sudo nginx -t && sudo systemctl reload nginx
```

**Access:** https://smart-hire-dev.zen8labs.io/log
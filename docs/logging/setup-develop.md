# Logging Setup — Development (`/opt/smarthire/app-develop`)

Stack: Pino + Promtail + Loki + Grafana (3-day retention, Grafana at `/log`).

**Important:** Do **not** start Loki/Promtail/Grafana from this directory.
The logging stack is shared and must be started from production (`/opt/smarthire/app`) — see [setup-prod.md](setup-prod.md).

This guide only configures nginx so `/log` works on the develop domain.

---

## B1. Pull code

```bash
cd /opt/smarthire/app-develop
git fetch origin
git checkout develop
git pull
```

## B2. Update nginx (existing site — do not create a duplicate)

If `sites-enabled` already has `smart-hire-dev.zen8labs.io`, edit that file (do **not** copy a second `.conf`):

```bash
# Remove any accidental duplicate first
sudo rm -f /etc/nginx/sites-enabled/smart-hire-dev.zen8labs.io.conf
sudo rm -f /etc/nginx/sites-available/smart-hire-dev.zen8labs.io.conf

# Edit the live site (usually managed by certbot)
sudo nano /etc/nginx/sites-available/smart-hire-dev.zen8labs.io
```

Inside the `server { listen 443 ... }` block, add:

```nginx
    include /opt/smarthire/app-develop/deploy/nginx/snippets/grafana-proxy.conf;
```

Then:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## B3. Ensure logging stack is running (from production folder)

```bash
cd /opt/smarthire/app
# Ensure GRAFANA_ADMIN_PASSWORD is set in /opt/smarthire/app/.env
docker compose -f docker-compose.prod.yml up -d loki promtail grafana
```

**Access:** https://smart-hire-dev.zen8labs.io/log
(Same Grafana as production — filter with `{container=~"smarthire_dev.*"}`)

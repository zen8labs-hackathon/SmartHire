# Logging Setup — Production (`/opt/smarthire/app`)

Stack: Pino + Promtail + Loki + Grafana (3-day retention, Grafana at `/log`).

---

## A1. Pull code

```bash
cd /opt/smarthire/app
git fetch origin
git checkout develop
git pull
```

## A2. Set Grafana password

In `.env`:

```bash
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=your_strong_password_here
```

## A3. Copy nginx config

```bash
sudo cp /opt/smarthire/app/deploy/nginx/smart-hire.zen8labs.io.conf \
   /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/smart-hire.zen8labs.io.conf \
   /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## A4. Start logging stack

```bash
cd /opt/smarthire/app
docker compose -f docker-compose.prod.yml up -d loki promtail grafana
```

Wait ~10s for Loki to become healthy.

**Access:** https://smart-hire.zen8labs.io/log
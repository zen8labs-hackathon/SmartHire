# Logging Setup — Production (`/opt/smarthire/app`)

Stack: Pino + Promtail + Loki + Grafana (3-day retention, Grafana at `/log`).
This is the **only** place that starts Loki / Promtail / Grafana (shared with develop).

---

## A1. Pull code

```bash
cd /opt/smarthire/app
git fetch origin
git checkout develop
git pull
```

## A2. Set Grafana password

In `/opt/smarthire/app/.env`:

```bash
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=your_strong_password_here
```

## A3. Update nginx (existing site — do not create a duplicate)

If `sites-enabled` already has `smart-hire.zen8labs.io`, edit that file.
Do **not** copy a second `smart-hire.zen8labs.io.conf`.

```bash
# Remove any accidental duplicate
sudo rm -f /etc/nginx/sites-enabled/smart-hire.zen8labs.io.conf
sudo rm -f /etc/nginx/sites-available/smart-hire.zen8labs.io.conf

# Edit the live site (usually managed by certbot)
sudo nano /etc/nginx/sites-available/smart-hire.zen8labs.io
```

Inside the `server { listen 443 ... }` block, add:

```nginx
    include /opt/smarthire/app/deploy/nginx/snippets/grafana-proxy.conf;
```

Then:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## A4. Start logging stack

```bash
cd /opt/smarthire/app
docker compose -f docker-compose.prod.yml up -d loki promtail grafana

# Verify
docker logs smarthire_loki --tail 50
curl -s http://127.0.0.1:3102/ready
```

**Access:** https://smart-hire.zen8labs.io/log

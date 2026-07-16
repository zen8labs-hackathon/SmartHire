# Deploy Smart Hire to EC2 (`smart-hire.zen8labs.io`)

Copy-paste checklist. Full SSM/SSO setup: [smart-hire-vm-access-guide.md](./smart-hire-vm-access-guide.md).

**Branch assumed:** `refactor/database-queries-and-schemas`  
**Server:** `i-040a0bcdfe9618b56` · Ubuntu 24.04 · no SSH (SSM only)

---

## 0. Local: login + push branch

```bash
aws sso login --profile smart-hire
aws sts get-caller-identity --profile smart-hire

git push -u origin refactor/database-queries-and-schemas
```

Confirm these files are on the branch: `docker-compose.prod.yml`, `.env.production.example`, `deploy/nginx/smart-hire.zen8labs.io.conf`, `deploy/deploy.sh`.

---

## 1. SSM into the box

```bash
aws ssm start-session --target i-040a0bcdfe9618b56 --profile smart-hire
sudo su - ubuntu
```

---

## 2. One-time: Docker + nginx + git

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl git nginx

# Docker Engine + Compose plugin (Ubuntu 24.04)
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker ubuntu
```

Log out of the `ubuntu` shell and back in so the `docker` group applies:

```bash
exit
sudo su - ubuntu
docker version
docker compose version
```

---

## 3. Clone repo

Use a deploy key or a fine-scoped PAT stored only on the server — do **not** embed a PAT in the git remote URL long-term.

```bash
sudo mkdir -p /opt/smarthire
sudo chown ubuntu:ubuntu /opt/smarthire
cd /opt/smarthire
git clone https://github.com/zen8labs-hackathon/SmartHire.git app
cd app
git checkout refactor/database-queries-and-schemas
```

---

## 4. Create `.env`

```bash
cd /opt/smarthire/app
cp .env.production.example .env
chmod 600 .env
nano .env
```

Fill at least:

| Variable | Notes |
|---|---|
| `POSTGRES_PASSWORD` | Strong password; must match the password inside `DATABASE_URL` |
| `DATABASE_URL` | `postgresql://smarthire:<password>@db:5432/smart_hire` |
| `AUTH_JWT_SECRET` | Random ≥32 bytes |
| `AZURE_AD_*` | Redirect URI = `https://smart-hire.zen8labs.io/api/auth/azure/callback` |
| `AI_GATEWAY_API_KEY` | If AI features are needed |
| `S3_BUCKET` / `AWS_REGION` | Real bucket in `ap-southeast-1` |
| `AWS_ACCESS_KEY_*` | Only if no IAM instance role yet — otherwise omit |

**Do not set** `AWS_ENDPOINT_URL` (that is for local Floci only).

Azure portal: add the redirect URI above as a **Web** platform redirect URI.

---

## 5. First bring-up (DB → migrate → app)

```bash
cd /opt/smarthire/app
chmod +x deploy/deploy.sh

docker compose -f docker-compose.prod.yml up -d db
docker compose -f docker-compose.prod.yml --profile migrate run --rm migrate
docker compose -f docker-compose.prod.yml up -d --build app
docker compose -f docker-compose.prod.yml ps
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3100/
```

Later updates (same machine):

```bash
cd /opt/smarthire/app
./deploy/deploy.sh refactor/database-queries-and-schemas
```

---

## 6. Smoke test before DNS/SSL (from your laptop)

Leave the SSM shell running on the server with the app up. In a **second** local terminal:

```bash
aws ssm start-session \
  --target i-040a0bcdfe9618b56 \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["3100"],"localPortNumber":["3100"]}' \
  --profile smart-hire
```

Open http://localhost:3100 — if cookies fail over plain HTTP, temporarily set `COOKIE_SECURE=false` in `.env`, recreate app, then remove it after TLS.

---

## 7. nginx + Let's Encrypt

Still on the server as `ubuntu` / root:

```bash
cd /opt/smarthire/app
sudo cp deploy/nginx/smart-hire.zen8labs.io.conf /etc/nginx/sites-available/smart-hire.zen8labs.io
sudo ln -sf /etc/nginx/sites-available/smart-hire.zen8labs.io /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

sudo snap install --classic certbot
sudo ln -sf /snap/bin/certbot /usr/bin/certbot
sudo certbot --nginx -d smart-hire.zen8labs.io
```

Verify: https://smart-hire.zen8labs.io

If `COOKIE_SECURE=false` was set for the port-forward test, remove it from `.env` and run:

```bash
docker compose -f docker-compose.prod.yml up -d app
```

---

## 8. Ask Hung if blocked

Team SSM role usually cannot:

- Create the S3 bucket + CORS for `https://smart-hire.zen8labs.io`
- Attach an IAM instance profile to `i-040a0bcdfe9618b56` (preferred over access keys)
- Create RDS (only needed if you skip the compose Postgres service)

---

## 9. Rules

- **Do not stop** the EC2 instance from the AWS console (public IP changes → DNS/SSL break). `sudo reboot` is fine.
- Only ports **80/443** are public; app stays on `127.0.0.1:3100`.
- Do not install OpenSSH / open port 22.

---

## Quick troubleshooting

| Symptom | Fix |
|---|---|
| SSO expired | `aws sso login --profile smart-hire` |
| `migrate` can't reach DB | Wait for healthy: `docker compose -f docker-compose.prod.yml ps` |
| App 502 via nginx | `curl 127.0.0.1:3100` on server; `docker logs smarthire_app` |
| Login cookie missing | TLS live? Remove `COOKIE_SECURE=false`. Azure redirect URI exact? |
| S3 upload fails | No `AWS_ENDPOINT_URL`; bucket CORS + IAM/keys; region matches |
| Certbot challenge fails | `sudo systemctl status nginx` — nginx must listen on 80 |

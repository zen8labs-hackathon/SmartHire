# CI/CD — auto deploy EC2 khi push branch

Mỗi lần push lên branch cấu hình trong `.github/workflows/deploy-ec2.yml`, GitHub Actions chạy `deploy/deploy.sh` **trên chính EC2** (self-hosted runner).

**Vì sao không dùng SSH từ GitHub?** Server chỉ cho SSM; role team thường không có `ssm:SendCommand` từ bên ngoài. Runner cài **một lần** trên máy là đủ.

---

## 1. Cài GitHub Actions runner (một lần trên EC2)

SSM vào server → user `ubuntu`:

```bash
sudo su - ubuntu
cd /opt/smarthire

# Phiên bản runner — xem https://github.com/actions/runner/releases
RUNNER_VERSION=2.323.0
curl -fsSL -o actions-runner.tar.gz \
  "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
mkdir -p actions-runner && cd actions-runner
tar xzf ../actions-runner.tar.gz
```

Lấy token đăng ký runner:

1. GitHub repo → **Settings** → **Actions** → **Runners** → **New self-hosted runner**
2. Chọn Linux x64, copy lệnh `./config.sh ...` (có token một lần)

Chạy `config.sh` với **label** khớp workflow:

```bash
./config.sh \
  --url https://github.com/zen8labs-hackathon/SmartHire \
  --token PASTE_TOKEN_HERE \
  --name smarthire-ec2 \
  --labels smarthire-ec2 \
  --unattended
```

Cài service (tự chạy sau reboot):

```bash
sudo ./svc.sh install ubuntu
sudo ./svc.sh start
sudo ./svc.sh status
```

User `ubuntu` phải trong group `docker` (đã có khi deploy lần đầu).

---

## 2. Git pull trên server phải không hỏi password

`deploy.sh` chạy `git pull`. Repo private cần một trong:

- **Deploy key** (read-only) gắn repo GitHub, `~/.ssh` trên EC2, hoặc
- **PAT** lưu credential helper (không nhét PAT vào URL remote lâu dài)

Kiểm tra:

```bash
cd /opt/smarthire/app
git pull origin production
```

Phải pull được **không** hỏi user/pass.

---

## 3. Workflow hiện tại

File: `.github/workflows/deploy-ec2.yml`

| Branch | Thư mục trên EC2 | Script | URL |
|--------|------------------|--------|-----|
| `production` | `/opt/smarthire/app` | `deploy-bluegreen.sh` | https://smart-hire.zen8labs.io |
| `develop` | `/opt/smarthire/app-develop` | `deploy-develop.sh` | https://smart-hire-dev.zen8labs.io (sau khi có DNS) |

| Cấu hình | Giá trị |
|----------|---------|
| Runner labels | `self-hosted`, `smarthire-ec2` |
| Concurrency | theo branch (`deploy-ec2-<branch>`) |

Production blue-green: [blue-green-ec2.md](./blue-green-ec2.md). Develop dùng single-slot (tiết kiệm RAM), ports: app `3200`, db `5433`, MinIO `9010`.

Workflow tự `git reset --hard origin/<branch>` trước khi chạy deploy script.

### Tắt check Vercel trên GitHub

Repo có `vercel.json` với `"git": { "deploymentEnabled": false }` để Vercel không deploy khi push.

Nếu vẫn thấy check **Vercel** / **Vercel Preview Comments**:

1. [Vercel Dashboard](https://vercel.com) → project SmartHire → **Settings** → **Git** → Disconnect (hoặc bỏ branch khỏi production deploy)
2. GitHub repo → **Settings** → **Integrations** / **Installed GitHub Apps** → gỡ **Vercel** nếu không dùng nữa

---

## 3b. One-time: bật môi trường develop trên EC2

Làm **trước** lần push `develop` đầu tiên (nếu chưa có `/opt/smarthire/app-develop`).

```bash
# SSM → ubuntu
cd /opt/smarthire
git clone https://github.com/zen8labs-hackathon/SmartHire.git app-develop
cd app-develop
git checkout develop
cp .env.develop.example .env
nano .env   # điền POSTGRES_PASSWORD, AUTH_JWT_SECRET, MINIO_*, AI_GATEWAY_*, ...
chmod +x deploy/deploy-develop.sh
./deploy/deploy-develop.sh develop
```

**Chưa có DNS:** test app bằng SSM port-forward từ laptop:

```bash
aws ssm start-session \
  --target i-040a0bcdfe9618b56 \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["3200"],"localPortNumber":["3200"]}' \
  --profile smart-hire
# mở http://127.0.0.1:3200
```

**Khi admin đã tạo DNS** `smart-hire-dev.zen8labs.io` → `18.142.230.72`:

```bash
cd /opt/smarthire/app-develop
sudo cp deploy/nginx/smart-hire-dev.zen8labs.io.conf \
  /etc/nginx/sites-available/smart-hire-dev.zen8labs.io
sudo ln -sf /etc/nginx/sites-available/smart-hire-dev.zen8labs.io \
  /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d smart-hire-dev.zen8labs.io
# trong .env: bỏ hoặc set COOKIE_SECURE=true; reload app
```

Role team (`SSM-smart-hire-EC2-Team`) **không** có quyền Route53 — nhờ admin DNS tạo A record.

---

## 4. Kiểm tra

**Production:**

1. Push lên `production`
2. Actions → **Deploy EC2** → job `Deploy production`
3. Log có `Done.`

**Develop:** (sau bước 3b)

1. Push lên `develop`
2. Job `Deploy develop` → log có `app HTTP 307` (hoặc 200) trên `:3200`

```bash
docker compose -f /opt/smarthire/app/docker-compose.prod.yml ps
docker compose -f /opt/smarthire/app-develop/docker-compose.develop.yml ps
```

---

## 5. Lỗi thường gặp

| Triệu chứng | Cách xử lý |
|-------------|------------|
| Job queued, không chạy | Runner offline: `sudo ./svc.sh status` trong `/opt/smarthire/actions-runner` |
| `git pull` fail trong log | Cấu hình deploy key / PAT trên EC2 |
| `permission denied` docker | `sudo usermod -aG docker ubuntu`, restart runner service |
| Migrate fail | Xem log job; sửa DB rồi re-run workflow (Actions → Re-run) |

---

## 6. Tuỳ chọn sau này (cần Hung)

**GitHub → SSM SendCommand** không cần runner trên máy: workflow dùng OIDC/IAM gọi `aws ssm send-command` chạy `deploy.sh`. Cần quyền IAM rộng hơn role `SSM-smart-hire-EC2-Team`.

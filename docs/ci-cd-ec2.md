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
git pull origin chore/aws-ec2-deploy
```

Phải pull được **không** hỏi user/pass.

---

## 3. Workflow hiện tại

File: `.github/workflows/deploy-ec2.yml`

| Cấu hình | Giá trị mặc định |
|----------|------------------|
| Branch trigger | `chore/aws-ec2-deploy` |
| Runner labels | `self-hosted`, `smarthire-ec2` |
| Lệnh deploy | `/opt/smarthire/app/deploy/deploy-bluegreen.sh chore/aws-ec2-deploy` |

Blue-green (gần zero downtime): [blue-green-ec2.md](./blue-green-ec2.md). Rollback / bật lần đầu: xem doc đó trước khi chạy CI.

Đổi branch deploy: sửa **cả hai** chỗ `branches:` và tham số `./deploy/deploy.sh <branch>` trong workflow.

---

## 4. Kiểm tra

1. Push một commit lên `chore/aws-ec2-deploy`
2. GitHub → **Actions** → workflow **Deploy EC2**
3. Job chạy trên runner `smarthire-ec2`, log có `Done.` và `app HTTP 307` (hoặc 200)

Trên server:

```bash
docker compose -f /opt/smarthire/app/docker-compose.prod.yml ps
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

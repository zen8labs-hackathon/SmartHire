# Hướng dẫn deploy Smart Hire lên AWS EC2

Tài liệu này dẫn bạn từ máy laptop tới app chạy tại **[https://smart-hire.zen8labs.io](https://smart-hire.zen8labs.io)**.

- Kết nối máy chủ (SSO / SSM): xem thêm [smart-hire-vm-access-guide.md](./smart-hire-vm-access-guide.md)
- Checklist tiếng Anh ngắn: [aws-ec2-deploy.md](./aws-ec2-deploy.md)

---

## Bạn sẽ có gì sau khi làm xong?


| Thành phần        | Cách chạy trên EC2                                 |
| ----------------- | -------------------------------------------------- |
| App Next.js       | Docker container, cổng `127.0.0.1:3100`            |
| Database Postgres | Docker container + volume lưu data                 |
| Schema DB         | Lệnh `migrate` (chạy các file trong `migrations/`) |
| Domain + HTTPS    | nginx + Let's Encrypt (`smart-hire.zen8labs.io`)   |


**Lưu ý:** Chỉ push code chưa đủ. Phải vào server, điền `.env`, chạy Docker, rồi gắn nginx/SSL.

---



## Thông tin server


| Mục           | Giá trị                                                       |
| ------------- | ------------------------------------------------------------- |
| Instance ID   | `i-040a0bcdfe9618b56`                                         |
| Public IP     | `18.142.230.72`                                               |
| Domain        | `smart-hire.zen8labs.io`                                      |
| Region        | `ap-southeast-1`                                              |
| Branch deploy | `chore/aws-ec2-deploy` (hoặc branch đã merge các file deploy) |
| Cách vào máy  | AWS Session Manager (SSM) — **không có SSH**                  |


**Cấm:** Stop instance từ AWS Console (public IP đổi → domain/SSL hỏng). `sudo reboot` trong máy thì được.

---



## Phần A — Trên máy bạn (laptop)



### A1. Cài AWS CLI + Session Manager plugin + SSO

Làm một lần theo [smart-hire-vm-access-guide.md](./smart-hire-vm-access-guide.md) (profile tên `smart-hire`).

Kiểm tra:

```bash
aws sso login --profile smart-hire
aws sts get-caller-identity --profile smart-hire
```

Phải thấy account `405188851544` và role chứa `SSM-smart-hire-EC2-Team`.

### A2. Đẩy code deploy lên GitHub

Trên laptop, trong repo SmartHire:

```bash
git checkout chore/aws-ec2-deploy
git status
```

Đảm bảo có các file:

- `docker-compose.prod.yml`
- `.env.production.example`
- `deploy/nginx/smart-hire.zen8labs.io.conf`
- `deploy/deploy.sh`
- `docs/huong-dan-deploy-aws-ec2.md` (file này)

Commit (nếu chưa) rồi push:

```bash
git add docker-compose.prod.yml .env.production.example deploy docs .gitignore Dockerfile
git commit -m "Add AWS EC2 production deploy files and guide"
git push -u origin chore/aws-ec2-deploy
```

> Nếu agent đã commit giúp bạn rồi thì chỉ cần `git push -u origin chore/aws-ec2-deploy`.



### A3. Chuẩn bị trước khi lên server

Thu thập / tạo sẵn (ghi ra notepad):

1. **Mật khẩu Postgres** mạnh (ví dụ 24 ký tự ngẫu nhiên)
2. `AUTH_JWT_SECRET` ngẫu nhiên ≥ 32 ký tự
3. **Azure AD**
  - `AZURE_AD_CLIENT_ID`
  - `AZURE_AD_CLIENT_SECRET`
  - Trong Azure portal, thêm Redirect URI (Web):
  `https://smart-hire.zen8labs.io/api/auth/azure/callback`
4. `AI_GATEWAY_API_KEY` (nếu cần AI)
5. **Object storage** — mặc định dùng **MinIO trên EC2** (không cần AWS S3)
  - Đặt `MINIO_ROOT_PASSWORD` (≥ 8 ký tự)
  - Giữ `AWS_ENDPOINT_URL=https://smart-hire.zen8labs.io/minio`
  - Nginx phải có `location /minio/` + HTTPS (certbot)
  - Nếu sau này có S3 thật: xem ghi chú trong `.env.production.example`

---



## Phần B — Vào server lần đầu



### B1. Mở session

```bash
aws ssm start-session --target i-040a0bcdfe9618b56 --profile smart-hire
sudo su - ubuntu
```



### B2. Cài Docker + nginx + git (một lần)

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl git nginx

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker ubuntu
```

Thoát rồi vào lại để group `docker` có hiệu lực:

```bash
exit
sudo su - ubuntu
docker version
docker compose version
```



### B3. Clone code

Repo private thì dùng deploy key hoặc PAT **chỉ lưu trên server**, không nhét PAT vào URL git lâu dài.

```bash
sudo mkdir -p /opt/smarthire
sudo chown ubuntu:ubuntu /opt/smarthire
cd /opt/smarthire

git clone https://github.com/zen8labs-hackathon/SmartHire.git app
cd app
git checkout chore/aws-ec2-deploy
git pull
```

---



## Phần C — Cấu hình `.env` và chạy database + app



### C1. Tạo file môi trường

```bash
cd /opt/smarthire/app
cp .env.production.example .env
chmod 600 .env
nano .env
```

Điền tối thiểu như sau (đổi mật khẩu / secret thật):

```env
POSTGRES_USER=smarthire
POSTGRES_PASSWORD=MAT_KHAU_MANH_CUA_BAN
POSTGRES_DB=smart_hire

DATABASE_URL=postgresql://smarthire:MAT_KHAU_MANH_CUA_BAN@db:5432/smart_hire

AUTH_JWT_SECRET=JWT_SECRET_NGAU_NHIEN_DAI

AZURE_AD_CLIENT_ID=...
AZURE_AD_CLIENT_SECRET=...
AZURE_AD_REDIRECT_URI=https://smart-hire.zen8labs.io/api/auth/azure/callback

AI_GATEWAY_API_KEY=...
JD_MATCH_AI_WEIGHT=0.65

# MinIO (mặc định — không cần AWS S3)
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=mat_khau_minio_tu_dat
S3_BUCKET=smart-hire-bucket
AWS_REGION=ap-southeast-1
AWS_ENDPOINT_URL=https://smart-hire.zen8labs.io/minio
```

Quy tắc quan trọng:

- Host trong `DATABASE_URL` phải là `db` (tên service Docker), không phải `localhost`
- `POSTGRES_PASSWORD` và password trong `DATABASE_URL` phải **giống nhau**
- **MinIO:** bắt buộc `AWS_ENDPOINT_URL=https://smart-hire.zen8labs.io/minio` (nginx proxy `/minio/`)
- Compose tự map `MINIO_ROOT_*` → credentials AWS SDK trong container app
- Chỉ khi dùng **S3 AWS thật** mới bỏ `AWS_ENDPOINT_URL`

Lưu file: `Ctrl+O` → Enter → `Ctrl+X` (nano).

### C2. Chạy Postgres + MinIO → migrate → app

```bash
cd /opt/smarthire/app
chmod +x deploy/deploy.sh

# 1) Database + MinIO
docker compose -f docker-compose.prod.yml up -d db minio
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml up minio-init   # tạo bucket + CORS

# 2) Tạo schema (chạy migrations/)
docker compose -f docker-compose.prod.yml --profile migrate run --rm migrate

# 3) Build + chạy app
docker compose -f docker-compose.prod.yml up -d --build app

# Kiểm tra
docker compose -f docker-compose.prod.yml ps
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3100/
curl -sS -o /dev/null -w "minio %{http_code}\n" http://127.0.0.1:9000/minio/health/live
```

HTTP code khoảng `200` / `307` / `302` là app đã lên (không phải connection refused).

Lần sau cập nhật code:

```bash
cd /opt/smarthire/app
./deploy/deploy.sh chore/aws-ec2-deploy
```



### C3. Database đã “dùng được” chưa?

Sau bước C2 thành công:


| Kiểm tra          | Cách                                                                              |
| ----------------- | --------------------------------------------------------------------------------- |
| Container DB chạy | `docker ps` thấy `smarthire_db`                                                   |
| Schema đã apply   | migrate exit code 0, không lỗi SQL                                                |
| App nối được DB   | `docker logs smarthire_app` không báo `Missing DATABASE_URL` / connection refused |


Vào Postgres thử (tuỳ chọn):

```bash
docker exec -it smarthire_db psql -U smarthire -d smart_hire -c '\dt'
```

Thấy danh sách bảng → DB đã sẵn sàng cho app.

---



## Phần D — Test từ laptop trước khi mở domain (tuỳ chọn)

Trên laptop (terminal khác), port-forward:

```bash
aws ssm start-session \
  --target i-040a0bcdfe9618b56 \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["3100"],"localPortNumber":["3100"]}' \
  --profile smart-hire
```

Mở [http://localhost:3000](http://localhost:3000) → **sai**, phải là **[http://localhost:3100](http://localhost:3100)**.

Nếu login cookie không giữ được vì HTTP:

1. Tạm thêm vào `.env` trên server: `COOKIE_SECURE=false`
2. `docker compose -f docker-compose.prod.yml up -d app`
3. Sau khi có HTTPS (phần E), **xoá** dòng đó rồi recreate app

---



## Phần E — nginx + HTTPS (domain công khai)

Trên server:

```bash
cd /opt/smarthire/app

sudo cp deploy/nginx/smart-hire.zen8labs.io.conf /etc/nginx/sites-available/smart-hire.zen8labs.io
sudo ln -sf /etc/nginx/sites-available/smart-hire.zen8labs.io /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t
sudo systemctl reload nginx

sudo snap install --classic certbot
sudo ln -sf /snap/bin/certbot /usr/bin/certbot
sudo certbot --nginx -d smart-hire.zen8labs.io
```

Mở: [https://smart-hire.zen8labs.io](https://smart-hire.zen8labs.io)

Nhớ bỏ `COOKIE_SECURE=false` nếu đã bật tạm ở phần D.

### E2. Nginx đã có SSL trước khi thêm MinIO?

Certbot thường sửa file site. Kiểm tra còn `location /minio/`:

```bash
sudo grep -n minio /etc/nginx/sites-available/smart-hire.zen8labs.io
```

Nếu **không** thấy: copy block `location /minio/` từ `deploy/nginx/smart-hire.zen8labs.io.conf` vào **cả** server `:80` và `:443`, rồi:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Kiểm tra MinIO local (không qua nginx):

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:9000/minio/health/live
```

---



## Phần F — Checklist “đã dùng được thật chưa?”

Đánh dấu từng mục:

- [ ] SSO / SSM vào được EC2
- [ ] Docker + nginx đã cài
- [ ] Clone đúng branch có file deploy
- [ ] `.env` đã điền password + JWT + MinIO
- [ ] `smarthire_db` healthy
- [ ] `smarthire_minio` healthy + `minio-init` OK
- [ ] `migrate` chạy OK (có bảng trong DB)
- [ ] `smarthire_app` chạy, `curl 127.0.0.1:3100` không refused
- [ ] nginx có `/minio/` + certbot OK → HTTPS mở được
- [ ] Login (email/password hoặc Microsoft) thành công
- [ ] Upload file (CV/JD) lên MinIO thành công
- [ ] AI (nếu cần) có `AI_GATEWAY_API_KEY`

**Database + schema + app CRUD:** xong khi các mục DB/migrate/app ✅  
**Login / upload / AI / domain:** SSL + MinIO (hoặc S3) như checklist trên. Azure chỉ cần nếu dùng Microsoft SSO.

---



## Việc cần nhờ Hung (nếu bị chặn quyền AWS)

- **Không bắt buộc** nếu dùng MinIO trên EC2 (mặc định trong compose prod)
- Chỉ khi chuyển sang S3 AWS thật: tạo bucket + CORS + IAM instance profile
- (Tuỳ chọn) RDS nếu không muốn Postgres trong Docker trên cùng máy

---



## Lỗi thường gặp


| Triệu chứng                         | Cách xử lý                                                                        |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| `Token has expired`                 | `aws sso login --profile smart-hire`                                              |
| `SessionManagerPlugin is not found` | Cài plugin (xem VM access guide)                                                  |
| `migrate` lỗi kết nối DB            | Đợi `db` healthy; kiểm tra password khớp                                          |
| App 502 qua nginx                   | `curl 127.0.0.1:3100` + `docker logs smarthire_app`                               |
| Login không giữ session             | HTTPS chưa có / còn `COOKIE_SECURE=false` sai lúc / Azure redirect URI không khớp |
| Upload file fail (MinIO)            | nginx có `location /minio/`? HTTPS? `AWS_ENDPOINT_URL=.../minio`? `minio-init` OK?   |
| Upload file fail (AWS S3)           | Không set `AWS_ENDPOINT_URL`; bucket/CORS/IAM đúng region                           |
| Certbot fail                        | `sudo systemctl status nginx` — nginx phải listen 80                              |


Xem log nhanh:

```bash
docker logs --tail 100 smarthire_app
docker logs --tail 100 smarthire_db
sudo journalctl -u nginx -n 50 --no-pager
```

---



## Sau này sửa `.env` rồi chạy lại

File `.env` nằm **trên server** (`/opt/smarthire/app/.env`), không nằm trên laptop (và không commit lên git).

### A. Đổi biến app (S3, Azure, AI, JWT, `COOKIE_SECURE`, …)

Postgres **không** cần tạo lại. Chỉ recreate container `app` để nạp env mới:

```bash
cd /opt/smarthire/app
nano .env          # sửa xong lưu
docker compose -f docker-compose.prod.yml up -d app --force-recreate
docker compose -f docker-compose.prod.yml ps
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3100/
```

`--force-recreate` bắt buộc: chỉ `restart` **không** đọc lại `.env`.

### B. Đổi password Postgres (`POSTGRES_PASSWORD` / `DATABASE_URL`)

Password chỉ áp dụng **lần đầu** volume được tạo. Đổi sau đó mà không xoá volume → app vẫn dùng password cũ trong data dir → login DB fail.

**Chỉ làm khi chấp nhận mất toàn bộ data DB:**

```bash
cd /opt/smarthire/app
nano .env   # đổi POSTGRES_PASSWORD + password trong DATABASE_URL (phải khớp nhau)

docker compose -f docker-compose.prod.yml down -v   # -v = xoá volume pgdata
docker compose -f docker-compose.prod.yml up -d db
docker compose -f docker-compose.prod.yml --profile migrate run --rm migrate
docker compose -f docker-compose.prod.yml up -d --build app
```

Muốn đổi password **giữ data** → vào `psql` đổi user rồi cập nhật `.env` (không dùng `down -v`). Hackathon/demo thường dùng cách xoá volume ở trên cho đơn giản.

### C. Cập nhật code (không đụng `.env`)

```bash
cd /opt/smarthire/app
git pull
./deploy/deploy.sh chore/aws-ec2-deploy
```

`.env` trên server giữ nguyên; script chỉ pull / build / migrate / up app.

---

## Tóm tắt lệnh “happy path” (đã có Docker + `.env`)

```bash
cd /opt/smarthire/app
git pull
./deploy/deploy.sh chore/aws-ec2-deploy
```

Lần đầu tiên trên máy trống: làm đủ **Phần B → C → E**.
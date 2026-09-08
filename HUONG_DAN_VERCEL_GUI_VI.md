# Hướng dẫn deploy SkillPass bằng Vercel GUI — không dùng Vercel CLI

Tài liệu này dành cho cách triển khai đơn giản nhất của SkillPass:

- deploy bằng **giao diện web Vercel**;
- không cần chạy Vercel CLI;
- không cần PostgreSQL/Redis/Docker trên máy cá nhân;
- chỉ dùng một file shell cục bộ để lấy metadata CKB và sinh toàn bộ ENV cần nhập thủ công;
- Neon được kết nối trực tiếp từ Vercel GUI và tự cung cấp `DATABASE_URL`.

> **Mục tiêu an toàn ban đầu:** CKB Testnet, `PAYMENTS_REQUIRED=false`, `FIBER_BACKEND=mock`. Chỉ bật Fiber/FNN thật sau khi bản cơ sở đã ổn định.

---

## 1. Bạn cần chuẩn bị gì trên máy?

Cho lần đầu deploy contract CKB:

1. **Git Bash** hoặc WSL trên Windows.
2. **Node.js 24 LTS trở lên**.
3. **npm**.
4. **Rust/Cargo** qua rustup.
5. Internet.

Bạn **không cần** cài:

- PostgreSQL;
- Redis;
- Docker Desktop;
- CKB full node;
- Vercel CLI.

Sau khi contract Testnet đã được deploy và `deployments/testnet.json` tồn tại, các lần sau script có thể tái sử dụng metadata này nên Rust/OffCKB/faucet không còn cần cho việc tạo lại ENV.

---

## 2. Giải nén project và chạy script tạo ENV

Mở Git Bash trong thư mục project:

```bash
cd /d/duong-dan/ckb-skill-main-vercel-gui
```

Chạy:

```bash
bash collect-vercel-env.sh
```

Script **không đăng nhập Vercel** và **không thay đổi tài khoản Vercel**.

### Nếu contract đã deploy trước đó

Nếu có file hợp lệ:

```text
deployments/testnet.json
```

script sẽ:

1. đọc metadata đã deploy;
2. bỏ qua faucet;
3. bỏ qua Rust build;
4. không tạo transaction CKB mới;
5. tạo lại file ENV an toàn.

### Nếu đây là lần đầu

Script sẽ tự:

1. kiểm tra Node/npm/Rust;
2. cài OffCKB nếu chưa có;
3. đọc account Testnet của OffCKB;
4. kiểm tra balance;
5. gọi faucet Testnet nếu balance thấp;
6. build `contracts/capability-type`;
7. deploy contract lên CKB Testnet;
8. đọc chính xác `codeHash`, `hashType`, `depTxHash`, `depIndex` từ output OffCKB;
9. tạo `deployments/testnet.json`;
10. tạo secret ngẫu nhiên `FACILITATOR_AUTH_TOKEN`;
11. tạo file `.env.vercel.gui`.

> Chỉ sử dụng OffCKB development account cho **Testnet**. Không chuyển CKB mainnet hoặc tài sản có giá trị vào account development này.

---

## 3. File ENV bạn nhận được

Sau khi script thành công:

```text
.env.vercel.gui
```

File sẽ có dạng:

```env
CAPABILITY_CODE_HASH=0x...
CAPABILITY_HASH_TYPE=data2
CAPABILITY_DEP_TX_HASH=0x...
CAPABILITY_DEP_INDEX=0

STATE_BACKEND=postgres
POSTGRES_POOL_MAX=2
TRUST_PROXY=true
SKILLPASS_PUBLIC_PRODUCTION=true
ENABLE_PUBLIC_ISSUE=false
CHALLENGE_TTL_MS=60000
SERVICE_RECEIPT_TTL_SECONDS=86400
MAX_REQUEST_BODY_BYTES=36864
PAYMENT_HEADER_MAX_BYTES=12288
UPSTREAM_TIMEOUT_MS=8000
CHALLENGE_RATE_LIMIT_PER_MINUTE=12
ANALYZE_RATE_LIMIT_PER_MINUTE=8
GLOBAL_CHALLENGE_RATE_LIMIT_PER_MINUTE=240
GLOBAL_ANALYZE_RATE_LIMIT_PER_MINUTE=120
ENABLE_DEEP_HEALTH=false

PAYMENTS_REQUIRED=false
FIBER_NETWORK=testnet
FIBER_BACKEND=mock
FIBER_PAYMENT_PROOF=invoice-status
ALLOW_DEV_PAYMENT=false
FACILITATOR_MAX_REQUEST_BODY_BYTES=32768
FIBER_RPC_TIMEOUT_MS=8000

FACILITATOR_AUTH_TOKEN=<secret-ngau-nhien>
```

### Hai biến cố ý KHÔNG nằm trong file

#### `DATABASE_URL`

Không tự tạo và không paste thủ công nếu dùng Neon integration.

Neon/Vercel sẽ cung cấp biến này sau khi bạn kết nối database trong GUI.

#### `FACILITATOR_URL`

Không tạo biến này bằng tay.

`vercel.json` của project dùng Vercel service binding để cung cấp URL nội bộ giữa API và facilitator.

---

## 4. Không commit `.env.vercel.gui`

File chứa:

```text
FACILITATOR_AUTH_TOKEN
```

nên là secret.

Repo đã ignore `.env.*`, vì vậy thông thường Git sẽ không thêm file này.

Kiểm tra trước khi push:

```bash
git status
```

Bạn **không được** thấy `.env.vercel.gui` nằm trong danh sách file chuẩn bị commit.

Không gửi file ENV qua chat công khai, issue, Discord, Telegram group hoặc GitHub.

---

# PHẦN A — Đưa source code lên GitHub

## 5. Push repo lên GitHub

Bạn có thể dùng GitHub Desktop hoặc giao diện GitHub theo workflow quen thuộc.

Trước khi push, tối thiểu kiểm tra:

```bash
npm run security:preflight
```

Nếu có dependency đầy đủ, chạy thêm:

```bash
npm audit
```

Không push:

```text
.env.vercel.gui
.env
.secrets/
node_modules/
.vercel/
```

---

# PHẦN B — Tạo project bằng Vercel GUI

## 6. Import GitHub repository

Mở:

```text
https://vercel.com/dashboard
```

Sau đó:

1. Chọn **Add New**.
2. Chọn **Project**.
3. Chọn repository SkillPass trên GitHub.
4. Chọn **Import**.

### Root Directory

Giữ **root của repository**.

Không đặt Root Directory thành:

```text
apps/web
```

Lý do: file root:

```text
vercel.json
```

định nghĩa cả ba service:

```text
web
api
facilitator
```

Nếu bạn trỏ Root Directory vào `apps/web`, Vercel sẽ không đọc cấu hình multi-service ở root.

### Framework preset

Không cần cố ép toàn project thành một Vite project. `vercel.json` đã khai báo service `web` dùng Vite và hai backend service riêng.

---

# PHẦN C — Nhập ENV bằng GUI

## 7. Paste `.env.vercel.gui` vào Vercel

Vercel Dashboard hỗ trợ thêm nhiều environment variable cùng lúc / paste một batch ENV.

Trong project:

```text
Project
→ Settings
→ Environment Variables
```

Mở file:

```text
.env.vercel.gui
```

Copy các dòng `KEY=VALUE` và paste vào phần nhập environment variables của Vercel.

Nếu giao diện hiện chế độ nhập nhiều biến/batch, dùng chế độ đó. Nếu giao diện hiện từng key riêng, bạn vẫn có thể thêm từng key; nội dung file là source of truth.

### Scope khuyến nghị ban đầu

Chọn:

```text
Production
```

cho bản public đầu tiên.

Bạn có thể thêm Preview sau, nhưng không cần đưa secret vào Development nếu bạn không dùng Vercel Development environment.

### Secret phải đánh dấu Sensitive

Biến:

```text
FACILITATOR_AUTH_TOKEN
```

nên được lưu dưới dạng **Sensitive** nếu giao diện Vercel cho phép lựa chọn này.

Với real Fiber sau này, các biến sau cũng là secret:

```text
FIBER_RPC_TOKEN
DEEP_HEALTH_TOKEN
```

### Sau khi lưu ENV

Thay đổi ENV chỉ có hiệu lực đối với deployment mới. Nếu project đã deploy trước đó, bạn phải **Redeploy**.

---

# PHẦN D — Tạo Neon PostgreSQL hoàn toàn bằng GUI

## 8. Kết nối Neon

Trong Vercel, mở project SkillPass.

Tùy layout dashboard hiện tại, vào phần **Storage / Marketplace / Integrations** và chọn **Neon**.

Bạn có thể tìm Neon trực tiếp trên Vercel Marketplace:

```text
https://vercel.com/marketplace/neon
```

Chọn:

```text
Install
```

Sau đó chọn một trong hai hướng:

- **Create New Neon Account** nếu chưa có Neon;
- **Link Existing Neon Account** nếu đã có.

Gắn Neon resource với chính project SkillPass.

Sau khi kết nối đúng, Vercel/Neon cung cấp connection environment variables cho project; SkillPass cần:

```text
DATABASE_URL
```

### Bạn KHÔNG cần

- cài PostgreSQL trên Windows;
- tạo user database bằng tay;
- tự chọn database password;
- chạy pgAdmin;
- copy password vào source code.

### Kiểm tra

Vào:

```text
Project
→ Settings
→ Environment Variables
```

và xác nhận có:

```text
DATABASE_URL
```

Không copy giá trị này vào GitHub.

---

# PHẦN E — Deploy / Redeploy bằng GUI

## 9. Deploy production

Nếu project chưa deploy, chọn **Deploy** sau khi cấu hình ENV.

Nếu đã có deployment trước khi Neon được kết nối:

1. vào **Deployments**;
2. chọn deployment mới nhất;
3. mở menu `...`;
4. chọn **Redeploy**;
5. bảo đảm redeploy sử dụng environment variables hiện tại.

Mọi thay đổi ENV cần một deployment mới để runtime nhận giá trị mới.

---

## 10. Sau deploy, kiểm tra bằng browser

Giả sử Vercel URL là:

```text
https://your-skillpass.vercel.app
```

Mở lần lượt:

```text
https://your-skillpass.vercel.app/health
```

và:

```text
https://your-skillpass.vercel.app/api/config
```

và:

```text
https://your-skillpass.vercel.app/.well-known/skillpass.json
```

Không đưa deep health ra public ở bản đầu:

```env
ENABLE_DEEP_HEALTH=false
```

---

# PHẦN F — Kiểm soát chi phí trước khi public

## 11. Vercel Firewall / WAF

Trước khi chia sẻ URL rộng rãi, vào phần Firewall của project/team trong dashboard và tạo rate-limit rule cho API, tối thiểu vùng:

```text
/api/*
```

Application đã có rate limit bên trong, nhưng WAF chặn request **trước khi request đi sâu vào Functions/database**, nên giúp giảm blast radius và chi phí khi bị abuse.

Giữ application limits mặc định ban đầu:

```env
CHALLENGE_RATE_LIMIT_PER_MINUTE=12
ANALYZE_RATE_LIMIT_PER_MINUTE=8
GLOBAL_CHALLENGE_RATE_LIMIT_PER_MINUTE=240
GLOBAL_ANALYZE_RATE_LIMIT_PER_MINUTE=120
```

Không tăng các con số này chỉ để "test dễ hơn" trên production.

---

## 12. Billing / Spend Management

Nếu dùng plan có Spend Management:

1. vào Team Settings;
2. mở Billing / Spend Management;
3. đặt ngưỡng cảnh báo thấp trong giai đoạn đầu;
4. nếu Vercel cung cấp action **Pause production deployment**, bật action đó nếu mục tiêu của bạn là tránh vượt ngân sách.

Không nên hiểu "có spend threshold" đồng nghĩa chắc chắn hệ thống tự dừng; phải kiểm tra action thực tế trong dashboard.

Neon là Marketplace/database resource nên kiểm tra usage/plan của Neon riêng; đừng giả định limit Vercel tự giới hạn mọi chi phí database.

---

# PHẦN G — Cấu hình an toàn ban đầu

## 13. Không bật real Fiber ngay

Giữ:

```env
PAYMENTS_REQUIRED=false
FIBER_BACKEND=mock
ALLOW_DEV_PAYMENT=false
```

Mục tiêu lần đầu là xác nhận:

- frontend chạy;
- wallet connect chạy;
- signature verification chạy;
- CKB ownership verification chạy;
- Neon persistence chạy;
- rate limit chạy;
- không có error loop.

Chỉ sau đó mới cấu hình FNN/Fiber thật.

---

## 14. Các biến KHÔNG cần thêm ở bản đầu

Không thêm nếu bạn chưa có lý do cụ thể:

```text
CKB_RPC_URL
PUBLIC_BASE_URL
FIBER_RPC_URL
FIBER_RPC_TOKEN
DEEP_HEALTH_TOKEN
PAYMENT_AMOUNT
PAYMENT_PAY_TO
```

CKB custom RPC chỉ nên dùng endpoint HTTPS từ nhà cung cấp đáng tin cậy. Không dùng:

```text
http://127.0.0.1:...
http://localhost:...
```

vì Vercel không thể truy cập service chạy trên PC cá nhân của bạn.

---

# PHẦN H — Khi muốn bật Fiber/FNN thật

## 15. Biến bổ sung

Sau khi base deployment ổn định, bạn mới đổi/add:

```env
PAYMENTS_REQUIRED=true
FIBER_BACKEND=fnn
FIBER_RPC_URL=https://YOUR-REMOTE-FNN-RPC
FIBER_RPC_TOKEN=YOUR_SECRET_IF_REQUIRED
PAYMENT_AMOUNT=100000
PAYMENT_ASSET=CKB
PAYMENT_DECIMALS=8
PAYMENT_ATOMIC_UNIT=shannon
PAYMENT_PAY_TO=YOUR_REAL_TESTNET_RECEIVER
PAYMENT_CURRENCY=Fibt
PAYMENT_TIMEOUT_SECONDS=600
```

Sau khi thay đổi ENV bằng GUI, **Redeploy**.

Không lưu `FIBER_RPC_TOKEN` vào GitHub.

---

# PHẦN I — Khi sửa code sau này

## 16. Bạn có cần deploy contract lại không?

Không, nếu chỉ sửa:

- frontend;
- API;
- CSS/UI;
- database code;
- documentation;
- Vercel config.

Giữ nguyên:

```text
deployments/testnet.json
```

Sau đó nếu muốn tạo lại ENV:

```bash
bash collect-vercel-env.sh
```

Script sẽ tái sử dụng contract hiện tại.

Chỉ khi **cố ý thay đổi smart contract Rust** và muốn deploy version mới mới chạy:

```bash
SKILLPASS_FORCE_CONTRACT=1 bash collect-vercel-env.sh
```

Điều này tạo transaction Testnet mới và có thể cần thêm testnet CKB.

---

# PHẦN J — Checklist GO / NO-GO

## 17. Chỉ public khi tất cả đều YES

### Source

- [ ] `.env.vercel.gui` không nằm trong Git commit.
- [ ] Không có private key trong repo.
- [ ] `npm run security:preflight` pass.
- [ ] Nếu dependency đã install: `npm audit` đã được kiểm tra.

### Vercel ENV

- [ ] `CAPABILITY_CODE_HASH` có `0x` + 64 hex.
- [ ] `CAPABILITY_DEP_TX_HASH` có `0x` + 64 hex.
- [ ] `CAPABILITY_HASH_TYPE` đúng với deployment metadata.
- [ ] `CAPABILITY_DEP_INDEX` đúng.
- [ ] `FACILITATOR_AUTH_TOKEN` là secret mạnh và được đánh Sensitive.
- [ ] `DATABASE_URL` tồn tại nhờ Neon integration.
- [ ] Không tự thêm `FACILITATOR_URL`.

### Safe mode

- [ ] `ENABLE_PUBLIC_ISSUE=false`.
- [ ] `ALLOW_DEV_PAYMENT=false`.
- [ ] `ENABLE_DEEP_HEALTH=false`.
- [ ] `PAYMENTS_REQUIRED=false` cho lần public đầu.
- [ ] `FIBER_BACKEND=mock` cho lần public đầu.
- [ ] `POSTGRES_POOL_MAX=2`.

### Cost protection

- [ ] WAF/firewall rate limit đã bật cho `/api/*`.
- [ ] Billing alert/spend controls đã kiểm tra.
- [ ] Neon usage/plan đã kiểm tra riêng.
- [ ] Không có endpoint public tạo công việc đắt tiền trước authentication.

### Runtime

- [ ] `/health` trả success.
- [ ] `/api/config` trả success.
- [ ] Wallet test thành công.
- [ ] Không có error lặp vô hạn trong Vercel Logs.
- [ ] Không thấy DB connection tăng bất thường.

Nếu một mục quan trọng là **NO**, chưa chia sẻ URL public.

---

# 18. Workflow ngắn nhất

```text
1. Extract project
2. Git Bash -> bash collect-vercel-env.sh
3. Nhận .env.vercel.gui
4. Push source lên GitHub (KHÔNG push file ENV)
5. Vercel Dashboard -> Add New -> Project -> Import repo
6. Project Settings -> Environment Variables -> paste .env.vercel.gui
7. Mark FACILITATOR_AUTH_TOKEN as Sensitive
8. Project -> Storage/Marketplace -> Neon -> Install/Connect
9. Verify DATABASE_URL exists
10. Deploy/Redeploy
11. Test /health and /api/config
12. Configure Vercel Firewall/WAF
13. Check billing controls + Neon usage
14. Public URL
```

Sau khi deploy xong, máy tính cá nhân của bạn có thể tắt. Vercel, Neon và CKB Testnet hoạt động độc lập với máy local.

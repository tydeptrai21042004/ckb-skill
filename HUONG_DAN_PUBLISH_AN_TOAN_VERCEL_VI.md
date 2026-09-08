# Hướng dẫn publish SkillPass an toàn trên Vercel và hạn chế chi phí ngoài ý muốn

Tài liệu này dành cho bản **SkillPass Vercel hardened** trong repository này.
Mục tiêu là giảm hai nhóm rủi ro trước khi public URL:

1. **Rủi ro bảo mật**: giả mạo request, CSRF/cross-site, XSS, replay payment, lộ secret, gọi trực tiếp facilitator, request quá lớn, endpoint health gây tải upstream, RPC không an toàn.
2. **Rủi ro chi phí**: bot spam API làm tăng Vercel Function usage, query PostgreSQL quá nhiều, tạo Fiber invoice trước khi user được xác thực, function chạy quá lâu, connection pool quá lớn, public health check liên tục gọi CKB/Fiber/DB.

> Không có cấu hình cloud nào bảo đảm tuyệt đối “0 bug” hoặc “0 chi phí”. Bản này dùng nhiều lớp fail-closed và quota/rate-limit để giảm đáng kể khả năng một bug hoặc bot tạo chi phí ngoài dự kiến. Trước khi public rộng, luôn bật cả **Vercel Firewall** và **billing/spend controls** phù hợp với plan của bạn.

---

## 1. Kiến trúc public được khuyến nghị

```text
User browser / wallet
        |
        | HTTPS
        v
Vercel Firewall / WAF
        |
        v
Vercel web + API
        |
        +----> Neon PostgreSQL
        |
        +----> CKB Testnet RPC
        |
        `----> private Vercel service binding
                  |
                  v
             Facilitator
                  |
                  `----> remote FNN RPC (chỉ khi bật real payment)
```

Điểm quan trọng:

- Facilitator không có rewrite public trực tiếp trong `vercel.json`.
- `PAYMENTS_REQUIRED=false` và `FIBER_BACKEND=mock` là trạng thái publish ban đầu an toàn nhất.
- `DATABASE_URL` do Neon/Vercel cung cấp; không lưu database password trong repository.
- `FACILITATOR_AUTH_TOKEN` được script sinh ngẫu nhiên và upload dưới dạng Vercel **Sensitive/Secret**.
- Các biến SkillPass do script upload **Production only**, tránh Preview vô tình dùng cùng production configuration.

---

## 2. Những thay đổi bảo mật/cost guard đã có trong code

### 2.1. Wallet phải được xác thực trước khi tạo Fiber invoice

Luồng `/api/analyze` hiện tại:

```text
validate request shape
      |
rate limit
      |
consume one-time challenge
      |
verify wallet signature
      |
verify live CKB capability ownership
      |
      +---- nếu payment chưa có -> mới tạo invoice 402
      |
verify payment
      |
run protected service
      |
settle payment
```

Như vậy request chưa chứng minh được wallet + quyền sở hữu CKB **không thể ép server tạo invoice/FNN work trước**.

### 2.2. Giới hạn request trước khi thực hiện công việc đắt tiền

Mặc định:

```env
MAX_REQUEST_BODY_BYTES=36864
PAYMENT_HEADER_MAX_BYTES=12288
FACILITATOR_MAX_REQUEST_BODY_BYTES=32768
UPSTREAM_TIMEOUT_MS=8000
FIBER_RPC_TIMEOUT_MS=8000
```

Ngoài body size, server còn chặn URL/header quá lớn trước khi parse route.

### 2.3. Rate limit hai lớp trong app

```env
CHALLENGE_RATE_LIMIT_PER_MINUTE=12
ANALYZE_RATE_LIMIT_PER_MINUTE=8
GLOBAL_CHALLENGE_RATE_LIMIT_PER_MINUTE=240
GLOBAL_ANALYZE_RATE_LIMIT_PER_MINUTE=120
```

Đây là lớp phía application. **Không thay thế Vercel WAF**, vì WAF có thể chặn request ngay ở edge trước khi request dùng Function/DB.

### 2.4. Public health/status không được phép trở thành “billing loop”

Public:

```text
/health
/livez
/api/status
/api/config
/.well-known/skillpass.json
/api/openapi.json
```

được thiết kế cheap/cacheable. `/api/status` là **shallow status**, không poll CKB + DB + Fiber mỗi lần browser hỏi.

Deep readiness:

```text
/readyz
```

mặc định:

```env
ENABLE_DEEP_HEALTH=false
```

Nếu thực sự cần bật public production, phải dùng secret `DEEP_HEALTH_TOKEN` >= 32 ký tự.

### 2.5. Function duration và DB pool bị giới hạn

`vercel.json`:

```text
API maxDuration         <= 15 giây
Facilitator maxDuration <= 12 giây
```

Neon/Postgres trên Vercel:

```env
POSTGRES_POOL_MAX=2
```

Ngoài ra query/statement timeout cũng bị giới hạn trong production-store.

### 2.6. Fail-closed production profile

`node scripts/check-vercel-env.mjs` sẽ reject các cấu hình nguy hiểm như:

- `STATE_BACKEND=local`
- `ENABLE_PUBLIC_ISSUE=true`
- `ALLOW_DEV_PAYMENT=true`
- `TRUST_PROXY=false`
- localhost RPC trên Vercel
- HTTP RPC thay vì HTTPS khi public
- facilitator token quá ngắn
- body limit / timeout / rate-limit cao bất thường
- bật payment thật nhưng thiếu remote FNN RPC hoặc payment receiver

---

# PHẦN A — DEPLOY LẦN ĐẦU

## 3. Chuẩn bị máy local

Cần:

```text
Node.js 24+
npm
Git Bash hoặc WSL (Windows)
Rust/Cargo chỉ cần khi deploy contract lần đầu
Internet
```

Không cần:

```text
Docker
PostgreSQL local
Redis local
CKB node local
PC chạy 24/24
```

Kiểm tra:

```bash
node --version
npm --version
cargo --version
```

---

## 4. Chạy security preflight trước khi deploy

Từ root repository:

```bash
npm run security:preflight
```

Bạn muốn thấy:

```text
SkillPass security preflight: PASS
```

Script kiểm tra tối thiểu:

- Vercel Function duration không bị tăng ngoài giới hạn an toàn.
- CSP/security headers còn tồn tại.
- production env template vẫn fail-closed.
- wallet/CKB authentication xảy ra trước Fiber invoice.
- facilitator auth còn được bắt buộc.
- direct npm dependency versions không bị đổi sang `latest`, `^`, `~`, wildcard.
- tìm một số pattern secret nguy hiểm bị commit nhầm.

### Lưu ý về lockfile

Repository hiện pin exact **direct dependency versions**, nhưng nếu chưa có lockfile thì transitive dependencies vẫn có thể thay đổi.

Trước một launch quan trọng, nên tạo/commit lockfile khi máy có network ổn định và chạy audit:

```bash
npm install --package-lock-only
npm audit
```

Nếu từng app/package được deploy độc lập và có `package.json` riêng, tạo lockfile tương ứng trong package đó. Không tạo lockfile bằng cách copy/fake thủ công.

---

## 5. Deploy CKB + Vercel bằng script

```bash
bash setup-vercel.sh
```

Script sẽ:

```text
reuse contract metadata nếu đã có
hoặc deploy capability-type Testnet nếu chưa có
        |
generate .env.vercel.generated
        |
link Vercel
        |
kiểm tra/kết nối Neon DATABASE_URL
        |
upload SkillPass env vào Production only
        |
mark secret là Sensitive
        |
validate remote Production env bằng vercel env run
        |
static syntax/config checks
        |
vercel --prod
        |
smoke test /health + /api/config
```

### Tại sao script không dùng `vercel env pull` nữa?

Để tránh download `DATABASE_URL` và các secret production về file local. Validation hiện dùng:

```bash
vercel env run -e production -- node scripts/check-vercel-env.mjs
```

Secret được cấp trực tiếp cho process kiểm tra, không cần ghi `.env.production` ra disk.

---

## 6. Kiểm tra environment variables sau deploy

Vercel Dashboard:

```text
Project
-> Settings
-> Environment Variables
```

Production phải có tối thiểu:

```env
CAPABILITY_CODE_HASH=0x...
CAPABILITY_HASH_TYPE=<giá trị thật từ OffCKB>
CAPABILITY_DEP_TX_HASH=0x...
CAPABILITY_DEP_INDEX=0

STATE_BACKEND=postgres
POSTGRES_POOL_MAX=2
TRUST_PROXY=true
SKILLPASS_PUBLIC_PRODUCTION=true
ENABLE_PUBLIC_ISSUE=false

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
ALLOW_DEV_PAYMENT=false
FACILITATOR_AUTH_TOKEN=<secret random 64 hex>
```

Neon integration cung cấp:

```env
DATABASE_URL=...
```

Không copy `DATABASE_URL` vào GitHub/repository.

---

# PHẦN B — BẮT BUỘC LÀM TRƯỚC KHI PUBLIC URL

## 7. Bật Vercel Firewall rate limit

Đây là bước quan trọng nhất để giảm bot/cost trước Function.

### Cách 1 — dùng script có sẵn

```bash
bash setup-vercel-firewall.sh
```

Script sẽ đề nghị tạo rule:

```text
Path:   /api/*
Key:    IP
Window: 1 phút
Limit:  30 request
Action: 429
```

Sau khi CLI chạy, **phải kiểm tra lại rule trong Dashboard** vì command dùng Vercel AI rule generator.

### Cách 2 — cấu hình thủ công

```text
Vercel Dashboard
-> Project
-> Firewall
-> Configure
-> + New Rule
```

Thiết lập:

```text
Name: SkillPass API cost guard
If: Path starts with /api/
Then: Rate Limit
Algorithm: Fixed Window
Window: 60 seconds
Limit: 30
Key: IP
Action: 429
```

Sau đó:

```text
Review Changes
-> Publish
```

Vercel docs hiện cho biết WAF Rate Limiting có trên tất cả plans. Hobby hiện cho phép 1 rate-limit rule/project, nên dùng rule đó cho `/api/*` là hợp lý cho prototype.

Nguồn:
- https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting
- https://vercel.com/changelog/manage-vercel-firewall-in-the-cli

### Vì sao vẫn cần application rate limit?

Hai lớp bảo vệ mục tiêu khác nhau:

```text
Vercel WAF
  -> chặn bot/traffic trước Function

Application rate limit
  -> giới hạn chính xác endpoint đắt tiền
     /api/challenge = 12/min/IP
     /api/analyze   = 8/min/IP
```

Không tăng các limit này chỉ để “hết 429” trước khi biết rõ traffic hợp lệ thực tế.

---

## 8. Bảo vệ Preview Deployments

Preview URL có thể vô tình bị crawler/bot tìm thấy và gọi API.

Trong Vercel:

```text
Project
-> Settings
-> Deployment Protection
```

Khuyến nghị:

```text
Method: Vercel Authentication
Scope: Standard Protection
```

Mục tiêu:

- Preview deployment: cần đăng nhập Vercel.
- Production domain: vẫn public.

Vercel Authentication/Standard Protection hiện dùng được trên cả Hobby.

Nguồn:
- https://vercel.com/academy/optimize-your-vercel-account/deployment-protection

Bản `setup-vercel.sh` chỉ upload SkillPass variables vào **Production**, nên Preview cũng fail-closed nếu không được cấp config riêng.

---

## 9. Cấu hình chống “bill shock” trên Vercel

### Nếu đang dùng Hobby và project phù hợp điều khoản Hobby

Vercel hiện mô tả Hobby là plan miễn phí cho personal projects/developers; khi vượt included free-tier usage, Hobby deployment sẽ bị pause thay vì tự động tiếp tục on-demand như Pro.

Vẫn phải:

```text
Vercel Dashboard
-> Usage
```

kiểm tra định kỳ trong thời gian mới public.

Nguồn:
- https://vercel.com/docs/plans

### Nếu dùng Pro

**Không chỉ nhập spend amount rồi nghĩ rằng đã hard-cap.**

Vercel:

```text
Team Dashboard
-> Settings
-> Billing
-> Spend Management
```

Bật:

```text
Spend Management = Enabled
Spend amount = mức bạn thực sự chấp nhận được
Action = Pause production deployment of all projects
Notifications = Email/Web/SMS phù hợp
```

Vercel docs nói rõ:

- Spend Management chỉ có trên Pro.
- Setting spend amount **không tự pause** nếu bạn không chọn action pause.
- Check không liên tục từng millisecond; có thể trễ vài phút. Vì vậy set threshold thấp hơn “mức tiền tối đa tuyệt đối” bạn có thể chịu.
- Marketplace integrations/add-ons **không nằm trong** Vercel Spend Management.

Nguồn:
- https://vercel.com/docs/spend-management

### Khuyến nghị khi mới test

Nếu bạn dùng Pro và chỉ muốn thử public nhỏ, đặt spend threshold ở một mức nhỏ mà bạn sẵn sàng mất nếu có bug. Ví dụ `5–10 USD` **chỉ là ví dụ**, hãy đặt theo ngân sách thật của bạn và bật action **Pause production deployment**.

---

## 10. Kiểm soát chi phí Neon riêng

Đây là phần rất quan trọng: **Neon là Marketplace/integration riêng**, nên Vercel Spend Management không bao phủ integration charges.

Khuyến nghị khi mới public:

1. Dùng Neon Free nếu phù hợp nhu cầu.
2. Giữ compute/autoscaling ở mức thấp.
3. Giữ scale-to-zero/autosuspend cho prototype/traffic thấp.
4. Không upgrade Neon sang paid trước khi thực sự cần.
5. Nếu dùng Neon paid, vào Neon Billing và bật spending alerts/limit hiện có của Neon.

Neon hiện hỗ trợ autoscaling với max compute limit; scale-to-zero giúp idle database không tiếp tục dùng compute. Paid organizations cũng có Spending Limit alerts; kiểm tra UI hiện tại của Neon trước khi coi đó là hard stop, vì tính năng enforcement có thể thay đổi theo thời điểm.

Nguồn:
- https://neon.com/blog/neon-autoscaling-is-generally-available
- https://neon.com/blog/introducing-organization-spending-limits

---

# PHẦN C — SECURITY CHECK SAU DEPLOY

## 11. Kiểm tra public endpoints

Thay `YOUR_URL`:

```bash
export SKILLPASS_URL="https://YOUR_PROJECT.vercel.app"
```

### Health

```bash
curl -i "$SKILLPASS_URL/health"
```

Mong đợi:

```text
HTTP 200
Cache-Control: public, ...
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
```

### Public config

```bash
curl -i "$SKILLPASS_URL/api/config"
```

Không được thấy:

```text
DATABASE_URL
FACILITATOR_AUTH_TOKEN
FIBER_RPC_TOKEN
private key
```

### Deep health phải tắt

```bash
curl -i "$SKILLPASS_URL/readyz"
```

Mặc định mong đợi:

```text
404
```

Nếu endpoint này trả deep database/RPC details public mà bạn không chủ động bật, **không public site** cho tới khi sửa.

---

## 12. Kiểm tra method/content-type abuse

Ví dụ form POST phải bị reject:

```bash
curl -i \
  -X POST \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'address=test' \
  "$SKILLPASS_URL/api/challenge"
```

Mong đợi:

```text
415 Unsupported Media Type
```

Unknown mutation:

```bash
curl -i -X DELETE "$SKILLPASS_URL/api/not-real"
```

phải 404/405, không được chạy DB/Fiber operation tùy ý.

---

## 13. Kiểm tra WAF sau khi bật

Không chạy stress test lớn.

Chỉ kiểm tra khoảng 31–35 request nhỏ:

```bash
for i in $(seq 1 35); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$SKILLPASS_URL/api/config")
  echo "$i $code"
done
```

Sau ngưỡng, bạn nên thấy `429` nếu rule `/api/* 30/min/IP` đang hoạt động.

Không dùng benchmark hàng nghìn request vào production để “test rate limit”, vì chính test đó có thể tạo usage/cost.

---

# PHẦN D — SECRET MANAGEMENT

## 14. Không được commit các file này

`.gitignore` của repo đã ignore:

```text
.env
.env.*
.vercel/
.secrets/
*.log
```

và chỉ allow example files.

Đặc biệt không commit:

```text
.env.vercel.generated
.env.local
.vercel/
private deployer key
FIBER_RPC_TOKEN
FACILITATOR_AUTH_TOKEN
DATABASE_URL
```

### Kiểm tra trước khi zip/push

```bash
npm run security:preflight
```

Nếu có Git:

```bash
git status --short
```

Kiểm tra không có `.env.vercel.generated` hoặc private key trong staged files.

---

## 15. Nếu lỡ public secret

Không chỉ xóa file khỏi commit mới.

Làm ngay:

1. Rotate secret ở provider.
2. `FACILITATOR_AUTH_TOKEN`: tạo token mới và update Vercel Production env.
3. `DATABASE_URL`: rotate Neon database credentials/password/role.
4. `FIBER_RPC_TOKEN`: rotate ở FNN provider.
5. Nếu là deployer private key: coi key đó đã compromised và không dùng lại cho asset có giá trị.
6. Redeploy production.
7. Sau đó mới cleanup Git history nếu cần.

---

# PHẦN E — REAL FIBER PAYMENT

## 16. Không bật real payment ngay lần publish đầu

Ban đầu giữ:

```env
PAYMENTS_REQUIRED=false
FIBER_BACKEND=mock
ALLOW_DEV_PAYMENT=false
```

Chỉ chuyển sang real payment sau khi:

```text
[ ] Vercel WAF đã hoạt động
[ ] Usage/billing guard đã bật
[ ] Neon cost guard đã kiểm tra
[ ] wallet challenge/signature flow ổn định
[ ] CKB ownership verification ổn định
[ ] production logs không có error loop
[ ] facilitator private binding hoạt động
[ ] có remote HTTPS FNN RPC đáng tin cậy
```

Sau đó:

```env
PAYMENTS_REQUIRED=true
FIBER_BACKEND=fnn
FIBER_RPC_URL=https://YOUR_REMOTE_FNN_RPC
FIBER_RPC_TOKEN=<secret nếu provider yêu cầu>
PAYMENT_AMOUNT=<positive integer atomic units>
PAYMENT_PAY_TO=<receiver>
```

### Không bao giờ dùng

```env
FIBER_RPC_URL=http://127.0.0.1:8227
```

trên Vercel.

Hardened checker sẽ reject localhost hoặc non-HTTPS public RPC.

---

# PHẦN F — MONITORING 24 GIỜ ĐẦU

## 17. Sau khi public

Trong 24 giờ đầu, kiểm tra thường xuyên:

### Vercel

```text
Project -> Observability / Logs
Project/Team -> Usage
Project -> Firewall
```

Tìm:

```text
429 rate limit tăng bất thường
5xx tăng
function duration cao
request volume đột biến
/api/analyze bị spam
```

### Neon

Kiểm tra:

```text
compute usage
active connections
storage
query/load bất thường
```

Pool trong app đang là `2` mỗi Vercel instance để giảm nguy cơ connection explosion, nhưng autoscaling Functions vẫn có thể tạo nhiều instance, vì vậy WAF vẫn là lớp đầu tiên cần có.

---

# PHẦN G — QUY TRÌNH UPDATE AN TOÀN

## 18. Update frontend/backend bình thường

Không cần deploy contract lại.

```bash
npm run security:preflight
bash setup-vercel.sh
```

Nếu `deployments/testnet.json` hợp lệ, script reuse contract hiện tại.

### Chỉ khi thay Rust contract

```bash
SKILLPASS_FORCE_CONTRACT=1 bash setup-vercel.sh
```

Không dùng flag này cho update frontend thông thường vì nó tạo on-chain deployment mới.

---

# PHẦN H — CHECKLIST “GO PUBLIC / NO-GO”

## 19. Chỉ public URL khi toàn bộ dòng bắt buộc là OK

### Code

```text
[ ] npm run security:preflight = PASS
[ ] relevant tests = PASS
[ ] PAYMENTS_REQUIRED=false cho launch đầu
[ ] ALLOW_DEV_PAYMENT=false
[ ] ENABLE_PUBLIC_ISSUE=false
[ ] ENABLE_DEEP_HEALTH=false
[ ] STATE_BACKEND=postgres
[ ] POSTGRES_POOL_MAX=2
```

### Vercel

```text
[ ] HTTPS production URL hoạt động
[ ] Firewall /api/* rate limit đã Publish
[ ] Preview có Vercel Authentication / Standard Protection
[ ] Production env secrets là Sensitive
[ ] Production env không dùng localhost
[ ] Usage page đã kiểm tra
[ ] Nếu Pro: Spend Management bật + action Pause production được bật
```

### Neon

```text
[ ] DATABASE_URL chỉ tồn tại ở provider/Vercel env, không trong repo
[ ] Plan/cost settings đã kiểm tra
[ ] compute/autoscaling max ở mức thấp phù hợp
[ ] scale-to-zero giữ ON nếu prototype có thể chịu cold start
[ ] nếu Neon paid: billing/spending alert đã bật
```

### API

```text
[ ] /health = 200 và cheap
[ ] /api/config không leak secret
[ ] /readyz = 404 theo mặc định
[ ] invalid content-type = 415
[ ] WAF test nhỏ bắt đầu trả 429 sau rate threshold
[ ] normal wallet connect/challenge/analyze flow vẫn chạy
```

### Secrets

```text
[ ] không commit .env.vercel.generated
[ ] không commit DATABASE_URL
[ ] không commit FACILITATOR_AUTH_TOKEN
[ ] không commit FIBER_RPC_TOKEN
[ ] không commit private key
```

Nếu bất kỳ dòng bắt buộc nào chưa đạt, giữ URL ở chế độ test/không quảng bá rộng.

---

# 20. Các lệnh quan trọng

### Security preflight

```bash
npm run security:preflight
```

### Test hardened Vercel subset

```bash
npm run verify:vercel:secure
```

### Deploy

```bash
bash setup-vercel.sh
```

### Configure edge firewall

```bash
bash setup-vercel-firewall.sh
```

### Chỉ deploy/extract CKB metadata, chưa deploy Vercel

```bash
SKILLPASS_SKIP_VERCEL=1 bash setup-vercel.sh
```

### Force contract redeployment — chỉ khi contract thay đổi

```bash
SKILLPASS_FORCE_CONTRACT=1 bash setup-vercel.sh
```

---

# 21. Tài liệu chính thức nên kiểm tra lại trước mỗi public release lớn

Cloud pricing/security features có thể thay đổi. Trước release lớn, kiểm tra lại:

- Vercel WAF Rate Limiting: https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting
- Vercel Firewall CLI: https://vercel.com/changelog/manage-vercel-firewall-in-the-cli
- Vercel Spend Management: https://vercel.com/docs/spend-management
- Vercel Plans: https://vercel.com/docs/plans
- Vercel Deployment Protection: https://vercel.com/academy/optimize-your-vercel-account/deployment-protection
- Vercel Environment CLI: https://vercel.com/docs/cli/env
- Neon autoscaling: https://neon.com/blog/neon-autoscaling-is-generally-available
- Neon spending limits: https://neon.com/blog/introducing-organization-spending-limits

---

## Kết luận triển khai khuyến nghị

Đối với lần public đầu tiên:

```text
CKB Testnet
+ Vercel
+ Neon Free / conservative compute
+ PAYMENTS_REQUIRED=false
+ Fiber mock
+ Vercel WAF /api/* 30/min/IP
+ application /analyze 8/min/IP
+ POSTGRES_POOL_MAX=2
+ function maxDuration 12–15s
+ Preview Protection
+ billing/usage alerts
```

Sau khi traffic ổn định và logs sạch mới bật real FNN/Fiber payment.

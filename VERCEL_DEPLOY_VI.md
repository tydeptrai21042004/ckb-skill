# SkillPass - triển khai Vercel dễ nhất

Bản này được chuẩn bị để không cần chạy PostgreSQL, Redis, Docker, CKB node hay Node server 24/24 trên máy cá nhân.

Sau khi deploy xong:

```text
Máy của bạn có thể tắt
        |
        +--> Vercel: web + API + facilitator
        +--> Neon: PostgreSQL
        +--> CKB Testnet: capability contract
```

## Cách khuyên dùng: một script

### Yêu cầu một lần trên máy

Cần có:

- Node.js 24 LTS;
- npm;
- Rust/Cargo (`rustup`);
- Git Bash hoặc WSL nếu dùng Windows.

Không cần cài PostgreSQL, Redis, Docker hay CKB node.

### Chạy

Tại root repository:

```bash
bash setup-vercel.sh
```

Script tự thực hiện:

1. kiểm tra Node.js/Rust;
2. cài `@offckb/cli` nếu chưa có;
3. kiểm tra xem `deployments/testnet.json` đã có contract thật chưa;
4. nếu đã có thì tái sử dụng, không deploy lại;
5. nếu chưa có thì lấy địa chỉ Testnet deployer của OffCKB;
6. kiểm tra balance Testnet;
7. chỉ gọi faucet khi balance thấp;
8. build `contracts/capability-type`;
9. deploy contract lên CKB Testnet;
10. đọc chính xác `deployments/offckb-testnet/scripts.json` do OffCKB tạo;
11. tự lấy `codeHash`, `hashType`, `txHash`, `index`;
12. tạo `deployments/testnet.json`;
13. tạo `.env.vercel.generated` và random `FACILITATOR_AUTH_TOKEN`;
14. cài Vercel CLI nếu cần;
15. `vercel link` để chọn/tạo Vercel project;
16. nếu chưa có `DATABASE_URL`, chạy Neon integration installer;
17. upload biến SkillPass vào **Production only** và đánh dấu secret là Sensitive;
18. validate trực tiếp Production env bằng `vercel env run` (không pull secret xuống file local);
19. chạy static security/config preflight;
20. chạy `vercel --prod` và smoke test `/health`, `/api/config`.

Hai bước có thể hiện prompt đăng nhập/chọn account vì Vercel cần xác thực tài khoản của chính bạn:

```text
vercel link
vercel integration add neon
```

Đây không phải cấu hình database bằng tay. Neon tự provision PostgreSQL và inject `DATABASE_URL` vào Vercel project.


## Bắt buộc trước khi public URL

Sau `bash setup-vercel.sh`, **chưa nên quảng bá URL ngay**. Chạy:

```bash
npm run security:preflight
bash setup-vercel-firewall.sh
```

Sau đó làm đầy đủ checklist tại:

[`HUONG_DAN_PUBLISH_AN_TOAN_VERCEL_VI.md`](HUONG_DAN_PUBLISH_AN_TOAN_VERCEL_VI.md)

Guide này bao gồm Vercel WAF, Preview Protection, Spend Management, Neon cost guard, secret rotation, kiểm tra 429 và điều kiện trước khi bật Fiber/FNN thật.

## File script tự tạo

### `deployments/testnet.json`

Ví dụ cấu trúc:

```json
{
  "network": "testnet",
  "codeHash": "0x...",
  "hashType": "data2",
  "depTxHash": "0x...",
  "depIndex": 0
}
```

Không hard-code `data1` hay `data2`: script lấy `hashType` thực tế từ OffCKB. Với immutable deployment của OffCKB hiện tại, giá trị thường là `data2`.

### `.env.vercel.generated`

Script tự tạo các giá trị cần cho Vercel:

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

FACILITATOR_AUTH_TOKEN=<random-secret>
```

File này đã nằm trong `.gitignore` thông qua rule `.env.*`. Không commit file này.

`DATABASE_URL` không nằm trong file vì Neon/Vercel tự cung cấp.

`FACILITATOR_URL` cũng không cần nhập: service binding trong `vercel.json` tự inject URL private giữa API và facilitator.

## Chỉ muốn deploy contract và lấy ENV, chưa muốn deploy Vercel

```bash
SKILLPASS_SKIP_VERCEL=1 bash setup-vercel.sh
```

Kết quả vẫn có:

```text
deployments/testnet.json
.env.vercel.generated
```

Sau đó có thể import repo vào Vercel bằng giao diện và copy env nếu muốn.

## Đã deploy contract rồi

Chỉ cần giữ file thật:

```text
deployments/testnet.json
```

và chạy lại:

```bash
bash setup-vercel.sh
```

Script sẽ báo đang reuse contract và không gọi faucet/không tạo transaction mới.

Muốn chủ động deploy contract phiên bản mới:

```bash
SKILLPASS_FORCE_CONTRACT=1 bash setup-vercel.sh
```

## Faucet lỗi

Nếu Pudge Faucet đang hết CKB hoặc rate-limit, script dừng an toàn và in địa chỉ `ckt1...` cần fund.

Bạn có thể mở:

```text
https://faucet.nervos.org/
```

fund địa chỉ đó rồi chạy lại script. Script không làm mất deployment cũ.

Không dùng OffCKB development account cho mainnet hoặc tài sản thật.

## Kiến trúc Vercel

`vercel.json` deploy ba service trong cùng project:

```text
web (React/Vite)
       |
       | /api/*
       v
api (live-service)
       |
       | private Vercel service binding
       v
facilitator
```

Persistent state dùng:

```text
Neon PostgreSQL
STATE_BACKEND=postgres
```

Redis/Upstash không bắt buộc cho Vercel path này.

## Fiber payment thật

Bản deploy dễ nhất cố ý dùng:

```env
PAYMENTS_REQUIRED=false
FIBER_BACKEND=mock
```

Do đó máy cá nhân không cần chạy Fiber node.

Khi có remote FNN RPC chạy 24/7 ở server khác, đổi thành:

```env
PAYMENTS_REQUIRED=true
FIBER_BACKEND=fnn
FIBER_RPC_URL=https://YOUR-REMOTE-FNN-RPC
FIBER_RPC_TOKEN=...
FIBER_PAYMENT_PROOF=invoice-status
PAYMENT_AMOUNT=100000
PAYMENT_ASSET=CKB
PAYMENT_DECIMALS=8
PAYMENT_ATOMIC_UNIT=shannon
PAYMENT_PAY_TO=...
PAYMENT_CURRENCY=Fibt
PAYMENT_TIMEOUT_SECONDS=600
```

Không dùng:

```env
FIBER_RPC_URL=http://127.0.0.1:8227
```

trên Vercel vì `127.0.0.1` lúc đó là Vercel runtime, không phải máy của bạn.

## Kiểm tra sau deploy

Giả sử URL là:

```text
https://YOUR-PROJECT.vercel.app
```

mở:

```text
/health
/api/config
/.well-known/skillpass.json
```

Có thể deploy lại code sau này chỉ bằng:

```bash
vercel --prod
```

Không cần deploy contract lại nếu contract không thay đổi.

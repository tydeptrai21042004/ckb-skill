# Triển khai Vercel bằng 1 lệnh

## Windows

Cài Node.js 24 LTS, Rust (`rustup`) và Git for Windows. Mở **Git Bash** trong thư mục project.

```bash
bash setup-vercel.sh
```

Script sẽ tự:

```text
CKB Testnet account
 -> balance
 -> faucet nếu cần
 -> build contract
 -> deploy contract nếu chưa có
 -> đọc codeHash/hashType/txHash/index
 -> tạo .env.vercel.generated
 -> Vercel login/link
 -> Neon Postgres
 -> upload ENV
 -> vercel --prod
```

Nếu chỉ muốn lấy contract metadata + ENV:

```bash
SKILLPASS_SKIP_VERCEL=1 bash setup-vercel.sh
```

Sau khi website deploy xong, **không cần để máy tính chạy 24/24**.


## Trước khi chia sẻ URL public

Chạy thêm:

```bash
npm run security:preflight
bash setup-vercel-firewall.sh
```

Sau đó đọc và hoàn thành checklist:

[`HUONG_DAN_PUBLISH_AN_TOAN_VERCEL_VI.md`](HUONG_DAN_PUBLISH_AN_TOAN_VERCEL_VI.md)

Mặc định hardened giữ `PAYMENTS_REQUIRED=false`, `FIBER_BACKEND=mock`, pool Postgres = 2 và deep health tắt. Chỉ bật Fiber/FNN thật sau khi WAF + billing/usage guard đã cấu hình.

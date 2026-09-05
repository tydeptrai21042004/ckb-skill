# SkillPass v0.6 — Triển khai nhanh bằng ZIP

Tài liệu này dành cho người chỉ muốn đưa project lên chạy nhanh. **Không cần kết nối GitHub.** Giải nén ZIP, mở terminal trong thư mục project và làm theo đúng hệ điều hành.

## 1. Chuẩn bị

Cần có:

- Docker Desktop / Docker Engine có `docker compose`;
- Node.js 22+ nếu muốn chạy test/support tool;
- CKB wallet nếu triển khai testnet thật;
- Fiber node chỉ khi muốn payment thật qua FNN.

## 2. Chạy demo an toàn trước

### Windows

```powershell
deploy.cmd demo
```

### Linux / macOS / WSL

```bash
chmod +x deploy.sh
./deploy.sh demo
```

Mở `http://127.0.0.1:8787`. Demo dùng dữ liệu/mock payment, **không phải tiền thật**.

## 3. Tạo cấu hình testnet

### Windows

```powershell
deploy.cmd init-testnet
```

### Linux / macOS / WSL

```bash
./deploy.sh init-testnet
```

Sau đó mở `.env.testnet` và điền metadata contract thật. Không commit/gửi file này nếu chứa secret.

## 4. Kiểm tra trước khi chạy

```powershell
# Windows
deploy.cmd doctor
```

```bash
# Linux/macOS/WSL
./deploy.sh doctor
```

Chỉ tiếp tục khi không còn lỗi `[FAIL]`.

## 5. Chạy CKB testnet

```powershell
deploy.cmd testnet
```

hoặc:

```bash
./deploy.sh testnet
```

Kiểm tra:

```text
http://127.0.0.1:8787/api/status
http://127.0.0.1:8787/.well-known/skillpass.json
http://127.0.0.1:8787/api/openapi.json
```

## 6. Bật Fiber payment thật

Trong `.env.testnet` đặt `FIBER_BACKEND=fnn`, chuẩn bị FNN key/config, rồi dùng:

```powershell
deploy.cmd fiber-init C:\duong-dan\fiber-key
deploy.cmd testnet-fiber
```

hoặc:

```bash
./deploy.sh fiber-init /duong-dan/fiber-key
./deploy.sh testnet-fiber
```

Script **không tự nạp tiền, không tự mở channel và không tự ký transaction**.

## 7. Kiểm tra sau deploy

```powershell
deploy.cmd smoke testnet
deploy.cmd status testnet
```

hoặc:

```bash
./deploy.sh smoke testnet
./deploy.sh status testnet
```

## 8. Backup trước khi nâng cấp

```powershell
deploy.cmd backup-state testnet
```

hoặc:

```bash
./deploy.sh backup-state testnet
```

Backup này là state của SkillPass/facilitator. Với Fiber channel database, phải backup/restore theo đúng tài liệu phiên bản Fiber đang dùng.

## 9. Khi có lỗi

```bash
npm run support
```

Sau đó đọc `XU_LY_LOI_VI.md`. Bundle hỗ trợ được thiết kế để không ghi secret values.

## 10. Trước production

- dùng HTTPS/reverse proxy;
- không public FNN RPC/facilitator nếu không cần;
- để `ENABLE_PUBLIC_ISSUE=false` nếu không muốn ai cũng tạo capability;
- dùng metadata contract thật;
- test flow issue → use → 402/payment → transfer → old owner denied → new owner works;
- backup trước mọi nâng cấp Fiber/CKB.

Chi tiết đầy đủ: `HUONG_DAN_TRIEN_KHAI.md`.

# Thay đổi chính trong SkillPass v0.6

Tài liệu này tóm tắt những thay đổi từ bản v0.5 đã harden trước đó sang v0.6.

## 1. Dễ triển khai hơn

### Windows

Bổ sung:

```text
deploy.cmd
deploy.ps1
```

Các lệnh chính dùng giống Linux:

```bat
deploy.cmd demo
deploy.cmd init-testnet
deploy.cmd doctor
deploy.cmd testnet
deploy.cmd testnet-fiber
deploy.cmd smoke testnet
deploy.cmd backup-state testnet
deploy.cmd stop testnet
```

Không còn cần WSL/Bash chỉ để chạy deployment helper trên Windows.

### Linux/macOS/WSL

Giữ nguyên:

```bash
./deploy.sh ...
```

---

## 2. Web UI dễ vận hành hơn

Bổ sung panel **Deployment health** hiển thị:

- CKB RPC sẵn sàng hay không;
- Fiber/facilitator sẵn sàng hay không;
- CKB tip hiện tại;
- refresh thủ công.

API mới:

```text
GET /api/status
```

Endpoint này chỉ trả thông tin readiness đã lọc, không trả secret.

---

## 3. Trải nghiệm nhập dữ liệu tốt hơn

- Draft của paper analyzer được lưu vào `localStorage` của browser.
- UI đọc giới hạn input từ `/api/config`.
- Có counter số ký tự.
- Không cho submit khi input rỗng hoặc vượt giới hạn.

---

## 4. Payment UX tốt hơn

Khi HTTP 402 xuất hiện, UI có thể:

- copy Fiber invoice;
- copy payment hash;
- retry sau khi thanh toán;
- nhập preimage nếu deployment yêu cầu;
- dismiss invoice panel nếu chưa muốn tiếp tục.

Payment quote vẫn bind với requester + capability + request body để chống dùng payment cho nội dung khác.

---

## 5. Readiness chính xác hơn

Trước đây readiness có thể throw chung khi dependency lỗi.

v0.6 trả report rõ ràng hơn:

```json
{
  "ok": false,
  "dependencies": {
    "ckb": { "ok": false },
    "facilitator": { "ok": true }
  }
}
```

`/readyz` trả HTTP 503 nếu dependency bắt buộc chưa sẵn sàng.

Điều này giúp Docker health check và reverse proxy phát hiện lỗi chính xác hơn.

---

## 6. Backup app state

Lệnh mới:

```bash
./deploy.sh backup-state testnet
```

hoặc Windows:

```bat
deploy.cmd backup-state testnet
```

Backup chứa application state cần cho replay/settlement/recovery nhưng loại trừ:

- `.env.testnet`;
- private key;
- Fiber channel/node storage.

---

## 7. Support bundle an toàn hơn khi gửi lỗi

Lệnh:

```bash
npm run support
```

Sinh:

```text
.runtime/support-bundle.json
```

Bundle chỉ ghi trạng thái cấu hình và runtime, không ghi giá trị secret/token/private key.

---

## 8. Release ZIP sạch hơn

Release packager hiện:

- giữ `.env.example`, `.env.testnet.example`, `.env.live.example`;
- loại `.env`, `.env.testnet`, `.env.live`;
- loại `.runtime/`;
- loại `backups/`;
- loại generated `deployments/testnet.json` và `deployments/devnet.json`;
- loại `node_modules`, build output và `*.tsbuildinfo`.

Điều này giảm nguy cơ phát hành nhầm secret/runtime state và vẫn giữ đủ template để triển khai từ ZIP sạch.

---

## 9. Tài liệu tiếng Việt mới

- `HUONG_DAN_TRIEN_KHAI.md`
- `HUONG_DAN_SU_DUNG.md`
- `KIEN_TRUC_VA_BAO_MAT_VI.md`
- `XU_LY_LOI_VI.md`
- `docs/CONG_DONG_CKB_FIBER_VI.md`

---

## 10. Test mới

Bổ sung regression tests kiểm tra:

- file deployment đa nền tảng có tồn tại;
- tài liệu tiếng Việt có trong handoff;
- release packager không loại nhầm env template;
- release packager loại runtime/generated deployment files;
- support bundle không serialize secret values.

Kết quả hiện tại của dependency-free suite:

```text
50/50 tests passed
```

Ngoài ra các smoke flow vẫn pass:

```text
npm run smoke:http
npm run smoke:fiber
npm run smoke:paid
npm run verify:deploy
```

## 11. Tích hợp AI agent / tool

- Thêm `GET /.well-known/skillpass.json` để công bố metadata capability/auth/payment có cấu trúc.
- Thêm `GET /api/openapi.json` để tool/agent đọc contract API thay vì scrape UI.
- Không công bố private key, seed phrase hoặc facilitator bearer token.
- Deployment smoke trên Windows và Linux kiểm tra luôn hai endpoint discovery này.

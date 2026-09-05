# Hướng dẫn triển khai SkillPass bằng tiếng Việt

> Tài liệu này dành cho bản ZIP/thư mục local. **Không cần kết nối GitHub, không cần clone repo, không cần push code.**

SkillPass gồm ba phần chính:

1. **Web + live service**: kết nối ví CKB qua CCC, kiểm tra Capability Cell hiện còn live và đúng chủ sở hữu, sau đó mới cho dùng dịch vụ.
2. **x402/Fiber facilitator**: tạo invoice Fiber, kiểm tra trạng thái thanh toán và chống dùng lại payment.
3. **Fiber node (FNN)**: tùy chọn. Có thể dùng FNN đang chạy sẵn hoặc chạy container Fiber đi kèm profile testnet-fiber.

Bản hiện tại ưu tiên **CKB testnet**. Không nên chuyển sang mainnet trước khi contract, flow thanh toán, backup và vận hành được audit đầy đủ.

---

## 1. Cách nhanh nhất: chạy demo local

### Windows

Yêu cầu:

- Docker Desktop đang chạy.
- Docker Compose v2 có sẵn trong Docker Desktop.

Mở **Command Prompt** hoặc **PowerShell** tại thư mục dự án:

```bat
deploy.cmd demo
```

Hoặc trực tiếp bằng PowerShell:

```powershell
.\deploy.ps1 demo
```

Sau khi script báo `Ready`, mở:

```text
http://127.0.0.1:8787
```

Kiểm tra trạng thái:

```bat
deploy.cmd status demo
deploy.cmd smoke demo
```

Xem log:

```bat
deploy.cmd logs demo
```

Dừng:

```bat
deploy.cmd stop demo
```

### Linux / macOS / WSL

```bash
chmod +x deploy.sh
./deploy.sh demo
```

Sau đó mở:

```text
http://127.0.0.1:8787
```

Kiểm tra và dừng:

```bash
./deploy.sh status demo
./deploy.sh smoke demo
./deploy.sh stop demo
```

### Demo local làm gì?

Demo dùng dữ liệu mô phỏng để bạn kiểm tra toàn bộ UX nhanh mà **không cần ví thật, không cần testnet CKB và không cần Fiber thật**.

Demo chỉ dùng để phát triển/giới thiệu. Không dùng kết quả thanh toán mock làm bằng chứng thanh toán thật.

---

## 2. Chuẩn bị triển khai CKB testnet

### Windows

```bat
deploy.cmd init-testnet
```

### Linux / macOS / WSL

```bash
./deploy.sh init-testnet
```

Lệnh này sẽ:

- tạo `.env.testnet` từ `.env.testnet.example` nếu chưa có;
- sinh `FACILITATOR_AUTH_TOKEN` ngẫu nhiên;
- giữ nguyên file `.env.testnet` cũ nếu đã tồn tại;
- đọc `deployments/testnet.json` và tự điền metadata contract nếu file đã có giá trị thật.

**Không chia sẻ `.env.testnet`.** File này có secret dùng giữa SkillPass và facilitator.

---

## 3. Deploy Capability Type Script lên CKB testnet

Contract nằm tại:

```text
contracts/capability-type/
```

Kiểm tra contract trước:

```bash
npm run verify:contract
```

Nếu máy chưa có Rust/RISC-V toolchain, có thể dùng quy trình Docker đã có trong project:

```bash
npm run verify:contract:docker
```

Việc gửi transaction deploy contract **không được tự động hóa âm thầm** vì transaction này dùng CKB của operator và cần ký chủ động.

Sau khi deploy thật trên testnet, lấy bốn giá trị:

```text
CAPABILITY_CODE_HASH
CAPABILITY_HASH_TYPE
CAPABILITY_DEP_TX_HASH
CAPABILITY_DEP_INDEX
```

Bạn có hai cách lưu:

### Cách A — điền vào `deployments/testnet.json`

```json
{
  "network": "testnet",
  "codeHash": "0x...",
  "hashType": "data1",
  "depTxHash": "0x...",
  "depIndex": 0
}
```

Sau đó chạy lại:

```bash
./deploy.sh init-testnet
```

hoặc Windows:

```bat
deploy.cmd init-testnet
```

### Cách B — sửa trực tiếp `.env.testnet`

```dotenv
CAPABILITY_CODE_HASH=0x...
CAPABILITY_HASH_TYPE=data1
CAPABILITY_DEP_TX_HASH=0x...
CAPABILITY_DEP_INDEX=0
```

---

## 4. Chọn chế độ thanh toán

### Chế độ 1 — staging, dễ test nhất

Trong `.env.testnet`:

```dotenv
PAYMENTS_REQUIRED=true
FIBER_BACKEND=mock
FIBER_NETWORK=testnet
FIBER_PAYMENT_PROOF=invoice-status
```

CKB ownership vẫn là testnet thật, nhưng thanh toán Fiber là mock. Dùng chế độ này để kiểm tra ứng dụng trước khi nối FNN thật.

### Chế độ 2 — dùng FNN đang chạy sẵn

```dotenv
PAYMENTS_REQUIRED=true
FIBER_BACKEND=fnn
FIBER_NETWORK=testnet
FIBER_RPC_URL=http://host.docker.internal:8227
FIBER_RPC_TOKEN=
FIBER_PAYMENT_PROOF=invoice-status
```

Nếu FNN nằm trên máy khác, thay `FIBER_RPC_URL` bằng endpoint private/trusted phù hợp.

**Không mở FNN RPC trực tiếp ra Internet công cộng.** Browser chỉ cần nói chuyện với SkillPass; SkillPass/facilitator mới nói chuyện với FNN.

### Chế độ 3 — chạy Fiber container cùng SkillPass

Đầu tiên chuẩn bị private key mà bạn **chủ động chọn** cho node Fiber.

Windows:

```powershell
.\deploy.ps1 fiber-init C:\secure\path\to\ckb-private-key
```

Linux/macOS/WSL:

```bash
./deploy.sh fiber-init /secure/path/to/ckb-private-key
```

Lệnh này:

- kéo image `nervos/fiber:0.9.0` mặc định;
- copy key vào `.runtime/fiber-node/ckb/key`;
- tạo config testnet Fiber;
- cấu hình RPC để facilitator trong private Docker network truy cập được;
- sinh password local nếu chưa có;
- chuyển `FIBER_BACKEND=fnn`.

Lệnh **không**:

- tạo tiền;
- chuyển CKB;
- mở channel;
- tự ký transaction;
- tự chi tiêu tài sản.

Funding/channels phải do operator quản lý rõ ràng bằng tooling chính thức của Fiber.

---

## 5. Chọn cách chứng minh payment

### Khuyến nghị cho tương thích hiện tại

```dotenv
FIBER_PAYMENT_PROOF=invoice-status
```

Facilitator hỏi FNN phía receiver xem invoice đã được thanh toán chưa.

### Chế độ mạnh hơn, tùy chọn

```dotenv
FIBER_PAYMENT_PROOF=preimage
```

Client phải gửi thêm payment preimage 32 byte:

```text
0x + 64 ký tự hex
```

Facilitator kiểm tra preimage khớp payment hash rồi mới tiếp tục kiểm tra paid status.

Chỉ bật khi tool thanh toán Fiber bạn dùng thực sự trả được preimage một cách an toàn.

---

## 6. Kiểm tra cấu hình trước khi chạy

### Windows

```bat
deploy.cmd doctor
```

### Linux/macOS/WSL

```bash
./deploy.sh doctor
```

Không deploy khi còn dòng `[FAIL]`.

Doctor kiểm tra ít nhất:

- code hash và dep transaction của Capability Script;
- `FACILITATOR_AUTH_TOKEN`;
- payment amount và timeout;
- TTL receipt;
- backend Fiber;
- URL RPC;
- network testnet;
- payment proof mode;
- public URL và proxy mode.

---

## 7. Khởi động testnet

### Testnet với mock hoặc FNN bên ngoài

Windows:

```bat
deploy.cmd testnet
```

Linux/macOS/WSL:

```bash
./deploy.sh testnet
```

### Testnet + Fiber container self-hosted

Windows:

```bat
deploy.cmd testnet-fiber
```

Linux/macOS/WSL:

```bash
./deploy.sh testnet-fiber
```

Script sẽ:

1. chạy doctor;
2. build image;
3. khởi động containers;
4. chờ health check;
5. chạy HTTP smoke test;
6. chỉ báo `Ready` khi service đáp ứng được.

---

## 8. Kiểm tra sau khi deploy

Các endpoint hữu ích:

```text
GET /livez
GET /readyz
GET /health
GET /api/config
GET /api/status
```

`/api/status` trả trạng thái đã lọc, không trả secret. Web UI cũng hiển thị:

- CKB ready/unavailable;
- Fiber ready/unavailable/not required;
- CKB tip hiện tại;
- nút refresh health.

Lệnh kiểm tra:

```bash
./deploy.sh status testnet
./deploy.sh smoke testnet
./deploy.sh logs testnet skillpass
./deploy.sh logs testnet facilitator
```

Windows dùng cùng cú pháp qua `deploy.cmd`:

```bat
deploy.cmd status testnet
deploy.cmd smoke testnet
deploy.cmd logs testnet skillpass
```

---

## 9. Backup state của ứng dụng

Trước khi nâng cấp app hoặc xóa Docker volume:

### Windows

```bat
deploy.cmd backup-state testnet
```

### Linux/macOS/WSL

```bash
./deploy.sh backup-state testnet
```

File sẽ được ghi vào:

```text
backups/<UTC timestamp>/
```

Backup này chứa state của:

- facilitator replay/settlement;
- SkillPass quote/delivery receipt.

Backup **không chứa**:

- `.env.testnet`;
- private key;
- Fiber node/channel storage.

Đối với Fiber channel/node state, dùng quy trình backup/restore chính thức của phiên bản Fiber bạn đang vận hành. Không copy nóng channel database tùy ý.

---

## 10. Public deployment qua VPS + HTTPS

Mô hình khuyến nghị:

```text
Internet
   |
 HTTPS :443
   |
Nginx / Caddy / reverse proxy
   |
127.0.0.1:8787
   |
SkillPass
   |
private Docker network
   +--> facilitator
          |
          +--> FNN
   |
   +--> CKB testnet RPC
```

`.env.testnet`:

```dotenv
SKILLPASS_BIND=127.0.0.1
SKILLPASS_PORT=8787
PUBLIC_BASE_URL=https://skillpass.example.com
TRUST_PROXY=true
```

Chỉ dùng `TRUST_PROXY=true` khi reverse proxy do bạn kiểm soát và proxy ghi đè forwarded headers.

Không publish cổng facilitator/FNN RPC ra Internet nếu không có lý do vận hành rất rõ ràng.

---

## 11. Nâng cấp an toàn

Trước khi nâng cấp:

```bash
npm test
npm run support
./deploy.sh doctor
./deploy.sh smoke testnet
./deploy.sh backup-state testnet
```

Đối với Fiber:

1. đọc release notes/migration notes của phiên bản mới;
2. backup theo hướng dẫn chính thức;
3. không giả định database/channel format luôn tương thích giữa các bản;
4. thử trên testnet trước.

Project mặc định pin Fiber `0.9.0` để deployment có tính lặp lại. Chỉ đổi `FIBER_VERSION` sau khi đã kiểm tra release mới.

---

## 12. Lệnh thường dùng

| Mục đích | Windows | Linux/macOS/WSL |
|---|---|---|
| Demo local | `deploy.cmd demo` | `./deploy.sh demo` |
| Tạo config testnet | `deploy.cmd init-testnet` | `./deploy.sh init-testnet` |
| Kiểm tra config | `deploy.cmd doctor` | `./deploy.sh doctor` |
| Chạy testnet | `deploy.cmd testnet` | `./deploy.sh testnet` |
| Chạy testnet + Fiber | `deploy.cmd testnet-fiber` | `./deploy.sh testnet-fiber` |
| Kiểm tra HTTP | `deploy.cmd smoke testnet` | `./deploy.sh smoke testnet` |
| Xem trạng thái | `deploy.cmd status testnet` | `./deploy.sh status testnet` |
| Xem log SkillPass | `deploy.cmd logs testnet skillpass` | `./deploy.sh logs testnet skillpass` |
| Backup app state | `deploy.cmd backup-state testnet` | `./deploy.sh backup-state testnet` |
| Dừng | `deploy.cmd stop testnet` | `./deploy.sh stop testnet` |
| Tạo support bundle | `npm run support` | `npm run support` |

---

## 13. Checklist trước khi đưa cho người dùng thật

- [ ] Contract test đã pass.
- [ ] `deployments/testnet.json` là metadata thật.
- [ ] `deploy doctor` không còn `[FAIL]`.
- [ ] `FIBER_BACKEND=fnn` nếu muốn payment thật.
- [ ] `ENABLE_PUBLIC_ISSUE=false` trừ khi thật sự muốn ai cũng issue pass.
- [ ] HTTPS đã bật.
- [ ] FNN/facilitator không mở công khai không cần thiết.
- [ ] Đã backup state.
- [ ] Wallet private key của user không nằm trong server.
- [ ] Đã thử flow issue → discover → use → pay → transfer → old owner fail → new owner success.
- [ ] Đã kiểm tra restart giữa payment và response.

---


## 14. Kiểm tra API cho AI agent / tool tích hợp

Sau khi live service đã chạy, hai endpoint public, chỉ đọc sau giúp tool khác tự khám phá SkillPass:

```text
GET /.well-known/skillpass.json
GET /api/openapi.json
```

Kiểm tra nhanh:

```bash
curl http://127.0.0.1:8787/.well-known/skillpass.json
curl http://127.0.0.1:8787/api/openapi.json
```

PowerShell:

```powershell
Invoke-RestMethod http://127.0.0.1:8787/.well-known/skillpass.json
Invoke-RestMethod http://127.0.0.1:8787/api/openapi.json
```

`skillpass.json` cho biết service ID, Capability Type Script, cách challenge/signature hoạt động, giới hạn input, tình trạng payment và endpoint OpenAPI. Nó **không** chứa private key, seed phrase, facilitator token hoặc secret trong `.env`.

Điểm quan trọng: agent có thể **khám phá và chuẩn bị request**, nhưng transaction CKB vẫn phải được wallet/người dùng ký theo ranh giới bảo mật của project.

---

## 15. Tài liệu liên quan

- `TRIEN_KHAI_NHANH_VI.md` — bản triển khai nhanh từ ZIP.
- `HUONG_DAN_SU_DUNG.md` — cách dùng app cho operator/người dùng.
- `XU_LY_LOI_VI.md` — lỗi thường gặp và cách xử lý.
- `KIEN_TRUC_VA_BAO_MAT_VI.md` — kiến trúc và ranh giới bảo mật.
- `DEPLOY_STEP_BY_STEP.md` — bản triển khai tiếng Anh chi tiết.
- `SECURITY.md` — security notes.
- `VALIDATION.md` — những gì đã/ chưa được kiểm thử.
- `docs/community-research-2026.md` — nghiên cứu hệ sinh thái CKB/Fiber.

## 16. Nguồn upstream nên theo dõi

- CKB releases: https://github.com/nervosnetwork/ckb/releases
- Fiber: https://github.com/nervosnetwork/fiber
- Fiber dev logs: https://github.com/nervosnetwork/fiber/discussions/categories/dev-log

Tại thời điểm tài liệu này được cập nhật, CKB `0.209.0` là bản release hiện hành được project dùng làm mốc tương thích, và Fiber `0.9.0` đã được phát hành với trọng tâm lớn về migration, backup/restore và reliability. Luôn kiểm tra release notes mới trước khi nâng cấp production.

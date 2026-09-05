# Kiến trúc và bảo mật SkillPass

## 1. Mô hình tin cậy

SkillPass tách ba loại bằng chứng:

```text
Wallet signature   -> chứng minh người gọi kiểm soát identity hiện tại
CKB live Cell      -> chứng minh quyền sử dụng dịch vụ hiện tại
Fiber payment      -> chứng minh điều kiện thanh toán của request đã hoàn tất
```

Một lớp không thay thế lớp khác.

---

## 2. Flow authorization

```text
Browser
  |
  | 1. request challenge
  v
SkillPass live service
  |
  | 2. one-time nonce + message
  v
Wallet signs locally
  |
  | 3. signature + outPoint
  v
SkillPass
  |
  +--> CKB RPC: cell còn live?
  +--> đúng Type Script deployment?
  +--> đúng serviceId?
  +--> chưa expired?
  +--> lock script thuộc requester?
```

Nonce là one-time và có TTL để giảm replay của chữ ký.

---

## 3. Flow payment

Khi `PAYMENTS_REQUIRED=true`:

```text
request
  -> validate input + kiểm tra owner sơ bộ
  -> tạo Fiber invoice
  -> HTTP 402 + PAYMENT-REQUIRED
  -> payer thanh toán
  -> retry + PAYMENT-SIGNATURE
  -> facilitator verify payment
  -> verify wallet challenge
  -> kiểm tra live CKB Cell lần nữa
  -> tính protected result
  -> settle payment
  -> lưu delivery receipt
  -> trả result + PAYMENT-RESPONSE
```

Việc kiểm tra ownership lần hai xử lý race khi capability được transfer sau lúc invoice đã được tạo.

---

## 4. Chống replay payment

Facilitator có replay/settlement store persistent.

Mục tiêu:

- một payment không được dùng cho request khác;
- quote được bind với address + outPoint + nội dung request + serviceId;
- settlement idempotent để recovery sau crash;
- delivery receipt cho phép trả lại cùng result khi response trước bị mất sau settlement.

Receipt có TTL và tự prune để state không tăng vô hạn.

---

## 5. Secret và private key

### User wallet

Server không được có private key của user.

Wallet ký transaction/message ở phía client.

### Facilitator token

`FACILITATOR_AUTH_TOKEN` là shared secret giữa live service và facilitator.

Nó nằm trong `.env.testnet`, không được commit/chia sẻ.

### Fiber operator key

Nếu self-host Fiber, operator tự đưa key vào:

```text
.runtime/fiber-node/ckb/key
```

Đây là key của node/operator, không phải key wallet của người dùng SkillPass.

---

## 6. Network exposure

Khuyến nghị production:

```text
Public: 443 HTTPS reverse proxy
Private: SkillPass :8787
Private Docker network: facilitator :8790
Private/internal: FNN RPC :8227
Public Fiber P2P nếu cần: :8228
```

Không public facilitator/FNN RPC chỉ để web truy cập. Browser không cần nói trực tiếp với hai thành phần đó.

---

## 7. Docker hardening đã áp dụng

Các service app dùng:

- non-root user;
- read-only root filesystem;
- `no-new-privileges`;
- drop Linux capabilities;
- writable state qua volume riêng;
- tmpfs cho `/tmp`;
- health check;
- restart policy.

Đây là hardening cơ bản, không thay thế security review.

---

## 8. Giới hạn hiện tại

### Single-process state

JSON state hiện phù hợp MVP/single replica.

Nếu chạy nhiều replica, phải chuyển nonce/replay/quote/receipt sang shared store có atomicity, ví dụ database/Redis với unique constraints/compare-and-set phù hợp.

### Testnet only

Live service hiện cố ý khóa `FIBER_NETWORK=testnet` và CKB public testnet client để giảm nguy cơ vô tình chạy mainnet.

### Contract audit

Capability Type Script cần audit độc lập trước production/mainnet.

### Fiber lifecycle

Fiber đang phát triển nhanh. Trước upgrade node phải đọc release/migration/backup notes chính thức.

---

## 9. Nguyên tắc production

1. Không để secret trong frontend.
2. Không dùng `FIBER_BACKEND=mock` làm payment thật.
3. Không bật public issuance nếu business không yêu cầu.
4. Không tin address do client gửi nếu signature/challenge chưa verify.
5. Không tin Cell đã cache; kiểm tra live Cell ở thời điểm sử dụng.
6. Không settle payment trước khi resource có thể được tạo thành công.
7. Không xóa state volume trước khi backup.
8. Không upgrade Fiber channel storage tùy tiện.
9. Không mở RPC quản trị ra Internet công cộng.
10. Luôn test flow transfer/replay/restart trên testnet trước release.

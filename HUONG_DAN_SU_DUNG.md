# Hướng dẫn sử dụng SkillPass

## SkillPass dùng để làm gì?

SkillPass biến **quyền truy cập dịch vụ** thành một Capability Cell trên CKB.

Điểm chính:

- quyền truy cập không nằm trong một dòng `owner_id` của database trung tâm;
- server đọc trạng thái CKB live hiện tại để xác định ai đang sở hữu capability;
- capability có thể chuyển sang ví khác nếu flag cho phép transfer;
- chủ cũ mất quyền sau khi Cell cũ bị consume;
- chủ mới nhận quyền thông qua Cell mới;
- payment Fiber có thể được yêu cầu thêm trước khi chạy dịch vụ;
- private key người dùng vẫn ở wallet, không được gửi cho SkillPass server.

---

## 1. Kết nối ví

1. Mở web SkillPass.
2. Chọn **Connect wallet**.
3. Chọn wallet tương thích CCC/CKB testnet.
4. Xác nhận đang ở **CKB testnet**.

Sau khi kết nối, web tự tìm Capability Cell đang thuộc ví hiện tại.

---

## 2. Kiểm tra trạng thái hệ thống

Phần **Deployment health** hiển thị:

- **CKB Ready**: server truy cập được CKB RPC.
- **Fiber Ready**: facilitator/payment backend sẵn sàng.
- **Fiber Not required**: deployment không bật payment.
- **Tip**: CKB tip server nhìn thấy.

Nếu một dependency báo `Unavailable`, không nên gửi transaction/payment cho đến khi operator xử lý.

---

## 3. Issue capability

Chỉ có khi operator bật:

```dotenv
ENABLE_PUBLIC_ISSUE=true
```

Flow:

1. chọn số ngày hiệu lực;
2. nhấn **Issue transferable pass**;
3. wallet hiển thị transaction;
4. người dùng tự xem và ký;
5. sau khi transaction confirm, capability xuất hiện trong danh sách.

Trong production thông thường nên để:

```dotenv
ENABLE_PUBLIC_ISSUE=false
```

và để provider phát hành pass theo business logic riêng.

---

## 4. Dùng dịch vụ

1. Chọn capability còn `ACTIVE`.
2. Nhập text cần phân tích.
3. Draft được lưu trong `localStorage` của chính browser để tránh mất nội dung khi reload.
4. Giới hạn hiện tại là 20.000 ký tự hoặc giá trị server trả trong `/api/config`.
5. Nhấn **Use paper-analyzer-v1** hoặc **Request paid analysis**.

Server sẽ tạo challenge một lần và wallet ký message. Sau đó server kiểm tra lại live Cell.

---

## 5. Khi payment được bật

Nếu endpoint trả HTTP `402 Payment Required`, web hiển thị:

- amount;
- asset;
- Fiber invoice;
- payment hash;
- trường payment preimage nếu deployment dùng `preimage` mode.

Bạn có thể:

- **Copy invoice**;
- **Copy payment hash**;
- thanh toán bằng tool/wallet Fiber phù hợp;
- nhấn **I paid — retry request**.

Khi retry, SkillPass lấy **challenge mới** để tránh challenge cũ hết hạn trong lúc người dùng thanh toán.

Nếu đóng panel bằng **Dismiss**, invoice chưa thanh toán sẽ tự hết hạn theo thời gian invoice. Dismiss không phải thao tác refund/cancel trên Fiber.

---

## 6. Transfer capability

1. Nhập địa chỉ `ckt1...` của người nhận.
2. Nhấn **Transfer**.
3. Kiểm tra transaction trong wallet.
4. Ký transaction.
5. Chờ confirm.

Sau transfer:

- Cell cũ của chủ cũ bị consume;
- Cell mới được tạo với lock của người nhận;
- server kiểm tra live state nên chủ cũ không còn quyền dùng capability đó.

---

## 7. Những điều SkillPass không làm

SkillPass không:

- lấy seed phrase;
- giữ private key wallet người dùng;
- tự ký transaction CKB thay user;
- tự chuyển CKB;
- tự mở Fiber channel bằng tài sản của user;
- dùng payment một mình để thay thế capability ownership.

Payment và authorization là **hai lớp khác nhau**:

```text
Có payment nhưng không sở hữu Capability Cell -> từ chối.
Có Capability Cell nhưng payment bắt buộc chưa hoàn tất -> HTTP 402.
Có cả hai và challenge/signature hợp lệ -> cho dùng dịch vụ.
```

---

## 8. Khi cần gửi lỗi cho developer/community

Chạy:

```bash
npm run support
```

File được tạo:

```text
.runtime/support-bundle.json
```

Bundle chỉ chứa thông tin chẩn đoán đã lọc. Nó **không ghi secret token, private key hoặc nội dung `.env.testnet`**.

Gửi thêm:

- lỗi hiển thị trên UI;
- thời điểm lỗi;
- transaction hash nếu lỗi liên quan CKB;
- payment hash nếu lỗi liên quan Fiber;
- log đã loại bỏ secret.
## 9. Dùng SkillPass từ AI agent hoặc tool khác

Không cần scrape giao diện web. Agent/tool nên bắt đầu bằng:

```text
GET /.well-known/skillpass.json
GET /api/openapi.json
```

Flow chuẩn:

```text
1. đọc discovery metadata
2. kiểm tra /api/status
3. POST /api/challenge với CKB address
4. yêu cầu wallet ký challenge
5. POST /api/analyze với capability outPoint + signature + nội dung
6. nếu nhận 402, đọc PAYMENT-REQUIRED và thanh toán Fiber
7. retry đúng request với PAYMENT-SIGNATURE
```

Không đưa private key vào agent/server. Agent chỉ điều phối; chữ ký CKB phải đến từ wallet/người giữ khóa. Nếu payment quote được tạo cho một request, không sửa nội dung rồi tái sử dụng invoice đó vì SkillPass bind payment vào protected request.


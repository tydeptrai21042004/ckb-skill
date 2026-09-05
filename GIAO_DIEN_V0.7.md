# Giao diện SkillPass v0.7

Bản v0.7 tập trung vào việc biến giao diện từ dạng prototype/demo thành một ứng dụng có thể đưa cho người dùng thử trực tiếp.

## Hai giao diện cần phân biệt

### 1. Local simulator — `npm run dev`

Mở `http://127.0.0.1:8787/`.

Đây là môi trường mô phỏng, không dùng ví thật và không tạo giao dịch CKB testnet. Giao diện mới có một luồng duy nhất:

1. xem capability hiện đang thuộc Alice hay Bob;
2. chọn người đang gửi request;
3. chọn `Capability only` hoặc `Fiber + capability`;
4. nhập nội dung và bấm `Run analysis`;
5. xem kết quả hoặc lý do bị từ chối;
6. chuyển capability cho người còn lại để kiểm tra quyền truy cập thay đổi theo owner.

Activity log được đưa xuống dạng phần mở rộng vì đây là thông tin kỹ thuật, không phải nội dung chính của sản phẩm.

### 2. CCC / CKB testnet frontend — `npm run dev:web`

Sau khi `npm run setup` và cấu hình live/testnet hợp lệ, chạy `npm run dev:web`. Lệnh này khởi động **cả live API ở cổng 8787 và Vite frontend ở cổng 5173**, vì frontend cần `/api/config`, `/api/status`, `/api/challenge` và `/api/analyze`.

Mở `http://127.0.0.1:5173/`. Nếu chỉ muốn chạy riêng Vite để chỉnh CSS/layout khi đã có backend riêng, dùng `npm run dev:frontend-only`. Khi build production, live service sẽ phục vụ nội dung trong `apps/web/dist`.

Luồng sử dụng:

1. kết nối ví qua CCC;
2. SkillPass tìm Capability Cell đang thuộc ví;
3. chọn pass ở thanh bên trái;
4. nhập nội dung trong một editor duy nhất;
5. ký challenge một lần bằng ví;
6. nếu cấu hình yêu cầu Fiber payment, thanh toán trong flow riêng;
7. xem kết quả phân tích ở panel Output;
8. chỉ mở `Manage this pass` khi cần chuyển ownership.

## Nguyên tắc UI của v0.7

- Không dùng giant hero/gradient/card-grid chỉ để trang nhìn “đầy”.
- Action chính chỉ có một CTA rõ ràng ở mỗi trạng thái.
- Blockchain/Fiber là hạ tầng xác minh, không chiếm toàn bộ giao diện bằng thuật ngữ kỹ thuật.
- Result phải hiển thị như dữ liệu người dùng đọc được, không `JSON.stringify(...)` vào status bar.
- Transfer capability là action phụ và được đặt trong phần quản lý pass.
- Payment là flow riêng bằng modal, không chen toàn bộ invoice vào màn hình chính.
- Private key/seed phrase không bao giờ được yêu cầu nhập vào SkillPass.
- Mobile giữ đúng thứ tự: chọn pass -> nhập nội dung -> chạy -> xem kết quả.

## File frontend chính

- `apps/demo-service/public/index.html`
- `apps/demo-service/public/styles.css`
- `apps/demo-service/public/app.js`
- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`
- `apps/web/index.html`

## Kiểm tra trước khi deploy

```bash
npm test
npm run smoke:http
npm run smoke:fiber
npm run smoke:paid
npm run build:web
```

Nếu `npm run build:web` báo thiếu dependency, chạy:

```bash
npm run setup
npm run build:web
```

`npm run setup` cần kết nối được npm registry để tải React, Vite và CCC dependencies.

## Ví được hiển thị trong CCC

Frontend v0.7 đặt network mặc định là **CKB Testnet** và lọc connector để chỉ hiện signer loại **CKB**. Lý do là flow xác thực hiện tại ký challenge bằng CKB address; hiển thị signer không tương thích rồi để user gặp lỗi sau khi connect là UX không tốt.

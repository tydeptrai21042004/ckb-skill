# Xử lý lỗi SkillPass

## 1. `CAPABILITY_CODE_HASH` hoặc `CAPABILITY_DEP_TX_HASH` bị FAIL

Nguyên nhân: `.env.testnet` vẫn dùng placeholder.

Kiểm tra:

```text
deployments/testnet.json
.env.testnet
```

Giá trị đúng phải có dạng:

```text
0x + 64 ký tự hex
```

Sau khi sửa, chạy lại:

```bash
./deploy.sh doctor
```

Windows:

```bat
deploy.cmd doctor
```

---

## 2. Web mở được nhưng `Deployment health` báo CKB Unavailable

Kiểm tra:

```bash
./deploy.sh logs testnet skillpass
```

Các nguyên nhân thường gặp:

- `CKB_RPC_URL` sai;
- RPC đang down;
- container không ra Internet/private RPC được;
- DNS/proxy/firewall chặn RPC.

Nếu `CKB_RPC_URL=` để trống, app dùng public-testnet default của CCC.

---

## 3. Fiber Unavailable

Kiểm tra facilitator:

```bash
./deploy.sh logs testnet facilitator
```

Nếu self-hosted Fiber:

```bash
./deploy.sh status testnet-fiber
```

và:

```bash
docker compose --env-file .env.testnet -f deploy/compose.testnet.yaml -f deploy/compose.fiber.yaml exec fiber fnn-cli info
```

Kiểm tra:

- `FIBER_BACKEND=fnn`;
- `FIBER_RPC_URL`;
- Fiber container có healthy không;
- key/config đúng không;
- node có network/channel/liquidity cần thiết hay không.

---

## 4. Thanh toán xong nhưng retry vẫn 402

Kiểm tra:

1. payment hash trên UI có đúng invoice đã trả không;
2. invoice đã thực sự settled/paid chưa;
3. `FIBER_PAYMENT_PROOF` đang là gì;
4. nếu là `preimage`, preimage phải đúng dạng `0x` + 64 hex;
5. invoice có hết hạn không;
6. request body có thay đổi sau khi invoice được tạo không.

SkillPass bind quote với request. Nếu đổi text, outPoint hoặc requester sau khi lấy invoice, payment cũ không được dùng cho request mới.

---

## 5. `PAYMENT_REQUEST_BINDING_MISMATCH`

Bạn đã retry payment cho request khác với request ban đầu.

Cách xử lý:

- dismiss payment cũ;
- gửi lại request mới;
- nhận invoice mới;
- thanh toán invoice mới.

Đây là behavior bảo mật, không phải bug.

---

## 6. `CELL_NOT_LIVE`

Capability Cell đã bị consume, thường do:

- capability đã transfer;
- transaction khác đã dùng Cell;
- outPoint cũ được cache ở client.

Nhấn **Refresh** để discover lại live Cell.

---

## 7. `NOT_OWNER`

Wallet hiện tại không sở hữu live Capability Cell.

Nếu vừa transfer, đây là behavior đúng: chủ cũ phải mất quyền ngay khi Cell mới confirm.

---

## 8. `challenge expired` / `REPLAY`

Challenge là one-time và TTL ngắn.

Web hiện tự xin challenge mới khi retry sau payment. Nếu gọi API thủ công, phải xin challenge mới cho mỗi lần xác thực.

---

## 9. Docker build không tải được npm package

Đây thường là lỗi mạng/registry chứ không phải source code.

Kiểm tra:

```bash
npm ping
```

hoặc thử lại khi network ổn định.

Không nên tắt integrity/security để "ép" install qua lỗi registry.

---

## 10. Port 8787 đã được dùng

Sửa `.env.testnet`:

```dotenv
SKILLPASS_PORT=8788
PUBLIC_BASE_URL=http://127.0.0.1:8788
```

Sau đó restart stack.

Demo có thể dùng biến môi trường port trước khi chạy nếu cần.

---

## 11. Muốn gửi log cho người khác nhưng sợ lộ secret

Chạy:

```bash
npm run support
```

Dùng `.runtime/support-bundle.json` làm thông tin đầu tiên để gửi.

Không gửi nguyên `.env.testnet`, private key hoặc token.

---

## 12. Sau restart, payment có bị mất không?

Testnet Compose persist:

- facilitator settlement/replay state;
- SkillPass quotes;
- delivery receipts.

Vì vậy restart app không mặc định làm mất toàn bộ payment state.

Trước thao tác xóa volume/move host:

```bash
./deploy.sh backup-state testnet
```

---

## 13. Không biết lỗi nằm ở đâu

Chạy theo thứ tự:

```bash
npm test
npm run support
./deploy.sh doctor
./deploy.sh status testnet
./deploy.sh smoke testnet
./deploy.sh logs testnet skillpass
./deploy.sh logs testnet facilitator
```

Sau đó kiểm tra `/api/status` trên browser/server.

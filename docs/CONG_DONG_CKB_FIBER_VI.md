# Ghi chú hệ sinh thái CKB/Fiber cho hướng phát triển SkillPass

## Hướng phù hợp nhất với project

SkillPass nên giữ kiến trúc hai lớp:

```text
CKB Capability Cell = quyền dài hạn / quyền sở hữu có thể chuyển giao
Fiber + x402        = payment nhanh theo request / theo lần dùng
```

Điểm này phù hợp với hướng phát triển hiện tại của Fiber quanh agent payments, x402, browser/provider integration và reliability.

## Tại sao không biến payment thành quyền truy cập duy nhất?

Vì payment trả lời câu hỏi:

> Request này đã trả tiền chưa?

Trong khi Capability Cell trả lời:

> Ai đang sở hữu quyền dùng service này ngay lúc này?

Hai câu hỏi khác nhau. Việc giữ hai lớp làm SkillPass có giá trị riêng so với một API chỉ thêm HTTP 402.

## Các hướng nên phát triển tiếp

### 1. Agent-to-agent service marketplace

Một agent có thể sở hữu Capability Cell để gọi một service, đồng thời trả micropayment Fiber theo request.

### 2. Delegated/attenuated capability

Nghiên cứu child capability hoặc delegation policy để owner cấp quyền hạn chế cho agent phụ mà không transfer toàn bộ pass.

### 3. Usage policy on-chain + metering off-chain

Cell giữ service identity/expiry/policy root; server/Fiber xử lý usage accounting nhanh hơn.

### 4. Multi-asset payment

Fiber đang phát triển CCH/multi-asset flow. SkillPass nên giữ payment abstraction để sau này hỗ trợ CKB/UDT mà không đổi authorization model.

### 5. Recovery-first operator UX

Fiber v0.9 tập trung mạnh vào migration, backup/restore và reliability. SkillPass vì vậy cũng nên xem restart/recovery là feature product, không chỉ là ops detail.

Project hiện đã có:

- persistent replay state;
- persistent quotes;
- delivery receipts;
- idempotent settlement recovery;
- readiness endpoints;
- operator support bundle;
- application state backup helper.

## Những thứ chưa nên làm vội

- mainnet auto-deploy;
- tự động import/spend user private key;
- auto fund/open Fiber channel;
- multi-replica trước khi chuyển state sang shared atomic datastore;
- phụ thuộc vào draft x402/Fiber API như thể đã ổn định hoàn toàn.

## Nguồn upstream

- CKB releases: https://github.com/nervosnetwork/ckb/releases
- Fiber repository: https://github.com/nervosnetwork/fiber
- Fiber dev logs: https://github.com/nervosnetwork/fiber/discussions/categories/dev-log
- Agent/Fiber integration design: https://github.com/nervosnetwork/fiber/issues/1255

Tại thời điểm cập nhật (tháng 9/2026), CKB 0.209.0 là release CKB mới nhất được xác nhận trong nguồn upstream đã kiểm tra; Fiber 0.9.0 đã live và tập trung vào reliability, migration và backup/restore.
## Khả năng tích hợp agent trong v0.6

SkillPass v0.6 bổ sung discovery metadata (`/.well-known/skillpass.json`) và OpenAPI (`/api/openapi.json`). Mục tiêu là làm cho capability + payment service có thể được agent/tool khám phá theo cách có cấu trúc, thay vì buộc agent scrape UI.

Điều này phù hợp với hướng Fiber đang nghiên cứu cho agent payment: HTTP 402/x402 làm lớp payment orchestration, trong khi SkillPass giữ **CKB live Cell ownership** làm lớp authorization bền vững. Discovery chỉ công bố metadata cần thiết; quyền ký CKB vẫn nằm trong wallet của user.


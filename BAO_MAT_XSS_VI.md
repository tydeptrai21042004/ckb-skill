# Bảo mật XSS và Web Security — SkillPass v0.8

Tài liệu này mô tả các thay đổi bảo mật web được bổ sung trong SkillPass v0.8, tập trung vào **Cross-Site Scripting (XSS)** và các lỗi thường đi kèm như HTML injection, CSRF qua browser, Host-header abuse và phản hồi lỗi chứa dữ liệu không an toàn.

## 1. Nguyên tắc chính

SkillPass không cố "lọc thẻ `<script>`" bằng regex. Cách làm đó không đủ an toàn vì XSS có nhiều ngữ cảnh khác nhau như HTML, attribute, URL, SVG, `srcdoc` và DOM sink.

Các lớp bảo vệ hiện tại:

1. **Không đưa dữ liệu người dùng vào HTML executable sink.**
   - Không dùng `innerHTML = ...`.
   - Không dùng `outerHTML = ...`.
   - Không dùng `insertAdjacentHTML(...)`.
   - Không dùng `document.write(...)`.
   - Không dùng `dangerouslySetInnerHTML` trong React.
   - Không dùng `eval(...)` hoặc `new Function(...)`.
2. **Demo UI render dữ liệu bằng `textContent` / text node.**
3. **React render dữ liệu qua JSX text node**, do đó React thực hiện escaping theo ngữ cảnh text.
4. **CSP chặn script ngoài policy**, object embedding, base-tag injection và framing.
5. **Trusted Types được enforce ở local demo** để chặn việc gán string trực tiếp vào DOM XSS sink.
6. **Trusted Types ở live CCC frontend đang ở Report-Only** vì cần kiểm thử đủ wallet connector trước khi enforce để tránh phá compatibility của thư viện wallet bên thứ ba.
7. **Mutation API chỉ nhận JSON**, từ chối form/text POST.
8. **Browser request có `Sec-Fetch-Site: cross-site` bị từ chối** trên mutation endpoint.
9. **Host header không còn được dùng để parse route URL**.
10. **Error message được loại control/bidi character và giới hạn độ dài** trước khi trả cho client.

## 2. CSP hiện tại

### Local demo

Local demo dùng CSP nghiêm ngặt, bao gồm:

```text
default-src 'self'
script-src 'self'
style-src 'self'
connect-src 'self'
img-src 'self' data:
font-src 'self'
object-src 'none'
base-uri 'none'
frame-ancestors 'none'
form-action 'none'
manifest-src 'self'
require-trusted-types-for 'script'
trusted-types 'none'
```

Vì local demo không cần tạo `TrustedTypePolicy`, `trusted-types 'none'` giúp giảm khả năng một đoạn code mới tự tạo policy lỏng lẻo để bypass bảo vệ.

### Live CCC/testnet frontend

Live frontend giữ CSP chặt cho script/style/object/base/frame và giới hạn `connect-src` vào SkillPass + CKB public endpoints cần thiết.

Trusted Types hiện được gửi ở `Content-Security-Policy-Report-Only`:

```text
require-trusted-types-for 'script'; trusted-types 'none'
```

Sau khi kiểm thử browser với toàn bộ wallet connector được hỗ trợ, có thể chuyển directive này vào CSP enforce.

## 3. Payload XSS đang được test

Security suite gửi nhiều dạng payload qua API thật, gồm:

```text
<script>...</script>
<img src=x onerror=...>
<svg/onload=...>
</textarea><script>...</script>
"><img src=x onerror=...>
javascript:...
<iframe srcdoc="<script>...</script>"></iframe>
<a href="javascript:...">...</a>
MathML/style-breakout payload
HTML-entity encoded script text
```

Mục tiêu của test không phải "xóa" payload. Dữ liệu paper có thể hợp pháp chứa HTML/code. Mục tiêu là **payload phải luôn được xử lý như text/data và không trở thành executable DOM**.

## 4. Test bảo mật

Chạy toàn bộ security test:

```bash
npm run test:security
```

Chạy browser-level smoke test nếu máy có Chromium/Chrome:

```bash
npm run smoke:security-browser
```

Bắt buộc browser test phải chạy, không cho phép skip:

```bash
REQUIRE_BROWSER_SECURITY=1 npm run smoke:security-browser
```

Chạy cả hai:

```bash
npm run verify:security
```

Browser smoke test kiểm tra 3 việc quan trọng:

1. Payload `<img onerror>` / `<svg onload>` hiển thị thành text và không execute.
2. CSP chặn injected inline script.
3. Trusted Types làm `element.innerHTML = attackerString` ném `TypeError` ở local demo.

## 5. HTTP hardening

Mutation endpoint (`POST`, `PUT`, `PATCH`, `DELETE`) dùng helper chung:

```text
assertJsonRequest(req)
rejectCrossSiteBrowserRequest(req)
```

Do đó request kiểu:

```http
Content-Type: application/x-www-form-urlencoded
```

hoặc browser request:

```http
Sec-Fetch-Site: cross-site
```

sẽ bị từ chối trước business logic.

Non-browser API/agent client không gửi `Sec-Fetch-Site` vẫn hoạt động bình thường.

## 6. Error handling

Error trả về client không được dùng trực tiếp để tạo HTML. Ngoài ra server loại:

- CR/LF không cần thiết;
- ASCII control character;
- Unicode bidi override/isolate control;
- message quá dài.

Điều này giảm log spoofing, response confusion và khả năng một error từ upstream trở thành vector injection nếu UI sau này bị thay đổi sai cách.

## 7. Quy tắc khi phát triển frontend

Không merge code mới nếu có một trong các pattern sau mà chưa review security:

```text
innerHTML =
outerHTML =
insertAdjacentHTML(
document.write(
dangerouslySetInnerHTML
eval(
new Function(
javascript:
```

Nếu cần render Markdown/HTML trong tương lai:

- không tắt CSP để "fix nhanh";
- dùng sanitizer đã được audit;
- cấu hình Trusted Types policy riêng, allowlist policy name trong CSP;
- thêm test payload cho đúng context mới;
- tuyệt đối không render raw model/agent output thành HTML.

## 8. File bảo mật chính

```text
packages/http-security/src/index.mjs
packages/http-security/test/security.test.mjs
tests/security-xss.test.mjs
scripts/browser-security-smoke.mjs
apps/demo-service/server.mjs
apps/live-service/server.mjs
apps/fiber-facilitator/server.mjs
```

## 9. Checklist trước production

- [ ] `npm test` pass.
- [ ] `npm run test:security` pass.
- [ ] `REQUIRE_BROWSER_SECURITY=1 npm run smoke:security-browser` pass trên browser CI/máy deploy.
- [ ] `npm run smoke:http` pass.
- [ ] `npm run smoke:fiber` pass nếu bật Fiber.
- [ ] `npm run smoke:paid` pass.
- [ ] Không thêm `unsafe-inline` hoặc `unsafe-eval` vào CSP để xử lý lỗi frontend.
- [ ] Không thêm raw HTML renderer cho output từ paper/agent/API.
- [ ] Test lại CCC wallet connector trước khi chuyển Trusted Types từ Report-Only sang enforce ở live frontend.

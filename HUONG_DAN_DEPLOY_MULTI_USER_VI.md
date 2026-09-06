# Hướng dẫn triển khai SkillPass v1.0 cho nhiều người dùng

Tài liệu này dành cho **triển khai public thật trên CKB testnet**, không phải local demo. Profile production dùng HTTPS, nhiều replica SkillPass, PostgreSQL, Redis và facilitator riêng. Người dùng vẫn ký bằng ví CKB của họ; server **không nhận và không lưu private key của người dùng**.

> Phạm vi an toàn hiện tại: public multi-user **testnet**. Contract/Fiber path chưa được tuyên bố đã audit để sử dụng mainnet với tài sản có giá trị thực.

---

## 1. Kiến trúc production

```text
                         Internet
                            |
                     TCP 80 / 443
                            |
                            v
                    +---------------+
                    |     Caddy     |
                    | HTTPS + LB    |
                    +-------+-------+
                            |
                 private Docker network
                /           |           \
               v            v            v
        +-----------+ +-----------+ +-----------+
        | SkillPass | | SkillPass | | SkillPass |
        | replica 1 | | replica 2 | | replica N |
        +-----+-----+ +-----+-----+ +-----+-----+
              \           |            /
               \          |           /
                +---------+----------+
                          |
              +-----------+-----------+
              |                       |
              v                       v
      +---------------+       +---------------+
      | PostgreSQL 17 |       |    Redis 8    |
      | durable state |       | nonce / limit |
      +---------------+       +---------------+
              ^
              |
        +-----+-------+
        | Facilitator |
        | x402/Fiber  |
        +-----+-------+
              |
              v
       private Fiber/FNN RPC

SkillPass replicas ---> dedicated/self-hosted CKB RPC
```

### Trạng thái nào nằm ở đâu?

**PostgreSQL** giữ dữ liệu cần bền vững và nhất quán khi restart/scale:

- payment quote;
- delivery receipt;
- payment replay/consumption;
- metadata phục vụ idempotent settlement/recovery.

`payment_hash` là primary key. Việc consume payment dùng atomic insert với unique key nên hai replica không thể cùng “thắng” một payment lần đầu.

**Redis** giữ dữ liệu ngắn hạn:

- wallet challenge nonce có TTL;
- one-time consume challenge;
- distributed IP rate limit.

Redis được cấu hình không persistence vì mất nonce/rate-limit khi restart chỉ buộc client lấy challenge mới; không làm mất payment/receipt.

---

## 2. Server nên dùng

Khuyến nghị ban đầu cho 2 SkillPass replicas:

- Ubuntu 24.04 LTS hoặc distro Linux tương đương;
- 4 vCPU;
- 8 GB RAM;
- 40–80 GB SSD;
- domain thật, ví dụ `skillpass.example.com`;
- Docker Engine + Docker Compose v2;
- outbound Internet tới CKB RPC và Fiber/FNN cần dùng.

Có thể chạy 4 GB RAM để thử tải nhỏ, nhưng 8 GB giúp PostgreSQL, build image và app có headroom tốt hơn.

### Port public

Chỉ cần:

```text
80/tcp
443/tcp
443/udp   # HTTP/3, có thể bỏ nếu firewall không dùng
```

Nếu tự host Fiber node và cần P2P thì có thể mở port P2P của Fiber theo cấu hình node.

### Không public

Không mở các port sau ra Internet:

```text
8787  SkillPass app
8790  facilitator
5432  PostgreSQL
6379  Redis
8227  Fiber administrative RPC
```

---

## 3. DNS

Tạo A record:

```text
skillpass.example.com -> PUBLIC_IP_CUA_VPS
```

Nếu VPS có IPv6 và bạn muốn dùng IPv6, thêm AAAA record đúng địa chỉ.

Kiểm tra:

```bash
dig +short skillpass.example.com
```

Kết quả phải trả về IP của server trước khi chạy Caddy để xin chứng chỉ TLS.

---

## 4. Cài Docker

Cài Docker Engine và Compose v2 theo tài liệu Docker cho distro của bạn. Sau đó kiểm tra:

```bash
docker --version
docker compose version
docker info
```

User triển khai cần quyền chạy Docker. Không nên mở Docker daemon TCP API ra Internet.

---

## 5. Giải nén repo

Ví dụ:

```bash
unzip ckb-skill-main-production-v1.zip
cd ckb-skill-main
chmod +x deploy-production.sh deploy.sh run_all.sh
```

Không cần `npm install` trên host để chạy production Docker stack.

---

## 6. Khởi tạo production config và secret

Chạy:

```bash
./deploy-production.sh init
```

Lệnh này tạo:

```text
.env.production
.secrets/facilitator_auth_token.txt
.secrets/postgres_password.txt
.secrets/redis_password.txt
.secrets/fiber_rpc_token.txt
```

Các file secret được generate ngẫu nhiên và `.gitignore`/`.dockerignore` loại khỏi Git/build context.

**Không gửi các file trong `.secrets/` cho frontend hoặc commit lên Git.**

Nếu `deployments/testnet.json` có deployment metadata thật, script sẽ cố import code hash/dep tx vào `.env.production`.

---

## 7. Cấu hình `.env.production`

Mở:

```bash
nano .env.production
```

Các giá trị quan trọng:

```dotenv
PUBLIC_DOMAIN=skillpass.example.com
ACME_EMAIL=admin@example.com

# App replicas trên cùng host
SKILLPASS_REPLICAS=2

# CKB RPC production-grade của bạn
CKB_RPC_URL=https://YOUR_DEDICATED_CKB_TESTNET_RPC
ALLOW_PUBLIC_CKB_RPC=false

# Capability Type Script đã deploy thật trên testnet
CAPABILITY_CODE_HASH=0x...
CAPABILITY_HASH_TYPE=data1
CAPABILITY_DEP_TX_HASH=0x...
CAPABILITY_DEP_INDEX=0

# Production shared state
STATE_BACKEND=postgres-redis
POSTGRES_DB=skillpass
POSTGRES_USER=skillpass
POSTGRES_POOL_MAX=20
POSTGRES_SSLMODE=disable

# Protected-service payment
PAYMENTS_REQUIRED=true
PAYMENT_AMOUNT=100000
PAYMENT_ASSET=CKB
PAYMENT_DECIMALS=8
PAYMENT_ATOMIC_UNIT=shannon
PAYMENT_TIMEOUT_SECONDS=600
SERVICE_RECEIPT_TTL_SECONDS=86400

# Fiber
FIBER_BACKEND=fnn
FIBER_NETWORK=testnet
FIBER_PAYMENT_PROOF=invoice-status
FIBER_RPC_URL=http://host.docker.internal:8227
FIBER_VERSION=0.9.0
```

### PAYMENT_AMOUNT

`PAYMENT_AMOUNT` là integer atomic unit. Với CKB:

```text
100,000,000 shannon = 1 CKB
100,000 shannon     = 0.001 CKB
```

Frontend v1.0 hiển thị human-readable amount dựa trên `PAYMENT_DECIMALS`, nhưng payment payload vẫn dùng integer chính xác để tránh lỗi floating-point.

---

## 8. CKB RPC: không dùng community RPC làm production dependency

Public/community RPC phù hợp development nhưng có thể rate-limit và không có SLA của bạn. Production nên dùng một trong:

1. self-hosted CKB node;
2. dedicated RPC endpoint;
3. provider có quota/SLA phù hợp.

`deploy-production.sh doctor` chặn các public endpoint phổ biến mặc định. Chỉ override bằng:

```dotenv
ALLOW_PUBLIC_CKB_RPC=true
```

khi bạn chủ động chấp nhận rủi ro đó.

---

## 9. Fiber/FNN production dependency

Production **không dùng** `FIBER_BACKEND=mock`.

Bạn cần một Fiber/FNN receiver node đã cấu hình, có routing/channel/payment state cần thiết. SkillPass facilitator gọi FNN RPC để:

- tạo invoice;
- kiểm tra invoice đã được trả;
- xác nhận settlement/proof theo mode được chọn.

### Cùng VPS

Nếu FNN chạy trực tiếp trên host, để container gọi được nó qua:

```dotenv
FIBER_RPC_URL=http://host.docker.internal:8227
```

RPC phải reachable từ Docker host gateway nhưng firewall **không cho Internet truy cập 8227**.

### FNN ở máy khác

Ưu tiên private network/VPN:

```dotenv
FIBER_RPC_URL=http://10.x.x.x:8227
```

Nếu buộc dùng HTTPS remote RPC, dùng TLS + auth token và firewall allowlist.

Nếu RPC cần bearer token, ghi token vào:

```text
.secrets/fiber_rpc_token.txt
```

không ghi token trực tiếp trong frontend.

### Fiber key

Fiber node có thể cần operator key riêng để vận hành node/channel. Đó **không phải private key của user SkillPass**. Không copy user wallet key vào SkillPass, facilitator hoặc web container.

---

## 10. Firewall mẫu với UFW

Ví dụ server public chỉ expose web:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw enable
sudo ufw status verbose
```

Không thêm rule public cho 8787, 8790, 5432, 6379, 8227.

Nếu FNN P2P cần inbound, chỉ mở đúng port P2P được node sử dụng.

---

## 11. Preflight trước deploy

Chạy:

```bash
./deploy-production.sh doctor
```

Doctor kiểm tra tối thiểu:

- secret tồn tại và đủ dài;
- domain/email hợp lệ;
- replica count 1..20;
- `STATE_BACKEND=postgres-redis`;
- PostgreSQL config;
- Capability code hash/dep tx đúng format;
- CKB RPC không bỏ trống;
- không vô tình dùng community public RPC;
- `FIBER_BACKEND=fnn`;
- `FIBER_NETWORK=testnet`;
- Fiber RPC URL;
- payment thật được bật;
- Docker Compose config nếu Docker daemon đang chạy.

Nếu doctor fail, **không chạy public trước khi sửa**.

---

## 12. Deploy

```bash
./deploy-production.sh up
```

Script sẽ:

1. build SkillPass/facilitator images;
2. start PostgreSQL;
3. start Redis;
4. start facilitator;
5. start số SkillPass replicas trong `SKILLPASS_REPLICAS`;
6. start Caddy;
7. chờ health check;
8. gọi HTTPS smoke test.

Khi thành công:

```text
https://skillpass.example.com
```

Caddy tự quản lý TLS certificate cho domain hợp lệ.

---

## 13. Kiểm tra sau deploy

```bash
./deploy-production.sh status
./deploy-production.sh health
./deploy-production.sh smoke
```

Xem logs:

```bash
./deploy-production.sh logs skillpass
./deploy-production.sh logs facilitator
./deploy-production.sh logs postgres
./deploy-production.sh logs redis
./deploy-production.sh logs caddy
```

Các health endpoint chính:

```text
GET /livez
GET /readyz
GET /api/status
GET /api/config
GET /.well-known/skillpass.json
```

`/readyz` kiểm tra CKB RPC, facilitator và shared state. Endpoint này có cache ngắn để tránh biến health probing thành RPC amplification.

---

## 14. Scale app khi nhiều user hơn

Ví dụ tăng từ 2 lên 4 replicas:

```bash
./deploy-production.sh scale 4
```

Caddy tự resolve các IP Docker của service `skillpass`; không cần sticky session vì challenge/rate-limit nằm ở Redis và quote/receipt nằm ở PostgreSQL.

Kiểm tra:

```bash
./deploy-production.sh status
./deploy-production.sh smoke
```

### Connection budget

Mỗi replica có `POSTGRES_POOL_MAX`. Ví dụ:

```text
4 replicas x pool max 20 = tối đa khoảng 80 app DB connections
+ facilitator connections
+ operator/maintenance connections
```

Không scale replica mù quáng. Điều chỉnh pool theo `max_connections` của PostgreSQL và tải thật.

---

## 15. Backup

Trước upgrade hoặc thay đổi lớn:

```bash
./deploy-production.sh backup
```

Backup tạo:

```text
backups/production-YYYYMMDDTHHMMSSZ/skillpass.sql.gz
```

Backup này chứa **application PostgreSQL state**. Nó không chứa:

- `.secrets/`;
- user private keys;
- Caddy certificate store;
- Fiber channel/node storage.

Fiber/FNN phải backup theo quy trình backup/restore của Fiber tương ứng với version node đang chạy.

Nên copy DB backup sang object storage/máy khác có mã hóa. Backup nằm cùng VPS không bảo vệ khỏi mất VPS.

---

## 16. Restore

Đầu tiên giữ một snapshot/backup hiện tại. Sau đó:

```bash
./deploy-production.sh restore backups/production-.../skillpass.sql.gz --yes
```

Script dừng SkillPass/facilitator writer, restore PostgreSQL với `ON_ERROR_STOP`, rồi start stack lại và chạy smoke test.

Không restore DB “nóng” trong khi app replicas vẫn ghi dữ liệu.

---

## 17. Upgrade

```bash
./deploy-production.sh upgrade
```

Flow:

1. doctor;
2. backup PostgreSQL;
3. pull Caddy/PostgreSQL/Redis images được pin trong Compose;
4. rebuild app;
5. start;
6. health + smoke.

Trước khi nâng Fiber/FNN, đọc migration/backup notes của đúng Fiber release. Không xóa hoặc thay channel database tùy tiện.

---

## 18. Secret rotation

### Facilitator auth token

1. backup;
2. generate token mới vào `.secrets/facilitator_auth_token.txt`;
3. restart SkillPass + facilitator:

```bash
./deploy-production.sh up
```

Cả hai service đọc cùng Docker secret file nên phải restart đồng bộ.

### PostgreSQL/Redis passwords

Việc thay password cần đổi credential phía database và secret ứng dụng theo đúng thứ tự. Không chỉ overwrite file rồi restart, vì database vẫn giữ password cũ. Thực hiện trong maintenance window và test restore trước.

### Fiber RPC token

Rotate ở FNN/API và cập nhật `.secrets/fiber_rpc_token.txt`, sau đó restart facilitator.

---

## 19. Security controls đã có trong v1.0

### Browser/API

- CSP/security headers;
- XSS adversarial tests;
- JSON-only state-changing requests;
- cross-site browser request rejection;
- request-body limits;
- request/header/server timeouts;
- generic 5xx error messages;
- request IDs;
- no user private keys server-side.

### Wallet authentication

- fresh nonce with TTL;
- nonce one-time consume bằng Redis `GETDEL`;
- challenge gắn với CKB address;
- CCC signature verification;
- live Cell lookup lại tại thời điểm dùng;
- lock script phải khớp requester;
- capability phải đúng deployment/service/expiry.

### Payment

- payment quote gắn với semantic request hash;
- quote không thể dùng cho text/capability/address khác;
- payment replay key durable trong PostgreSQL;
- atomic unique payment consumption;
- settlement idempotent;
- delivery receipt persisted để retry sau dropped HTTP response/crash;
- mock payment bị production doctor chặn.

### Infrastructure

- Caddy là public ingress duy nhất;
- HTTPS/HSTS;
- facilitator, PostgreSQL, Redis không publish host port;
- backend data network internal;
- Docker secrets cho service credentials;
- non-root Node containers;
- read-only root filesystem;
- `no-new-privileges`;
- drop Linux capabilities cho app containers;
- PID/memory limits;
- health checks/restart policy.

---

## 20. Vì sao PostgreSQL replay protection quan trọng

Không dùng pattern phân tán kiểu:

```text
if (!used(hash)) {
  used(hash) = true
}
```

vì hai replica có thể cùng đọc `false` trước khi một replica ghi.

v1.0 dùng database constraint:

```text
payment_hash PRIMARY KEY
INSERT ... ON CONFLICT DO NOTHING
```

Chỉ một transaction insert thành công. Replica còn lại nhìn thấy payment đã consumed và đi theo idempotent recovery path.

---

## 21. Privacy của delivery receipt

Receipt có thể chứa kết quả protected service. Mặc định:

```dotenv
SERVICE_RECEIPT_TTL_SECONDS=86400
```

Tức 24 giờ để hỗ trợ safe retry/recovery.

Nếu service xử lý nội dung nhạy cảm:

- giảm TTL nếu business không cần 24 giờ;
- mã hóa disk/snapshot/backup;
- giới hạn quyền truy cập DB;
- không đưa raw protected result vào analytics/log;
- thiết kế retention policy phù hợp quy định dữ liệu của bạn.

---

## 22. Load test trước khi mở rộng user

Ít nhất kiểm tra:

1. 2–4 replicas hoạt động đồng thời;
2. một nonce không dùng được hai lần qua hai replica;
3. một payment hash không consume hai lần;
4. retry cùng paid request sau dropped response trả cùng delivery;
5. transfer capability khiến owner cũ bị deny ngay;
6. Redis restart chỉ yêu cầu challenge mới;
7. app replica restart không mất quote/receipt/replay;
8. PostgreSQL restore khôi phục payment state;
9. CKB RPC/FNN downtime trả 503/402 hợp lý và không leak upstream secret;
10. request body/XSS/cross-site/rate-limit tests vẫn pass.

Chạy repository verification:

```bash
npm run setup
npm test
npm run build:web
npm run verify:production
npm run test:security
```

---

## 23. Monitoring tối thiểu

Cho production thật, nên có external uptime check tới:

```text
https://DOMAIN/livez
https://DOMAIN/readyz
```

Alert khi:

- `/livez` fail;
- `/readyz` fail liên tục;
- disk > 80%;
- PostgreSQL volume gần đầy;
- RAM swap/thrashing;
- container restart loop;
- FNN/CKB RPC latency tăng mạnh;
- HTTP 5xx tăng bất thường.

Caddy log được ghi có cấu trúc ra stdout và production Caddyfile xóa `PAYMENT-SIGNATURE` khỏi access log. Không bật credential logging và không log Fiber preimage/token/private key.

---

## 24. Single-host production vs high availability nhiều host

Stack mặc định hiện tại là **production multi-replica trên một Docker host**:

```text
Caddy + N SkillPass + Facilitator + PostgreSQL + Redis
```

Nó xử lý concurrency đúng hơn và có thể phục vụ nhiều user, nhưng một VPS vẫn là một failure domain.

Khi cần HA nhiều server/datacenter:

```text
External load balancer
        |
   +----+----+
   |         |
Host A     Host B
   \         /
    \       /
 Managed/HA PostgreSQL
 Managed/HA Redis
 private FNN/CKB dependencies
```

Code state layer đã không phụ thuộc process memory trong production, nhưng Compose này chưa tự dựng multi-host database cluster. Lúc đó nên dùng managed PostgreSQL/Redis hoặc cluster có failover đã vận hành chuẩn, không tự ghép database HA chỉ để “có nhiều container”.

---

## 25. Mainnet checklist riêng

Đừng chỉ đổi `testnet` thành `mainnet`.

Trước mainnet cần tối thiểu:

- audit độc lập CKB Type Script;
- threat model/payment economic review;
- Fiber/FNN release compatibility review;
- mainnet contract deployment/reproducible build evidence;
- dedicated mainnet CKB RPC;
- backup/restore drill;
- incident/secret rotation drill;
- abuse/DDoS protection;
- privacy/legal retention review;
- monitoring + on-call;
- load/chaos tests;
- explicit spending/payment UX review.

Live service trong release này cố ý khóa testnet để tránh vô tình chuyển sang mainnet chưa audit.

---

## 26. Checklist trước khi gửi URL cho user

- [ ] DNS trỏ đúng VPS.
- [ ] Chỉ 80/443 public.
- [ ] `.env.production` không nằm trong Git.
- [ ] `.secrets/` permission chặt.
- [ ] CKB RPC dedicated/self-hosted.
- [ ] Capability deployment metadata là giao dịch thật.
- [ ] FNN RPC private và reachable từ facilitator.
- [ ] `FIBER_BACKEND=fnn`.
- [ ] `PAYMENTS_REQUIRED=true`.
- [ ] `STATE_BACKEND=postgres-redis`.
- [ ] `./deploy-production.sh doctor` pass.
- [ ] `./deploy-production.sh up` pass.
- [ ] `./deploy-production.sh smoke` pass.
- [ ] `./deploy-production.sh health` trả `ok: true`.
- [ ] Backup tạo được và đã copy off-host.
- [ ] Test Alice -> transfer -> Bob pass trên testnet.
- [ ] Test duplicate payment/nonce/retry pass.
- [ ] Không có user/operator private key trong web/app logs.

---

## 27. Lệnh vận hành nhanh

```bash
# Khởi tạo
./deploy-production.sh init

# Kiểm tra cấu hình
./deploy-production.sh doctor

# Deploy/update
./deploy-production.sh up

# Scale app
./deploy-production.sh scale 4

# Trạng thái
./deploy-production.sh status
./deploy-production.sh health
./deploy-production.sh smoke

# Log
./deploy-production.sh logs skillpass
./deploy-production.sh logs facilitator

# Backup/restore
./deploy-production.sh backup
./deploy-production.sh restore backups/production-.../skillpass.sql.gz --yes

# Upgrade có backup trước
./deploy-production.sh upgrade

# Stop
./deploy-production.sh down
```

---

## Kết luận

Profile v1.0 không còn dựa vào JSON/Map cho state production. Nó có shared atomic state, app replicas, HTTPS/load balancing, durable payment recovery, distributed nonce/rate limiting và backup/restore flow. Đây là baseline phù hợp để vận hành **một dịch vụ SkillPass public nhiều người dùng trên CKB testnet**.

Điểm không nên “đốt giai đoạn” là mainnet financial production: contract/Fiber integration cần audit và operational review độc lập trước khi xử lý tài sản có giá trị thực.

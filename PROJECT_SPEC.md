# PROJECT_SPEC — Ecommerce Backend (Hono + TypeScript + Prisma)

เอกสารนี้เป็น **blueprint ระดับโปรดักชัน** สำหรับระบบหลังบ้านอีคอมเมิร์ซแบบโมดูลาร์ รองรับ SaaS-scale การตั้งชื่อ technical term เป็นภาษาอังกฤษตามมาตรฐานอุตสาหกรรม คำอธิบายเป็นภาษาไทย

---

## 1. ภาพรวมระบบ (System Overview)

- **โดเมน**: แพลตฟอร์มอีคอมเมิร์ซ — มีทั้ง **ลูกค้าทั่วไป (User)** และ **ผู้ดูแล (Admin)**
- **Runtime / Framework**: [Hono](https://hono.dev/) บน Node.js (หรือ runtime ที่เลือก) — เน้น performance และ middleware ที่ประกอบง่าย
- **ภาษา**: TypeScript **strict**
- **ORM**: Prisma — schema เป็น single source of truth สำหรับ DB layer
- **ลักษณะระบบ**: แยกโมดูลตาม **feature** + **layered** ภายใน feature, งานหนักแยกไป **คิว (BullMQ)** การยืนยันตัวตน **JWT**, การอนุญาต **RBAC**, การตรวจสอบข้อมูล **Zod**, เอกสาร API **OpenAPI ผ่าน @hono/zod-openapi**

เป้าหมาย: ไม่ใช่ demo — ต้องรองรับ **ความพร้อมใช้งาน, ความปลอดภัย, การสเกล, และการสังเกตการณ์ (observability)** ในระยะยาว

---

## 2. สถาปัตยกรรม (Architecture)

### 2.1 รูปแบบ (Pattern)

- **Feature-based**: โค้ดธุรกิจหลักจัดตามโดเมน (users, orders, payments, …)
- **Layered ภายใน feature**:

```
HTTP Request
    → Router (Hono route registration)
    → Controller (HTTP + DTO mapping)
    → Service (business rules, orchestration)
    → Repository (Prisma / persistence)
    → Database
```

### 2.2 กฎการพึ่งพา (Dependency Rules)

| ชั้น | หน้าที่หลัก | ห้าม |
|------|--------------|------|
| Route | ลงทะเบียน path, middleware เช่น auth/rate-limit, delegate controller | business logic, Prisma |
| Controller | validate (Zod), เรียก service, ส่ง response มาตรฐาน | Prisma โดยตรง |
| Service | use cases, transaction, enqueue job | SQL ad-hoc ใน controller |
| Repository | query/command ต่อ DB | HTTP concerns |

- **ห้าม** cross-import **service** ข้าม feature — ลด coupling และ circular dependency
- **อนุญาต** cross-feature ผ่าน **repository** (หรือ interface ที่เป็น data-access เท่านั้น) เมื่อ use case ต้องอ่านข้อมูลข้ามโดเมน — ให้ feature เจ้าของ flow เป็นผู้เรียก repository ของอีกโดเมนผ่าน abstraction ที่ชัด (เช่น `ProductReadRepo`) ไม่เรียก `OtherFeatureService`

### 2.3 Async & Resilience

- HTTP handler ตอบเร็ว — งาน email, webhook ไปคู่ค้า, การประมวลผลรูปหนัก → **BullMQ**
- ใช้ **retry + backoff** สำหรับงานที่ idempotent ได้ — งานที่ไม่ idempotent ต้องออกแบบ state machine + dedupe

---

## 3. โครงสร้างโฟลเดอร์ (Folder Structure)

คำอธิบายแต่ละส่วน (ปรับชื่อย่อยให้สอดคล้องกับ repo จริงได้ แต่หลักการคงเดิม)

```
src/
  core/                 # โค้ดกลางที่ไม่ผูก feature
  features/             # โดเมนธุรกิจแยกโฟลเดอร์
  integrations/         # adapter คู่ค้าภายนอก (LINE, payment providers, SMS, object storage)
  router/               # ประกอบ Hono app, mount routes, global middleware
  shared/               # util, types, errors, zod helpers ที่ใช้ข้าม feature
```

### 3.1 `core/`

- **config**: โหลด env, validation ของ config (Zod)
- **logger**: Winston instance, format, redaction
- **db**: Prisma client singleton, transaction helper
- **queue**: BullMQ connection, queue names, default job options
- **http**: centralized error handler, request id / correlation id
- **security**: JWT verify/sign helpers, RBAC policy types (ไม่ใส่ business ของ order ที่นี่)

จุดประสงค์: จุดเดียวสำหรับ infrastructure ที่ทุก feature ใช้ร่วม โดยไม่ผสม business rule ของ feature ใด feature หนึ่ง

### 3.2 `features/<name>/`

ตัวอย่าง `features/orders/`:

- `order.routes.ts` — ลงทะเบียน Hono routes + OpenAPI metadata
- `order.controller.ts`
- `order.service.ts`
- `order.repo.ts`
- `order.schemas.ts` — Zod สำหรับ body/query/params
- `order.types.ts` — domain types ที่ไม่ซ้ำกับ Prisma (ถ้าจำเป็น)

### 3.3 `integrations/`

- adapter ต่อ **LINE Login**, **payment gateways**, **object storage (S3-compatible)**, **email provider**
- แต่ละ integration implement **interface** ที่ `features` หรือ `core` กำหนด (Dependency Inversion)

### 3.4 `router/`

- สร้าง `app` หลัก, ใส่ middleware ทั่วทั้งแอป (logging, cors, rate limit, error boundary)
- `mount` routes จากแต่ละ feature
- health check, OpenAPI document endpoint

### 3.5 `shared/`

- `errors/` — error classes, error code enum, map เป็น HTTP status
- `zod/` — preprocessors, common schemas (pagination, id uuid, money decimal string)
- `utils/` — pure functions

---

## 4. การยืนยันตัวตน (Authentication)

### 4.1 JWT

- Access token (อายุสั้น) + optional refresh token ตามนโยบาย
- เก็บ claims ขั้นต่ำ: `sub` (user id), `role` / `permissions` version, `session_id` (ถ้ามี)
- rotation / revoke: blacklist หรือ session table ตามความต้องการ

### 4.2 OTP

- ใช้สำหรับ login ทางโทรศัพท์ / email หรือ step-up verification ก่อนชำระเงิน
- เก็บ hash ของ OTP, TTL, attempt limit, rate limit ต่อ identifier
- **ห้าม** log OTP plaintext

### 4.3 LINE Login

- OAuth 2.0 / LINE Login flow ผ่าน `integrations/line/`
- map `line_user_id` → `users` (หรือตาราง identity) — รองรับการผูกหลาย provider

---

## 5. ฟีเจอร์หลัก (Features)

### 5.1 Users

- ลงทะเบียน, profile, ที่อยู่จัดส่ง, preferences
- identity providers (email/password หรือ OTP, LINE)

### 5.2 Products

- catalog, variants, inventory, categories, media references
- admin: CRUD, publish/draft, pricing rules (ถ้ามี)

### 5.3 Orders

- cart → checkout → order — state machine (created, paid, fulfilled, cancelled, refunded)
- inventory reservation strategy (reserve at checkout vs at payment — ระบุใน implementation)

### 5.4 Payments

- abstraction `PaymentProvider` — รองรับหลายผู้ให้บริการ
- webhooks จากผู้ให้บริการ → verify signature → update `payments` + `orders`

### 5.5 Uploads

- ดูส่วน “ระบบอัปโหลดไฟล์” — temp + commit/rollback

### 5.6 Notifications

- event-driven: เมื่อเกิด domain event → enqueue notification job
- channels: email, LINE messaging (ถ้ามี), in-app `notifications`

### 5.7 Webhooks (ออกจากระบบเรา)

- ลูกค้า/พาร์ทเนอร์ลงทะเบียน endpoint + secret
- ส่ง event หลัง state เปลี่ยน — sign payload, retry, dead-letter

### 5.8 Admin

- RBAC ละเอียด, audit log ทุกการกระทำสำคัญ
- dashboards support ในอนาคตผ่าน metrics (Prometheus)

---

## 6. ระบบอัปโหลดไฟล์ (File Upload System)

### 6.1 Streaming upload

- รับ body เป็น stream (หรือ multipart parser) — จำกัดขนาดและ MIME ที่อนุญาต
- เขียนลง **temp path** ก่อน (local disk หรือ staging prefix ใน object storage)

### 6.2 Temp storage

- naming: random + timestamp, แยก prefix ต่อ tenant/user ถ้าเป็น SaaS
- metadata ชั่วคราวใน DB หรือ cache (optional) สำหรับสถานะ `pending`

### 6.3 Commit / Rollback pattern

1. **Upload complete** → ไฟล์อยู่ temp, บันทึก `uploads` row สถานะ `pending`
2. **Business commit** (เช่น สร้าง product image) สำเร็จใน **transaction**:
   - อัปเดต entity หลัก
   - ย้ายไฟล์ไป permanent location / copy object แล้วลบ temp
   - อัปเดต `uploads` เป็น `committed`
3. **Failure** หลังขั้นตอนใดขั้นตอนหนึ่ง:
   - rollback transaction
   - ลบ temp files ที่ยังไม่ commit
   - ทำให้สถานะสอดคล้อง (ไม่มี orphan ถาวร)

### 6.4 Image optimization

- หลัง commit → enqueue job (BullMQ) สำหรับ resize, WebP/AVIF derivative, strip sensitive EXIF ถ้าจำเป็น
- ไม่บล็อก request หลัก

---

## 7. ระบบคิว (Queue System — BullMQ)

### 7.1 การใช้งาน

- **Queues แนะนำ**: `email`, `notifications`, `webhooks-outbound`, `media-processing`, `reports`
- Worker แยก process หรือแยก deployment ได้

### 7.2 Workers

- worker รับ job → เรียก service/integration ที่ idempotent-aware
- แยก concurrency ตามคิว

### 7.3 Retry strategy

- exponential backoff + jitter
- กำหนด `maxAttempts` ตามประเภทงาน
- หลังหมด retry → **dead-letter** (เก็บ payload + error สำหรับ replay ด้วยมนุษย์)

---

## 8. ระบบแจ้งเตือน (Notification System — Event-driven)

### 8.1 Event → Notification

| Event | ผู้รับ | ช่องทาง |
|--------|--------|---------|
| order_created | admin / ops | email / LINE / in-app |
| order_shipped | user | email / LINE / in-app |
| payment_success | user | email / in-app |
| payment_failed | user + admin | ตามนโยบาย |

### 8.2 Implementation pattern

- service เปลี่ยน state สำเร็จ → `emit` domain event (in-process) หรือเขียน `outbox` table → worker ส่งจริง
- **Transactional outbox** แนะนำเมื่อต้องการความสอดคล้องระหว่าง DB write กับ job enqueue

---

## 9. ระบบชำระเงิน (Payment System)

### 9.1 Abstraction layer

```text
PaymentService
    → selects provider by config / user region
    → calls PaymentProviderPort
        implementations: StripeXxxAdapter, OmiseXxxAdapter, ...
```

### 9.2 หลายผู้ให้บริการ

- ตาราง `payments` เก็บ `provider`, `provider_ref`, raw metadata (encrypted หรือเก็บเฉพาะสิ่งจำเป็น)
- webhook แยก route ต่อ provider แต่ converge ที่ `PaymentWebhookService`

### 9.3 Idempotency

- ทุกคำขอชำระเงินที่สร้างผลทางการเงินต้องผูก **idempotency key**
- webhook processing dedupe ด้วย `event_id` จากผู้ให้บริการ

---

## 10. Logging

### 10.1 Winston

- transports: console (dev), file/JSON (prod), optional remote (ELK, CloudWatch)

### 10.2 ประเภท log

- **request/response**: method, path, status, duration, request_id, user_id (ถ้ามี)
- **errors**: stack ใน server log เท่านั้น — ไม่ส่งถึง client
- **audit**: ใคร ทำอะไร กับ resource ใด เมื่อไหร่, IP, user agent

### 10.3 Toggle

- `LOG_LEVEL`, `HTTP_LOG_ENABLED`, `AUDIT_LOG_ENABLED` — ควบคุมผ่าน env

---

## 11. Validation (Zod)

- ทุก input ผ่าน schema — ร่วมกับ `@hono/zod-openapi` เพื่อให้ route = contract
- รูปแบบเงิน: ใช้ string decimal หรือ integer minor unit — หลีกเลี่ยง `number` สำหรับเงินเมื่อ precision สำคัญ

---

## 12. Security

- **RBAC**: roles → permissions many-to-many; middleware โหลด permissions ลง context
- **Rate limiting**: ทั้ง global และ per-route (login, OTP, webhook)
- **Idempotency**: order + payment บังคับ
- **Headers**: security headers ตาม best practice (ผ่าน reverse proxy ได้)
- **Secrets**: ไม่ commit; ใช้ secret manager ใน production

---

## 13. Webhook System (Outbound)

- ลงทะเบียน endpoint ของลูกค้า + signing secret
- delivery worker: sign body (HMAC), POST, ตรวจ response, retry
- **ห้าม** เก็บ plaintext secret ใน log

---

## 14. Cleanup System

### 14.1 Temp files

- cron/worker: ลบ temp ที่เกิน TTL (เช่น 24–48 ชม.) และ `uploads.status = abandoned`

### 14.2 Expired data

- OTP, idempotency keys หมดอายุ, revoked sessions, stale cart
- แบ่ง job รายวัน/รายชั่วโมงตาม volume

---

## 15. Future Support (Observability & Scale-out)

### 15.1 Prometheus

- metrics: HTTP latency histogram, queue depth, job failure rate, DB pool stats

### 15.2 Grafana

- dashboards จาก Prometheus + logs correlation ด้วย request_id

### 15.3 Microservices migration

- แยกคิว worker เป็นบริการแยกได้แล้ววันนี้
- ในอนาคต: แยก `payments`, `notifications` เป็น service — ใช้ **public API + event bus** โดยเก็บ **repository boundaries** ให้ชัดตั้งแต่ต้น

---

## 16. Database Design (Tables Overview)

> ชื่อตารางและคอลัมน์เป็นภาษาอังกฤษตาม convention ของ Prisma — รายละเอียดคอลัมน์ implement ใน `schema.prisma`

| ตาราง | วัตถุประสงค์ |
|--------|----------------|
| **users** | บัญชีผู้ใช้, profile, สถานะ, soft delete |
| **roles** | ชื่อ role (customer, admin, staff, …) |
| **permissions** | รหัส permission ละเอียด (product:write, order:refund, …) |
| **role_permissions** | M2M roles ↔ permissions |
| **user_roles** | M2M users ↔ roles (รองรับหลาย role ต่อ user ถ้าต้องการ) |
| **products** | สินค้า, slug, ราคา, สถานะ publish |
| **product_variants** | SKU, สต็อก, ราคา override |
| **orders** | คำสั่งซื้อ, สถานะ, ยอดรวม, อ้างอิง user |
| **order_items** | รายการในคำสั่งซื้อ |
| **payments** | การชำระเงิน, provider, idempotency, สถานะ |
| **carts** / **cart_items** | ตะกร้า active / guest merge strategy |
| **notifications** | in-app notifications |
| **audit_logs** | การกระทำสำคัญของ admin / ระบบ |
| **webhooks** | ลงทะเบียน endpoint ของลูกค้า + secret hash |
| **webhook_deliveries** | สถานะการส่ง, attempts, last error |
| **idempotency_keys** | key, route, request fingerprint, response snapshot, expires_at |

ดัชนี (indexes) แนะนำ:

- `users.email` unique (ถ้าใช้ email login)
- `orders(user_id, created_at)`
- `payments(order_id)`, `payments(provider, provider_ref)` unique ตาม provider
- `idempotency_keys(key, route)` unique
- `audit_logs(actor_id, created_at)`, `audit_logs(resource_type, resource_id)`

---

## 17. Deployment & Production

### 17.1 Environment configs

- แยก `development` / `staging` / `production`
- validate env ด้วย Zod ตอนบูต — fail fast ถ้าขาด `DATABASE_URL`, `JWT_SECRET`, Redis สำหรับ BullMQ

### 17.2 Production considerations

- TLS termination ที่ load balancer
- Prisma connection pool สอดคล้องกับ instance count
- migrations รันแยก pipeline (ไม่ auto-migrate บน instance ทุกตัวพร้อมกันโดยไม่ควบคุม)

### 17.3 Scaling strategy

- horizontal scale API stateless
- แยก worker processes สำหรับคิว
- read replica สำหรับ reporting (อนาคต) — ระวัง replication lag

---

## 18. API Contract (OpenAPI)

- ทุก route มี Zod schema สำหรับ input/output
- generate OpenAPI JSON สำหรับ consumer ภายนอกและ QA

---

## 19. Definition of Done (สำหรับทุก PR ที่แตะ API)

- มี validation + error shape มาตรฐาน
- ไม่มี business logic ใน route
- ไม่มี Prisma ใน controller
- มี logging/audit ตามความเสี่ยงของ endpoint
- งานหนักไปคิวเมื่อเข้าเกณฑ์
- order/payment มี idempotency

---

## 20. หมายเหตุ repo SKM Easy (ปัจจุบัน)

สเปคด้านบนเป็นแม่แบบอีคอมเมิร์ซทั่วไป — ใน repo นี้มีรายละเอียดเพิ่มเติมที่ควรอ่านคู่กัน:

- **API:** `API_DOCUMENTATION.md` — รวม endpoint แอดมินทดสอบ LINE OA (`/admin/tools/line-oa/*`) และสัญญา `/notifications` กับ JWT `sub`
- **ฐานข้อมูล / legacy:** `DATABASE_DOCUMENTATION.md`, `DEVELOPMENT_RULES.md`, `sql/dba/HANDOFF_SKM_EASY_V2.sql`
- **สถาปัตยกรรมรันไทม์:** `SYSTEM_DOCUMENTATION.md`
- **ข้อมูลทดสอบแจ้งเตือน:** `sql/dba/seed_sample_notifications.sql`

---

เอกสารนี้ใช้คู่กับ `.cursor/rules/*.mdc` เพื่อให้ Cursor สร้างโค้ดที่สอดคล้องกับสถาปัตยกรรมและความปลอดภัยระดับโปรดักชัน

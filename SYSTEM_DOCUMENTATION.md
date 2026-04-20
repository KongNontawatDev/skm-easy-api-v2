# เอกสารระบบ — SKM Easy API v2 (แพลตฟอร์มผ่อนชำระ)

เอกสารนี้อธิบายภาพรวม สถาปัตยกรรม โฟลว์หลัก ความปลอดภัย และแนวทาง deploy สำหรับ backend **ผ่อนชำระ + แจ้งโอนรอแอดมินตรวจ** ที่สร้างด้วย **Hono + TypeScript + Prisma Client (raw SQL) + BullMQ + Redis + Zod + Winston + JWT + ThaiBulkSMS + LINE**

รายละเอียด endpoint ดู `API_DOCUMENTATION.md` — กฎการตั้งค่า SQL legacy ดู `DEVELOPMENT_RULES.md`

---

## 1. ภาพรวมระบบ (System Overview)

ระบบนี้เป็น **REST API ผ่อนชำระ** รองรับ:

- ลูกค้าแอป: OTP ทาง SMS (ThaiBulkSMS), JWT แบบ `role=customer`, ดึงสัญญา/งวด/ใบเสร็จจาก **MariaDB legacy ผ่าน SQL ใน env**
- ชำระเงิน: สร้าง PromptPay payload (QR), ลูกค้ากดแจ้งโอน → สถานะ `PENDING_VERIFY` → แอดมินยืนยันจากรายงานธนาคาร → อัปเดต legacy (SQL ออปชัน) + แจ้ง LINE ผ่านคิว BullMQ
- เนื้อหาแอป: โปรโมชัน / บทความ / คู่มือ / ติดต่อ (ตารางใหม่ที่นิยามใน `prisma/schema.prisma` แต่เข้าถึงผ่าน raw SQL)
- อัปโหลดไฟล์แบบสตรีม (เฉพาะผู้ใช้ระบบภายใน ไม่ใช่ลูกค้าแอป)
- Webhook เข้า, audit, metrics (เดิม)

โมดูลอีคอมเมิร์ซ (สินค้า/ตะกร้า/ออเดอร์) **ถูกถอดออกจาก router** — ตารางเดิมใน DB อาจยังอยู่แต่ไม่ถูกใช้ในโค้ด

---

## 2. โครงสร้างโปรเจกต์ (Project Structure)

โค้ดหลักอยู่ที่ `src/` แบ่งตาม blueprint ใน `PROJECT_SPEC.md`

### `src/core/`

โค้ดโครงสร้างพื้นฐานที่ไม่ผูก feature:

| โฟลเดอร์/ไฟล์ | บทบาท |
|---------------|--------|
| `core/env/` | โหลดและ validate environment ด้วย Zod |
| `core/logger/` | Winston + redact ฟิลด์ sensitive |
| `core/db/` | Prisma client singleton (ใช้เฉพาะ raw query / execute) |
| `core/http/` | Error types, idempotency record service |
| `core/queue/` | BullMQ connection, default job options, factory สร้าง queue/worker |
| `core/security/` | JWT, auth middleware, rate limit (Redis), helmet, Redis client |
| `core/cache/` | แคช Redis (สินค้า/โปรไฟล์/คอนฟิกสาธารณะ) + key design |
| `core/storage/` | Local / S3 driver ตาม `STORAGE_DRIVER` |
| `core/compression/` | บีบอัด response สำหรับ public/admin |
| `core/metrics/` | Prometheus scrape |
| `core/health/` | health check logic |
| `core/scheduler/` | งาน cleanup ตามกำหนดเวลา (ถ้าเปิดใช้) |

### `src/features/`

แยกตามโดเมน แต่ละ feature มี OpenAPI route + service + repo (ตามมาตรฐานโปรเจกต์)

ตัวอย่าง: `features/orders/` — `orders.openapi.ts` (ลงทะเบียน route), `orders.service.ts`, `orders.repo.ts`

### `src/integrations/`

Adapter ต่อระบบภายนอก: อีเมล, LINE Login/Messaging, payment providers, webhook signer/dispatcher

หลักการ: **dependency inversion** — business ใน feature เรียก interface/adapter ไม่ผูก implementation ตรงๆ

### `src/router/`

ประกอบ Hono app:

- `public.router.ts` — API สาธารณะ + auth + rate limit + compression
- `admin.router.ts` — API admin/staff + permission ละเอียด
- `index.ts` — mount `/api/v1` และ `/api/v1/admin`

### `src/shared/`

constants (เช่น role/permission slug), helpers ที่ใช้ข้าม feature

### `src/workers/`

โปรเซส BullMQ (`queue.worker.ts` + `processors/*`)

### `prisma/`

`schema.prisma`, migrations, seed

---

## 3. Request Flow

ลำดับมาตรฐาน:

```
Client
  → Hono Route (OpenAPI + middleware: CORS, helmet, rate limit, auth ตาม path)
    → Controller handler (ในไฟล์ *.openapi.ts: parse/validate Zod, อ่าน header)
      → Service (business rules, transaction, enqueue)
        → Repository / service (Prisma `$queryRaw` / `$executeRaw`)
          → Database (MySQL/MariaDB ผ่าน Prisma driver)
```

**ข้อห้ามตามสเปก:** Route ไม่ใส่ business logic หนัก; Controller ไม่เรียก Prisma ORM delegate — เช่น `/users/me` เรียก `usersService` → `usersRepo` (raw SQL)

---

## 4. Authentication Flow

### Login (email + password)

1. Client `POST /auth/login` พร้อม body Zod
2. `authService.login` ค้นหา user, `bcrypt.compare` กับ `passwordHash`
3. สร้าง `AuthPrincipal` จาก roles + permissions
4. ออก **access JWT** (อายุสั้น, claim: sub, email, roles, permissions) และ **refresh JWT** (อายุยาว, `typ: 'refresh'`)

### JWT

- ลงชื่อด้วย HS256 และ **verify จำกัด algorithm HS256** เพื่อกัน algorithm confusion
- Access ใช้ยืนยันทุก request ที่ `authMiddleware`
- Refresh ใช้แลก access ใหม่ (`authService.refresh`)

### OTP (แอดมิน — อีเมล)

1. `requestOtp` สร้างรหัสสุ่ม, **hash** เก็บใน `Otp` (ไม่เก็บ plaintext)
2. ส่งอีเมลผ่านคิว `EMAIL` (ไม่บล็อก HTTP)
3. **Rate limit ต่ออีเมล** ด้วย Redis (`OTP_RATE_LIMIT_*`) ป้องกัน brute force / spam
4. `verifyOtp` ตรวจ expiry + bcrypt แล้วออก JWT

### OTP (ลูกค้าแอป — เบอร์โทร + ThaiBulkSMS)

1. `POST /auth/customer/otp/request` — สร้างแถว `otp_verifications`: โหมด **provider** เก็บ `TBS:<token>` + ส่ง SMS ผ่าน Thai Bulk OTP API; โหมด **sms** เก็บ **bcrypt** ของรหัส 4 หลัก + ส่งข้อความผ่าน `/sms`
2. Rate limit ขอ OTP ต่อเบอร์ (`OTP_RATE_LIMIT_*`) + จำกัดความพยายาม verify ผิด (`OTP_VERIFY_*`)
3. `verifyOtp` — แถว `TBS:` เรียก Thai Bulk OTP verify; แถว `$2` ใช้ `bcrypt.compare`

### LINE Auth

1. แลก `code` เป็น access token ผ่าน LINE OAuth (`integrations/line/line.login.ts`)
2. ดึงโปรไฟล์ LINE แล้ว map `lineUserId` → `User`
3. ออก JWT เหมือน flow ปกติ
4. หลัง mutation โปรไฟล์ที่มีผลต่อ `/users/me` จะ **ลบแคชโปรไฟล์** (`usersService.invalidateProfileCache`)

**แอปลูกค้า (ผ่อนชำระ):** การผูก LINE และ `line_user_id` สำหรับส่งข้อความเก็บที่ **`customer_liff_links`** — `POST /me/line/link` อัปเดตแถวนี้ในโค้ด; `LEGACY_LINE_LINK_UPDATE_SQL` ว่างได้ถ้าไม่ต้องเขียนกลับ legacy

### เครื่องมือแอดมิน — ทดสอบ LINE OA

- `GET /admin/tools/line-oa/templates` — รายการเทมเพลตข้อความ/Flex สำหรับทดสอบ
- `POST /admin/tools/line-oa/test-push` — ยิง Push จริงด้วย `LINE_CHANNEL_ACCESS_TOKEN`; ต้องมี `line_user_id` ใน `customer_liff_links` สำหรับ `legacyCustomerId` ที่ส่งมา (ดู `API_DOCUMENTATION.md`)

---

## 5. File Upload Flow

1. **รับสตรีม:** `POST /uploads/stream` ใช้ busboy บน `IncomingMessage` เขียนไฟล์ลง `TEMP_UPLOAD_DIR` ด้วย `pipeline` (ไม่ buffer ทั้งไฟล์ใน memory)
2. ตรวจ MIME whitelist, จำกัดขนาด/จำนวนไฟล์
3. บันทึก metadata ลง `FileUpload` สถานะ `TEMP`
4. **Commit:** อ่านไฟล์ temp → `sharp` (จำกัดพิกเซล + sequentialRead) แปลง WebP → `storage.putObject` → อัปเดต `COMMITTED` → enqueue งานประมวลผลรูปเบาๆ ในคิว `IMAGE`
5. **Rollback:** ลบ temp + อัปเดตสถานะ `FAILED`

---

## 6. Queue System (BullMQ)

- **Connection:** Redis URL เดียวกับ rate limit / cache
- **คิวหลัก:** `EMAIL`, `NOTIFICATION`, `WEBHOOK`, `IMAGE`, `CLEANUP` (ดู `core/queue/queues.ts`)
- **Default job options:** `attempts: 5`, exponential backoff, `removeOnComplete` / `removeOnFail` จำกัดความจุ Redis
- **Worker:** แยก process (`npm run worker`) concurrency ต่อคิว; ตั้ง `lockDuration`, `stalledInterval`, `maxStalledCount` เพื่อลดงานค้างปลอม

### Job lifecycle

`queue.add` → Redis list/stream → Worker ดึงงาน → processor ทำงาน → complete/fail → retry ตาม backoff → เกิน attempts แล้วไป dead/fail log

---

## 7. Notification System

- **แอปลูกค้า:** แถว `notifications` (โดเมน Prisma: `CustomerAppNotification`) สำหรับ in-app — รวมถึงหลัง `POST /integrations/installment-notify` (เขียนด้วย `INSERT` แบบ raw)
- **LINE:** `installment-posting-notify.service` enqueue งาน `installment_line` ไปคิว `NOTIFICATION` — worker (`notification.processor.ts`) ส่งข้อความผ่าน LINE Messaging API เมื่อตั้งค่า token แล้ว — ดึง `line_user_id` จาก SQL `LEGACY_GET_LINE_USER_BY_CUSTOMER_SQL` (แนะนำอ่านจาก `customer_liff_links`)
- **อีเมล / webhook ออก:** ยังใช้คิว `EMAIL` / `WEBHOOK` ตามเดิมสำหรับฟีเจอร์ภายใน

---

## 8. Payment / งวดผ่อน (แยกระบบ)

1. ลูกค้า `POST /me/payments/qr` ได้ PromptPay payload สำหรับสร้าง QR
2. ลูกค้าโอนเงินจริงนอกระบบ
3. **ระบบตัดงวดขององค์กร** รับ bill payment จากธนาคารและตัดงวดในฐาน legacy เดิม
4. ระบบนั้น **POST** `POST /api/v1/integrations/installment-notify` พร้อม `cusId` (หรือ `legacyCustomerId`), `status` และ secret (`Authorization: Bearer` หรือ `X-Installment-Integration-Secret`) — API นี้คิวส่ง LINE + สร้างแถว in-app และ bump แคช legacy
5. `LEGACY_MARK_INSTALLMENT_PAID_SQL` ไม่ถูกเรียกจากแอปนี้แล้ว (ใช้เฉพาะสคริปต์/ระบบภายนอกถ้าต้องการ)

---

## 9. Webhook Flow

### Inbound (`POST /api/v1/webhooks/inbound`)

1. อ่าน raw body เป็น string (สำคัญต่อการ verify HMAC)
2. ตรวจ `X-Webhook-Signature` แบบ timing-safe
3. Validate JSON ด้วย Zod
4. ถ้ามี `issuedAt` ตรวจ skew ตาม `WEBHOOK_INBOUND_MAX_SKEW_MS`
5. ถ้ามี `webhookId` ใช้ Redis `SET NX` กันซ้ำภายหน้าต่าง 10 นาที
### Outbound

`integrations/webhook/webhook.dispatcher.ts` ลงนาม payload และส่งผ่านคิว `WEBHOOK` (retry/backoff)

---

## 10. Logging System

- **Winston** — console + rotating file
- **HTTP log** toggle ด้วย `HTTP_LOG_ENABLED`
- **Audit** แยก channel (`auditLogger`) สำหรับการกระทำ admin สำคัญ
- **Redaction:** ฟิลด์ชื่อคล้าย password/token/secret ถูก mask เป็น `[REDACTED]` ก่อน serialize JSON

---

## 11. Security Overview

| หัวข้อ | การป้องกัน |
|--------|------------|
| Input | Zod บน OpenAPI routes; webhook schema เข้มขึ้น |
| AuthN | JWT HS256 + refresh แยก secret |
| AuthZ | `authMiddleware` + `requireStaff` + `requirePermission` |
| Rate limit | Redis per IP + route + abuse block |
| OTP | แอดมิน: hash ใน `Otp` + rate limit อีเมล — ลูกค้า: bcrypt ใน `otp_verifications` + rate limit เบอร์ + verify attempts |
| Legacy SQL | statement จาก env ผ่าน `assertSafeLegacySql` + พารามิเตอร์ `?` เท่านั้น |
| IDOR สัญญา | รายละเอียดสัญญา/งวดผ่าน `customer-legacy-cached.service` ตรวจว่า `contractRef` อยู่ในรายการสัญญาของลูกค้า |
| Upload | MIME/size limit, sanitize ชื่อไฟล์, sharp limit พิกเซล |
| Idempotency | DB table + unique key บน order/payment + race handling |
| Errors | `onError` คืนข้อความทั่วไป ไม่เปิด stack ให้ client |

---

## 12. Deployment Guide

### Environment

คัดลอก `.env` / `.env.prod` ให้ครบตาม `core/env/config.ts` โดยเฉพาะ:

- `DATABASE_URL`, `REDIS_URL`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (ความยาว ≥ 32)
- `WEBHOOK_SIGNING_SECRET` (≥ 16)
- `INSTALLMENT_INTEGRATION_SECRET` (≥ 16) — สำหรับ `POST /integrations/installment-notify` จากระบบตัดงวด
- S3 / SMTP / LINE ตามการใช้งานจริง

### คำสั่ง

```bash
npm ci
npx prisma migrate deploy
npm run build
npm run start        # API
npm run worker       # BullMQ workers แยก process
```

### Production checklist

- [ ] ปิด CORS `*` ระบุ origin จริง
- [ ] เปิด `METRICS_ENABLED` และ scrape `/metrics` หลัง auth edge ถ้าจำเป็น
- [ ] ตั้ง `LOG_LEVEL`/rotation ตามนโยบายองค์กร
- [ ] Backup DB + Redis persistence policy
- [ ] ตรวจ quota อัปโหลดและ disk temp
- [ ] ตรวจสอบว่ามี worker รันคู่กับ API เสมอเมื่อใช้งานคิว

---

## 13. Caching (Redis)

| ทรัพยากร | Key pattern | TTL | Invalidation |
|----------|-------------|-----|----------------|
| รายการสินค้า | `cache:products:list:{ver}:{hash}` | `CACHE_PRODUCTS_LIST_TTL_SEC` | `INCR cache:ver:products:list` + ลบ detail เมื่อ CUD สินค้า |
| รายละเอียดสินค้า | `cache:products:detail:{id}` | `CACHE_PRODUCT_DETAIL_TTL_SEC` | `DEL` เมื่อ update/delete สินค้านั้น |
| โปรไฟล์ผู้ใช้ | `cache:user:profile:{userId}` | `CACHE_USER_PROFILE_TTL_SEC` | `DEL` หลัง OTP/LINE เปลี่ยนข้อมูลที่มีผลต่อ `/users/me` |
| Runtime config | `cache:public:runtime-config` | `CACHE_PUBLIC_CONFIG_TTL_SEC` | โดยทั่วไปรีสตาร์ทเซิร์ฟเวอร์หลังเปลี่ยน env |
| โปรโมชันสาธารณะ | `cache:public:promotions:active` | `CACHE_PUBLIC_PROMOTIONS_TTL_SEC` | `invalidatePublicPromotionsCache()` หลังแอดมินสร้าง/แก้โปรโมชัน |
| บทความ / คู่มือ | `cache:public:articles:list`, `cache:public:guides:list` | `CACHE_PUBLIC_*` | เรียก invalidate จากแอดมินเมื่อมี CRUD (ขยายในอนาคต) |
| Legacy ลูกค้า | `cache:leg:contracts:{ver}:{cusId}` ฯลฯ | `CACHE_LEGACY_*` | `INCR cache:ver:cust:{cusId}` หลังผูก LINE หรือหลัง `POST /integrations/installment-notify` |

ปิดแคชได้ด้วย `CACHE_ENABLED=false` (เช่นใน test ที่ไม่มี Redis ถาวร)

---

## 14. Performance Notes

- **Legacy SQL:** แคชผลลัพธ์รายการสัญญา / รายละเอียด / งวด / ใบเสร็จ ต่อลูกค้าด้วย Redis + เวอร์ชัน bust (`customer-legacy-cached.service.ts`)
- **CMS สาธารณะ:** โปรโมชัน / บทความ / คู่มือ ผ่าน `cmsPublicService` + TTL ตาม env
- **ดัชนี MariaDB legacy:** คำแนะนำอยู่ที่ `sql/manual/002_suggested_legacy_indexes.sql` (ปรับชื่อตาราง/คอลัมน์ให้ตรงองค์กร)
- โมดูลอีคอมเมิร์ซเดิม (สินค้า/ออเดอร์) ถูกถอดออกจาก router แล้ว; ประโยชน์ด้าน performance ของคิวรีสินค้าในเอกสารเก่าอาจไม่ใช้งาน

---

## 15. Legacy SQL (MariaDB)

- ทุก statement ถูกโหลดจาก env (`LEGACY_*_SQL`) และรันผ่าน `legacyQuery` — พารามิเตอร์ผูกเป็น `?` เท่านั้น
- `assertSafeLegacySql` อนุญาตเฉพาะคำสั่งที่ขึ้นต้นด้วย `SELECT` / `WITH` / `UPDATE` และห้ามหลาย statement ในสตริงเดียว
- องค์กรต้องปรับ SQL ให้เลือกคอลัมน์ที่จำเป็น (หลีกเลี่ยง `SELECT *` ในสภาพแวดล้อมจริง) และเพิ่มดัชนีบนตาราง legacy ตาม `EXPLAIN`

---

เอกสารนี้สอดคล้องกับ `PROJECT_SPEC.md` และโค้ดใน repo ณ เวลาที่อัปเดตล่าสุด

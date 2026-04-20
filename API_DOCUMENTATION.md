# API Documentation — SKM Easy Installment Platform

เอกสาร endpoint ฝั่ง **Hono** — base path **`/api/v1`**  
รูปแบบตอบกลับมาตรฐาน: `{ success, data, message, meta }`

---

## สรุปการเปลี่ยนแปลงล่าสุด (อ่านก่อน integrate)

| หัวข้อ | รายละเอียด |
|--------|-------------|
| **Legacy SQL** | ไม่เก็บ statement ใน `.env` — ใส่เป็นไฟล์ `.sql` ใน `config/legacy-sql/` (หรือโฟลเดอร์ที่ `LEGACY_SQL_DIR` ชี้) ดู mapping ชื่อไฟล์ด้านล่าง |
| **ฐานข้อมูลแอป** | เชื่อมต่อด้วย **`mysql2`** pool — โค้ดเรียกผ่าน shim `prisma.$queryRawUnsafe` / `$executeRawUnsafe` ใน `src/core/db/client.ts` (ไม่มี Prisma ORM / migrate ใน repo นี้) |
| **แคช / rate limit** | ใช้ **`runtimeKv`** (in-memory ในโปรเซสเดียวกับ API) — **ไม่**พึ่ง Redis สำหรับ public CMS; OTP / rate limit / dedupe ใช้คีย์ใน memory (รีสตาร์ทแล้วหาย) |
| **ค่าที่ย้ายออกจาก env** | JWT TTL, HTTP/audit log, rate limit, OTP tuning, ขนาดอัปโหลด, ชื่อแบรนด์ Flex ฯลฯ อยู่ที่ **`src/core/constants.ts`** |

---

## Legacy SQL ↔ ชื่อไฟล์ (`LEGACY_SQL_DIR`, default `config/legacy-sql`)

| ความหมายเดิม (ชื่อ env เก่า) | ไฟล์ที่ใช้แทน |
|------------------------------|----------------|
| ลูกค้าตามเบอร์ | `acc-cus-by-phone.sql` |
| รายการสัญญา | `contracts-by-customer.sql` |
| รายละเอียดสัญญา | `contract-detail.sql` |
| งวดผ่อน | `installments-by-contract.sql` |
| ใบเสร็จ | `receipts-by-customer.sql` |
| LINE user สำหรับ Push | `line-user-by-customer.sql` (แนะนำ `SELECT … FROM customer_liff_links WHERE legacy_customer_id = ?`) |
| อัปเดตลิงก์ LINE (legacy) | `line-link-update.sql` — **ออปชัน** ว่างได้ (โค้ดอัปเดต `customer_liff_links` เป็นหลัก) |
| ทำเครื่องหมายงวดจ่าย (เครื่องมือภายนอก) | `mark-installment-paid.sql` — ออปชัน |

รายละเอียดการเขียน SQL และพารามิเตอร์ `?` ดู **`DEVELOPMENT_RULES.md`**

---

## Auth ลูกค้าแอป (เบอร์โทร)

| Method | Path | คำอธิบาย |
|--------|------|-----------|
| POST | `/auth/customer/otp/request` | body `{ phone }` → ส่ง SMS OTP |
| POST | `/auth/customer/otp/verify` | body `{ phone, refCode, otpCode }` — `otpCode` ตัวเลข **4 หลัก** → `accessToken` |

---

## ลูกค้า (ต้อง `Authorization: Bearer` + role customer)

| Method | Path | คำอธิบาย |
|--------|------|-----------|
| GET | `/me/profile` | ข้อมูลจาก `acc-cus-by-phone.sql` |
| GET | `/me/contracts` | รายการสัญญา — `contracts-by-customer.sql` |
| GET | `/me/contracts/{contractRef}` | รายละเอียด — `contract-detail.sql` |
| GET | `/me/contracts/{contractRef}/installments` | งวด — `installments-by-contract.sql` |
| GET | `/me/receipts` | ใบเสร็จ — `receipts-by-customer.sql` |
| POST | `/me/line/link` | ผูก LINE — อัปเดต `customer_liff_links` ในโค้ด; `line-link-update.sql` เป็นออปชัน |
| POST | `/me/payments/qr` | body `{ amountBaht }` → PromptPay payload |
| GET | `/me/support/tickets` | ตั๋วของลูกค้า |
| POST | `/me/support/tickets` | สร้างตั๋ว |

---

## แจ้งเตือน in-app (JWT เดียวกัน)

กรองด้วย `idno` = รหัสลูกค้า legacy ให้ตรงกับ JWT `sub` (เช่น `COMPID:IDNO`)

| Method | Path |
|--------|------|
| GET | `/notifications` |
| PATCH | `/notifications/{id}/read` |

---

## ระบบตัดงวด → แจ้งเตือน (ไม่ใช้ JWT ของลูกค้า)

| Method | Path | คำอธิบาย |
|--------|------|-----------|
| POST | `/integrations/installment-notify` | แนะนำ header **`X-Api-Key: <INSTALLMENT_POSTING_API_KEY>`** — รองรับ **`Authorization: Bearer <INSTALLMENT_INTEGRATION_SECRET>`** (legacy) — body: `cusId` / `legacyCustomerId`, `status`, ฟิลด์ Flex, `requestId?` กันซ้ำ |

---

## Webhook เข้า (ไม่ใช้ JWT — ใช้ HMAC)

| Method | Path | คำอธิบาย |
|--------|------|-----------|
| POST | `/webhooks/inbound` | Header `X-Webhook-Signature: sha256=<hex>` คู่กับ `WEBHOOK_SIGNING_SECRET` |

---

## สาธารณะ (ไม่ต้อง JWT)

| Method | Path |
|--------|------|
| GET | `/public/promotions` |
| GET | `/public/articles` |
| GET | `/public/guides` |
| GET | `/public/runtime-config` |

อ่านข้อมูล CMS จาก MariaDB โดยตรง (ไม่มี Redis แคชในรุ่นปัจจุบัน)

---

## Auth ผู้ใช้ระบบเดิม (ตาราง `User` ใน MariaDB — raw SQL เท่านั้น)

| Method | Path | หมายเหตุ |
|--------|------|-----------|
| POST | `/auth/login` | email + password — **บัญชี `isStaff` ห้ามใช้เส้นนี้** (ใช้ Better Auth แทน) |
| POST | `/auth/otp/request` + `/auth/otp/verify` | OTP อีเมล — รหัส **4 หลัก** |
| GET | `/users/me` | ไม่รองรับ role `customer` |

---

## Better Auth — แอดมิน back-office

| รายการ | ค่า |
|--------|-----|
| Base path | `/api/v1/admin-auth` |
| ตาราง DB | `admin_auth_user`, `admin_auth_session`, `admin_auth_account`, `admin_auth_verification` |
| Env ฝั่ง API | `BETTER_AUTH_URL` = origin ของ API (production บังคับ), `BETTER_AUTH_SECRET` (ไม่ตั้งใช้ `JWT_ACCESS_SECRET`) |
| ทดสอบ CLI | `npm run test:admin-auth` — ต้องมี DB + ตาราง `admin_auth_*` และ seed แอดมิน (`npm run seed:admin`) |

เว็บแอดมินเรียก Better Auth client ที่ base URL ข้างบน พร้อม `credentials: 'include'` และ `CORS_ORIGINS` / `ADMIN_APP_ORIGINS` ต้องรวม origin ของแอดมิน

---

## Admin (`/api/v1/admin` + cookie session จาก Better Auth)

| Method | Path |
|--------|------|
| GET | `/admin/dashboard/summary` |
| GET | `/admin/promotions` |
| POST | `/admin/promotions` |
| GET | `/admin/support/tickets` |
| POST | `/admin/support/tickets/{id}/reply` | body `{ adminReply, status? }` |
| GET | `/admin/tools/line-oa/templates` | เทมเพลตทดสอบส่ง LINE |
| POST | `/admin/tools/line-oa/test-push` | body `{ legacyCustomerId, template }` — ต้องมีแถว `customer_liff_links` |

---

## อ้างอิงเพิ่มเติม

- **`DEVELOPMENT_RULES.md`** — legacy, SMS, migration SQL, แอดมิน
- **`DATABASE_DOCUMENTATION.md`** — ตารางและความสัมพันธ์
- **`src/core/env/config.ts`** — รายการ env ที่ validate ด้วย Zod
- **`src/core/constants.ts`** — ค่าคงที่ runtime ที่ไม่ผ่าน env

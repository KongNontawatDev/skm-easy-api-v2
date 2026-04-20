# API Documentation — SKM Easy Installment Platform

Base path: `/api/v1`  
Response มาตรฐาน: `{ success, data, message, meta }`

**หมายเหตุล่าสุด**

- `GET /public/promotions`, `/public/articles`, `/public/guides` ใช้ **Redis แคช** (TTL ตาม env `CACHE_PUBLIC_*`) — หลังแอดมินสร้างโปรโมชันระบบจะ invalidate แคชโปรโมชัน
- `GET /me/contracts*` และ `/me/receipts` แคชผล legacy SQL ต่อลูกค้า — invalidate เมื่อผูก LINE หรือหลัง `POST /integrations/installment-notify` (แจ้งเตือน)
- **LINE / legacy:** ดึง `line_user_id` สำหรับแจ้งเตือนใช้ `LEGACY_GET_LINE_USER_BY_CUSTOMER_SQL` (แนะนำชี้ไปตาราง `customer_liff_links`) — `LEGACY_LINE_LINK_UPDATE_SQL` ว่างได้ (โค้ดอัปเดตโปรไฟล์ที่ `customer_liff_links` แล้ว) ดู `DEVELOPMENT_RULES.md`

## Auth ลูกค้าแอป (เบอร์โทร)

| Method | Path | คำอธิบาย |
|--------|------|-----------|
| POST | `/auth/customer/otp/request` | body `{ phone }` → ส่ง SMS OTP |
| POST | `/auth/customer/otp/verify` | body `{ phone, refCode, otpCode }` — `otpCode` ตัวเลข **4 หลัก** → `accessToken` |

## ลูกค้า (ต้อง `Authorization: Bearer` + role customer)

| Method | Path | คำอธิบาย |
|--------|------|-----------|
| GET | `/me/profile` | ข้อมูลจาก `LEGACY_ACC_CUS_BY_PHONE_SQL` |
| GET | `/me/contracts` | รายการสัญญา — `LEGACY_CONTRACTS_BY_CUSTOMER_SQL` |
| GET | `/me/contracts/{contractRef}` | รายละเอียด — `LEGACY_CONTRACT_DETAIL_SQL` |
| GET | `/me/contracts/{contractRef}/installments` | งวด — `LEGACY_INSTALLMENTS_BY_CONTRACT_SQL` |
| GET | `/me/receipts` | ใบเสร็จ — `LEGACY_RECEIPTS_BY_CUSTOMER_SQL` |
| POST | `/me/line/link` | ผูก LINE — อัปเดต `customer_liff_links` ในโค้ด; `LEGACY_LINE_LINK_UPDATE_SQL` เป็นออปชัน (ว่างได้) |
| POST | `/me/payments/qr` | body `{ amountBaht }` → PromptPay payload |
| GET | `/me/support/tickets` | ตั๋วของลูกค้า |
| POST | `/me/support/tickets` | สร้างตั๋ว |

## แจ้งเตือน (JWT เดียวกัน — กรองด้วย `idno` = รหัสลูกค้า legacy เช่น `COMPID:IDNO` ตาม JWT `sub` ต้องตรงกับค่าที่บันทึกในแถว `notifications`)

| Method | Path |
|--------|------|
| GET | `/notifications` |
| PATCH | `/notifications/{id}/read` |

## ระบบตัดงวด → แจ้งเตือน (ไม่ใช้ JWT — secret แยกจาก webhook)

| Method | Path | คำอธิบาย |
|--------|------|-----------|
| POST | `/integrations/installment-notify` | `Authorization: Bearer <INSTALLMENT_INTEGRATION_SECRET>` หรือ `X-Installment-Integration-Secret` — body: `cusId` / `legacyCustomerId`, `status`, ฟิลด์ Flex (`lineFlexKind`, `dueDate`, `amountBaht`, …), `requestId?` กันซ้ำ |

## Webhook เข้า (ไม่ใช้ JWT — ใช้ HMAC)

| Method | Path | คำอธิบาย |
|--------|------|-----------|
| POST | `/webhooks/inbound` | Header `X-Webhook-Signature: sha256=<hex>` คู่กับ `WEBHOOK_SIGNING_SECRET` — เหตุการณ์ทั่วไป (ไม่ใช่ช่องแจ้งเตือนหลังตัดงวด) |

## สาธารณะ (ไม่ต้อง JWT)

| Method | Path |
|--------|------|
| GET | `/public/promotions` |
| GET | `/public/articles` |
| GET | `/public/guides` |
| GET | `/public/runtime-config` |

## Auth ผู้ใช้ระบบเดิม (ตาราง `User` ใน MariaDB — เข้าถึงด้วย Prisma raw; ไม่รวมแอดมิน Better Auth)

| Method | Path | หมายเหตุ |
|--------|------|-----------|
| POST | `/auth/login` | email + password — **บัญชี `isStaff` ห้ามใช้เส้นนี้** (ใช้ Better Auth แทน) |
| POST | `/auth/otp/request` + `/auth/otp/verify` | OTP อีเมล — รหัส **4 หลัก** (`verify`: `code` ตัวเลข 4 หลัก) |
| GET | `/users/me` | ไม่รองรับ role `customer` |

## Better Auth — แอดมิน back-office

| รายการ | ค่า |
|--------|-----|
| Base path | `/api/v1/admin-auth` (mount ทั้งหมดของ Better Auth) |
| ตาราง DB | `admin_auth_user`, `admin_auth_session`, `admin_auth_account`, `admin_auth_verification` |
| Env ฝั่ง API | `BETTER_AUTH_URL` = origin ของ API (production บังคับ — dev ถ้าไม่ตั้งจะใช้ `http://127.0.0.1:<PORT>`), `BETTER_AUTH_SECRET` (ไม่ตั้งได้ใช้ `JWT_ACCESS_SECRET`) |
| ทดสอบ CLI | `npm run test:admin-auth` — ต้องมี DB + ตาราง `admin_auth_*` และ seed แอดมิน |

เว็บแอดมินเรียก `signIn.email` / `getSession` ผ่าน `better-auth/client` ที่ base URL ข้างบน พร้อม `credentials: 'include'` และ `CORS_ORIGINS` ต้องรวม origin ของแอดมิน

## Admin (`/api/v1/admin` + cookie session จาก Better Auth)

| Method | Path |
|--------|------|
| GET | `/admin/dashboard/summary` |
| GET | `/admin/promotions` |
| POST | `/admin/promotions` |
| GET | `/admin/support/tickets` |
| POST | `/admin/support/tickets/{id}/reply` | body `{ adminReply, status? }` |
| GET | `/admin/tools/line-oa/templates` | รายการเทมเพลตทดสอบส่ง LINE (ข้อความ / Flex) — สำหรับแอดมิน |
| POST | `/admin/tools/line-oa/test-push` | body `{ legacyCustomerId, template }` — ยิง Push LINE OA จริงตาม `LINE_CHANNEL_ACCESS_TOKEN`; ต้องมีแถว `customer_liff_links` สำหรับลูกค้านั้น |

บัญชีแอดมินตัวอย่างดู `prisma/seed.ts`

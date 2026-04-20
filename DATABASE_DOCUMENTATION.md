# เอกสารฐานข้อมูล — SKM Easy API v2

เอกสารนี้อธิบายตารางที่ระบบใช้งานจริง ความสัมพันธ์กับ **MariaDB legacy** และวิธีเข้าถึงข้อมูลผ่าน **`mysql2`** (raw SQL เท่านั้น)

---

## 1. ภาพรวม

| กลุ่ม | คำอธิบาย |
|--------|-----------|
| **Legacy** | ตารางเดิมขององค์กร (~900 ตาราง) — อ่าน/เขียนผ่าน SQL จากไฟล์ใน **`LEGACY_SQL_DIR`** (ค่าเริ่มต้น `config/legacy-sql/*.sql`) ไม่ map เป็น ORM |
| **แอปใหม่** | `otp_verifications`, `notifications`, `promotions`, `articles`, `support_tickets`, `app_guides`, `customer_liff_links`, … |
| **ระบบผู้ใช้ภายใน** | `User`, `Role`, `Permission`, `Otp` (อีเมล), `FileUpload`, `AuditLog`, `IdempotencyRecord` ฯลฯ |

การตัดงวดและรับ bill payment ทำที่ระบบองค์กร — API นี้รับ `POST /integrations/installment-notify` แล้วส่งแจ้งเตือนลูกค้า (LINE / in-app) เป็นหลัก

---

## 2. การเชื่อมต่อและเลเยอร์ข้อมูล

- **Connection pool:** `mysql2/promise` — ตั้งค่า `DATABASE_URL` (รูปแบบ `mysql://…`)
- **การเรียกใช้ในโค้ด:** `src/core/db/client.ts` ส่งออก `pool` และ object ชื่อ `prisma` ที่มีเฉพาะ `$queryRawUnsafe` / `$executeRawUnsafe` / `$disconnect` เพื่อความเข้ากันได้กับโค้ดเดิม
- **ไม่มี** Prisma schema / `prisma migrate` ใน repository นี้ — สคีมาแอปใหม่ใช้สคริปต์ SQL จากโฟลเดอร์ **`db/`** หรือ pipeline deploy ของทีม (ดู `npm run release` ใน `package.json`)

---

## 3. ตารางแอปลูกค้า / CMS

### `otp_verifications`

| คอลัมน์ | ชนิด | หมายเหตุ |
|---------|------|----------|
| id | VARCHAR(191) PK | cuid |
| phone | VARCHAR(255) | เบอร์ไทย normalize ฝั่งแอป |
| otp_code | VARCHAR(191) | **bcrypt hash** ของรหัส SMS ตัวเลข **4 หลัก** |
| ref_code | VARCHAR(64) | อ้างอิงแสดงใน SMS |
| expires_at | DATETIME(3) | หมดอายุ |
| verified_at | DATETIME(3) NULL | เวลายืนยันสำเร็จ |

ดัชนี: `(phone, ref_code)`, `expires_at`

---

### `notifications` (CustomerAppNotification)

In-app แจ้งเตือนลูกค้า — `idno` = **รหัสลูกค้า legacy** ต้องตรงกับ JWT `sub`  
ข้อมูลทดสอบ: `sql/dba/seed_sample_notifications.sql`

| คอลัมน์ | หมายเหตุ |
|---------|----------|
| title, message, type | เช่น `SUPPORT_REPLY`, `INSTALLMENT_POSTING` |
| is_read | อ่านแล้วหรือยัง |

ดัชนี: `(idno, is_read)`

---

### `promotions` / `articles` / `app_guides`

เนื้อหา CMS สาธารณะ — มีดัชนีตาม `published_at`, `is_active` และช่วงวันที่โปรโมชัน (รายละเอียดคอลัมน์ดูสคริปต์สร้างตารางใน `db/`)

---

### `support_tickets`

ตั๋วติดต่อ — `idno` = รหัสลูกค้า legacy (สอดคล้อง JWT `sub`)

---

### `customer_liff_links`

ผูก **LINE user** กับลูกค้า legacy — ใช้ร่วมกับ `line-user-by-customer.sql` (แนะนำให้ query จากตารางนี้)

---

## 4. ตารางระบบภายใน (สรุป)

- **User / Role / Permission / UserRole / RolePermission** — RBAC
- **Otp** — OTP อีเมล (`codeHash`)
- **FileUpload** — metadata อัปโหลด
- **AuditLog** — บันทึกการกระทำสำคัญ
- **IdempotencyRecord** — idempotency HTTP (ถ้าเปิดใช้)

ตารางอีคอมเมิร์ซ (`Product`, `Order`, …) อาจยังอยู่ใน DB เดียวกันแต่ไม่ถูก mount ใน router ปัจจุบัน

---

## 5. Legacy MariaDB

- อ้างอิงสคีมาจาก repo **`db/`** (`เฉพาะตารางฐานข้อมูลที่เกี่ยวข้อง.sql` ฯลฯ)
- **LINE user id สำหรับ Push:** แหล่งหลักคือ **`customer_liff_links`** + ไฟล์ `line-user-by-customer.sql`
- (ทางเลือกเก่า) คอลัมน์ LINE บน `acct_cust`: `sql/manual/001_alter_acc_cus_line.sql`
- ดัชนีแนะนำ: `sql/manual/002_suggested_legacy_indexes.sql`
- `mark-installment-paid.sql` — ออปชัน สำหรับสคริปต์/เครื่องมือภายนอก

---

## 6. Migrations / การอัปเดตสคีมา

1. ใช้สคริปต์ SQL ที่ทีมกำหนด (เช่นใน `db/` หรือ `sql/`) บน MariaDB เป้าหมาย
2. หลัง deploy ตรวจสอบ health และตาราง `admin_auth_*` ถ้าใช้ Better Auth
3. ไม่รันคำสั่ง `npx prisma migrate deploy` ใน repo นี้ — ไม่มี Prisma migration เป็นส่วนของแพ็กเกจ

---

## 7. อ้างอิง

- **`API_DOCUMENTATION.md`** — endpoint และ auth
- **`DEVELOPMENT_RULES.md`** — พารามิเตอร์ legacy SQL, การทดสอบ OTP
- **`sql/dba/HANDOFF_SKM_EASY_V2.sql`** — handoff DBA

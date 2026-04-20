# เอกสารฐานข้อมูล — SKM Easy API v2

เอกสารนี้อธิบายตารางที่ใช้งานจริงในแพลตฟอร์ม (Prisma schema + migration) และความสัมพันธ์กับ MariaDB legacy

---

## 1. ภาพรวม

| กลุ่ม | คำอธิบาย |
|--------|-----------|
| **Legacy** | ตารางเดิมขององค์กร (~900 ตาราง) — เข้าถึงผ่าน SQL ใน env เท่านั้น ไม่ map ใน Prisma |
| **แอปใหม่** | `otp_verifications`, `notifications`, `promotions`, `articles`, `support_tickets`, `app_guides` |
| **ระบบผู้ใช้ภายใน** | `User`, `Role`, `Permission`, `Otp` (อีเมล), `FileUpload`, `AuditLog`, `IdempotencyRecord` ฯลฯ |

การตัดงวดและรับ bill payment ทำที่ระบบองค์กร — API นี้รับ `POST /integrations/installment-notify` แล้วส่งแจ้งเตือนลูกค้า (LINE / in-app) เท่านั้น

---

## 2. ตารางแอปลูกค้า / CMS

### `otp_verifications`

| คอลัมน์ | ชนิด | หมายเหตุ |
|---------|------|----------|
| id | VARCHAR(191) PK | cuid |
| phone | VARCHAR(255) | เบอร์ไทย normalize ฝั่งแอป |
| otp_code | VARCHAR(191) | **bcrypt hash** ของรหัส SMS ตัวเลข **4 หลัก** |
| ref_code | VARCHAR(64) | อ้างอิงแสดงใน SMS |
| expires_at | DATETIME(3) | หมดอายุ (ค่าเริ่ม 5 นาที) |
| verified_at | DATETIME(3) NULL | เวลายืนยันสำเร็จ |

ดัชนี: `(phone, ref_code)`, `expires_at`

---

### `notifications` (CustomerAppNotification)

In-app แจ้งเตือนลูกค้า — `idno` = **รหัสลูกค้า legacy** ที่ใช้เป็น identity เดียวกับ JWT `sub` (เช่น `COMPID:IDNO` หรือรูปแบบที่ระบบออกให้) **ค่าในคอลัมน์ต้องตรงกับ `sub` ที่ลูกค้าใช้ล็อกอิน** มิฉะนั้น `GET /notifications` จะไม่เห็นแถว — ข้อมูลทดสอบใช้สคริปต์ `sql/dba/seed_sample_notifications.sql` (ลบด้วย prefix `samplenoti-` / เงื่อนไขที่สคริปต์กำหนด)

| คอลัมน์ | หมายเหตุ |
|---------|----------|
| title, message, type | เช่น `SUPPORT_REPLY`, `INSTALLMENT_POSTING` |
| is_read | อ่านแล้วหรือยัง |

ดัชนี: `(idno, is_read)`

---

### `promotions` / `articles` / `app_guides`

เนื้อหา CMS สาธารณะ — ดู schema สำหรับฟิลด์ครบถ้วน; มีดัชนีตาม `published_at`, `is_active` + ช่วงวันที่โปรโมชัน

---

### `support_tickets`

ตั๋วติดต่อ — `idno` = รหัสลูกค้า legacy (สอดคล้อง JWT `sub` / การ map จาก `acct_cust`)

---

## 3. ตารางระบบภายใน (สรุป)

- **User / Role / Permission / UserRole / RolePermission** — RBAC แอดมิน
- **Otp** — OTP อีเมล (เก็บ `codeHash`)
- **FileUpload** — อัปโหลดสตรีม
- **AuditLog** — บันทึกการกระทำสำคัญ
- **IdempotencyRecord** — idempotency HTTP (ฟีเจอร์เดิม)

ตารางอีคอมเมิร์ซ (`Product`, `Order`, …) อาจยังอยู่ใน DB แต่ไม่ถูก mount ใน router ปัจจุบัน

---

## 4. Legacy MariaDB

- สคีมาตารางอ้างอิงจาก repo `db/` (`เฉพาะตารางฐานข้อมูลที่เกี่ยวข้อง.sql` ฯลฯ) — การอ่าน/เขียน legacy กำหนดผ่าน `LEGACY_*_SQL` ใน environment
- **LINE user id สำหรับ Push:** แหล่งหลักคือตาราง **`customer_liff_links`** (Prisma) + SQL `LEGACY_GET_LINE_USER_BY_CUSTOMER_SQL` — ไม่บังคับเพิ่มคอลัมน์ LINE บน `acct_cust`
- (ทางเลือกเก่า) คอลัมน์ LINE บน `acct_cust`: `sql/manual/001_alter_acc_cus_line.sql` — ใช้เฉพาะเมื่อองค์กรยังเก็บ `line_user_id` ที่นั่น
- คู่มือดัชนีแนะนำ: `sql/manual/002_suggested_legacy_indexes.sql`
- `LEGACY_MARK_INSTALLMENT_PAID_SQL` — ออปชัน สำหรับสคริปต์/เครื่องมือภายนอก (ไม่ใช้ในโฟลว์อนุมัติผ่านแอปแล้ว)

---

## 5. Migrations

รัน `npx prisma migrate deploy` บน production หลัง build — migration ล่าสุดรวมถึงการลบตาราง `installment_payment_claims` (ถ้ามีจากชุดเก่า)

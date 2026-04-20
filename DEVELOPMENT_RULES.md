# กฎการพัฒนา — SKM Easy (ผ่อนชำระ)

## 1. ฐานข้อมูล legacy (MariaDB)

- **อ้างอิงสคีมา** จาก `db/เฉพาะตารางฐานข้อมูลที่เกี่ยวข้อง.sql` และ `db/ตารางฐานข้อมูลทั้งหมด.sql` เท่านั้น — ตารางหลักที่แอปใช้เช่น `acct_cust`, `acct_cust_address`, `hpcontract`, `hpcar`, `color_table`, `hpreceipt_header`, `hpreceipt_detail`
- การผูก LINE ใช้ตาราง **`customer_liff_links`** (ฐานเดียวกับ Prisma) — ตั้ง `LEGACY_GET_LINE_USER_BY_CUSTOMER_SQL` ให้ `SELECT line_user_id … FROM customer_liff_links WHERE legacy_customer_id = ?` และให้ `LEGACY_LINE_LINK_UPDATE_SQL` ว่างได้ (อัปเดตโปรไฟล์ LINE ทำในโค้ดที่ `customer_liff_links` แล้ว)
- (ทางเลือกเก่า) เคยแนะนำเพิ่มคอลัมน์ LINE บน `acct_cust` ผ่าน `db/alter_acct_cust_line_skm_easy.sql` — **ไม่จำเป็น** ถ้าใช้เฉพาะ `customer_liff_links` ตาม `sql/dba/HANDOFF_SKM_EASY_V2.sql`
- การอ่านสัญญา/งวด/ลูกค้า ใช้ SQL เต็มที่ตั้งใน environment — พารามิเตอร์เป็น `?` ตามลำดับใน `src/features/legacy-sql/legacy-sql.service.ts`
- **`legacyCustomerId`** ใช้รูปแบบ `COMPID` + `:` + `IDNO` (เช่น `SKM001:3100123456789`) ให้สอดคล้องกับ `hpcontract.COMPID` / `hpcontract.IDNO`
- **`contractRef`** ใช้รูปแบบ `BRANID` + `:` + `CONTNO` ให้สอดคล้องกับ `hpcontract`
- แถวจาก `LEGACY_ACC_CUS_BY_PHONE_SQL` ควรมี **`legacyCustomerId`** (alias) หรือคู่ **`COMPID`** + **`IDNO`** เพื่อออก JWT

### ตัวอย่าง SQL (ค่า default ใน `.env.dev` อิงตารางด้านบนแล้ว)

```sql
-- LEGACY_ACC_CUS_BY_PHONE_SQL (? = เบอร์ 10 หลัก รูปแบบ 0xxxxxxxxx — เทียบกับ TELNO / MOBILE หลังตัดอักขระ)
SELECT CONCAT(c.COMPID, ':', c.IDNO) AS legacyCustomerId, c.TELNO AS phone
FROM acct_cust c
LEFT JOIN acct_cust_address a ON a.COMPID = c.COMPID AND a.IDNO = c.IDNO AND a.ADRTYP IN ('02','2')
WHERE ... = ? LIMIT 1;

-- LEGACY_CONTRACTS_BY_CUSTOMER_SQL (? = legacyCustomerId = COMPID:IDNO)
SELECT CONCAT(p.BRANID, ':', p.CONTNO) AS contractRef, ...
FROM hpcontract p
LEFT JOIN hpcar car ON car.BRANID = p.BRANID AND car.CONTNO = p.CONTNO
LEFT JOIN color_table col ON col.COLOR = car.COLOR
WHERE CONCAT(p.COMPID, ':', p.IDNO) = ?;

-- LEGACY_MARK_INSTALLMENT_PAID_SQL (optional) — พารามิเตอร์ตามลำดับ: installmentRef, contractRef, legacyCustomerId
-- UPDATE hpreceipt_detail d INNER JOIN hpcontract p ON ...
-- WHERE CAST(d.INSTPERIOD AS CHAR) = ? AND CONCAT(p.BRANID, ':', p.CONTNO) = ? AND CONCAT(p.COMPID, ':', p.IDNO) = ?
```

## 2. SMS / QR

- `THAIBULKSMS_API_KEY`, `THAIBULKSMS_API_SECRET` (OTP Application) และถ้าใช้โหมด `sms` ต้องมี `THAIBULKSMS_SENDER` ตาม [เอกสาร API v2](https://developer.thaibulksms.com/reference/post_sms)
- `THAIBULKSMS_OTP_STRATEGY` — `provider` (ค่าเริ่มต้น, OTP API) หรือ `sms` (ส่งข้อความผ่าน `/sms`)
- `PROMPTPAY_BILLER_ID` = เลขพร้อมเพย์หรือเลขผู้เสียภาษีสำหรับสร้าง payload รับเงิน

### ทดสอบ OTP ในเครื่อง dev

1. Import สคีมา legacy จาก `db/เฉพาะตารางฐานข้อมูลที่เกี่ยวข้อง.sql` (หรือทั้งชุด) ลง MariaDB ที่ `DATABASE_URL` ชี้ — หรือใช้ DB แยกแล้วตั้ง `DATABASE_URL` ให้ Prisma กับ legacy เป็นคนละ instance (ถ้าแยกจริง ต้องปรับ `legacy-sql` ให้ใช้ connection ที่สอง ซึ่งยังไม่มีใน repo)
2. มีแถว `acct_cust` ที่ `TELNO` หรือที่อยู่ `ADRTYP='02'` มี `MOBILE` ตรงกับเบอร์ 10 หลัก (หลังตัด `-` /วงเล็บ)
3. ตั้งค่า Thai Bulk (`THAIBULKSMS_*`) แล้วทดสอบส่ง SMS จริง — แถว `otp_verifications` จะเป็น `TBS:<token>` (provider) หรือ bcrypt hash (sms)
4. อ่านสถานะแถว OTP: `npx tsx scripts/get-last-otp.ts <เบอร์> [refCode]`
5. ถ้าโดน rate limit OTP ให้ลบคีย์ `otp:sms:<เบอร์>` ใน Redis

### ทดสอบ Better Auth แอดมิน (`skm-admin-3`)

- `npm run test:admin-auth` — เรียก `sign-in/email` แล้ว `get-session` ผ่าน `adminAuth.handler` (ไม่ต้องเปิด HTTP server) ต้องมี DB + ตาราง `admin_auth_*` และ seed แอดมิน
- ใน **production** ต้องตั้ง `BETTER_AUTH_URL` ให้ตรง origin จริงของ API; ค่า `CORS_ORIGINS=*` จะสะท้อนเฉพาะ `localhost` / `127.0.0.1` เพื่อให้ส่งคุกกี้ได้ (ไม่ใช้ `*` กับ `credentials`)

## 3. Migration

1. `npx prisma migrate deploy` — สร้างตารางใหม่ (`otp_verifications`, `notifications`, …)
2. **ออปชัน:** รัน `sql/manual/001_alter_acc_cus_line.sql` (หรือ `db/alter_acct_cust_line_skm_easy.sql`) บน DB legacy เมื่อต้องการคอลัมน์ LINE บน `acct_cust` — **ข้ามได้** ถ้าใช้เฉพาะ `customer_liff_links` + `LEGACY_GET_LINE_USER_BY_CUSTOMER_SQL` ชี้ไปที่นั่น (ตาม `sql/dba/HANDOFF_SKM_EASY_V2.sql`)

### 3.1 โค้ด API กับ Prisma (raw เท่านั้น)

- ใน `src/` ใช้ **Prisma Client เฉพาะ** `$queryRaw` / `$queryRawUnsafe` / `$executeRaw` / `$executeRawUnsafe` / `$disconnect` (และ health check แบบ tagged template `SELECT 1`) — **ห้าม** เรียก delegate ORM เช่น `prisma.user.findMany` / `prisma.promotion.create`
- สคีมาและ migration ยังอยู่ที่ `prisma/schema.prisma` + `prisma/migrations` — ใช้เป็นสัญญากับ MariaDB และ `prisma generate`
- Better Auth ใช้ adapter ฐานข้อมูลแบบ raw ที่ `src/features/admin-auth/admin-mysql-raw.adapter.ts` (ไม่ใช้ `better-auth/adapters/prisma`)

## 4. แอปลูกค้า (Vite)

- ตั้ง `VITE_API_BASE_URL=http://localhost:3000/api/v1` (หรือ URL จริง)
- เก็บ `accessToken` ใน `localStorage` คีย์ `skm_access_token` หลัง OTP verify

## 5. แอดมิน (skm-admin-3)

- ล็อกอินด้วย `/auth/login` (บัญชี seed `admin@example.com` / `Admin1234!` — เปลี่ยนทันทีใน production)
- เรียก admin API ด้วย Bearer เดียวกับ public base + prefix `/admin`

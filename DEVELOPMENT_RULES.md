# กฎการพัฒนา — SKM Easy (ผ่อนชำระ)

เอกสารนี้สำหรับนักพัฒนา backend (`skm-easy-api-v2`) และการตั้งค่าที่เกี่ยวกับ **legacy MariaDB**, **OTP**, และ **แอดมิน**

---

## 1. ฐานข้อมูล legacy (MariaDB)

### 1.1 อ้างอิงสคีมา

ใช้เฉพาะไฟล์ใน repo **`db/`** เช่น `เฉพาะตารางฐานข้อมูลที่เกี่ยวข้อง.sql`, `ตารางฐานข้อมูลทั้งหมด.sql`  
ตารางหลักที่แอปอ่านบ่อย: `acct_cust`, `acct_cust_address`, `hpcontract`, `hpcar`, `color_table`, `hpreceipt_header`, `hpreceipt_detail`

### 1.2 Legacy SQL — ไฟล์ ไม่ใช่ env

- Statement เก็บเป็นไฟล์ `.sql` ภายใต้ **`LEGACY_SQL_DIR`** (ค่าเริ่มต้น `config/legacy-sql/`) ชื่อไฟล์ fix ตาม `src/features/legacy-sql/legacy-sql-files.ts`
- บรรทัดที่ขึ้นต้นด้วย `--` จะถูกตัดออกก่อน execute
- พารามิเตอร์เป็น `?` ตามลำดับที่ `legacy-sql.service.ts` ส่งเข้า

### 1.3 LINE และลูกค้า

- ผูก LINE ใช้ตาราง **`customer_liff_links`** (ฐานเดียวกับแอปใหม่)
- ตั้ง `line-user-by-customer.sql` ให้สอดคล้อง เช่น `SELECT line_user_id … FROM customer_liff_links WHERE legacy_customer_id = ?`
- `line-link-update.sql` **ว่างได้** — อัปเดตโปรไฟล์ LINE หลักทำที่ `customer_liff_links` ในโค้ดแล้ว
- (ทางเลือกเก่า) คอลัมน์ LINE บน `acct_cust`: `db/alter_acct_cust_line_skm_easy.sql` — ไม่จำเป็นถ้าใช้เฉพาะ `customer_liff_links` ตาม `sql/dba/HANDOFF_SKM_EASY_V2.sql`

### 1.4 รูปแบบตัวระบุ

- **`legacyCustomerId`**: `COMPID` + `:` + `IDNO` (เช่น `SKM001:3100123456789`) ให้ตรง `hpcontract.COMPID` / `hpcontract.IDNO`
- **`contractRef`**: `BRANID` + `:` + `CONTNO` ให้ตรง `hpcontract`
- ผลจาก `acc-cus-by-phone.sql` ควรมี alias **`legacyCustomerId`** หรือคู่ **`COMPID`** + **`IDNO`** เพื่อออก JWT

### 1.5 ตัวอย่าง SQL (อ้างอิงโครงสร้าง — ปรับตามองค์กรจริง)

```sql
-- acc-cus-by-phone.sql (? = เบอร์ 10 หลัก รูปแบบ 0xxxxxxxxx)
SELECT CONCAT(c.COMPID, ':', c.IDNO) AS legacyCustomerId, c.TELNO AS phone
FROM acct_cust c
LEFT JOIN acct_cust_address a ON a.COMPID = c.COMPID AND a.IDNO = c.IDNO AND a.ADRTYP IN ('02','2')
WHERE ... = ? LIMIT 1;

-- contracts-by-customer.sql (? = legacyCustomerId = COMPID:IDNO)
SELECT CONCAT(p.BRANID, ':', p.CONTNO) AS contractRef, ...
FROM hpcontract p
LEFT JOIN hpcar car ON car.BRANID = p.BRANID AND car.CONTNO = p.CONTNO
LEFT JOIN color_table col ON col.COLOR = car.COLOR
WHERE CONCAT(p.COMPID, ':', p.IDNO) = ?;

-- mark-installment-paid.sql (optional) — พารามิเตอร์ตามลำดับที่ service กำหนด
-- UPDATE ... WHERE ...
```

---

## 2. SMS / QR

- `THAIBULKSMS_API_KEY`, `THAIBULKSMS_API_SECRET` และถ้าใช้โหมด `sms` ต้องมี `THAIBULKSMS_SENDER` ตาม [เอกสาร ThaiBulkSMS](https://developer.thaibulksms.com/reference/post_sms)
- `THAIBULKSMS_OTP_STRATEGY` — `provider` (ค่าเริ่มต้น) หรือ `sms`
- PromptPay: ตั้งค่าที่เกี่ยวกับ biller ตามที่โค้ดอ่าน (ดู `src/core/env/config.ts` หากมีฟิลด์เพิ่ม)

### 2.1 ทดสอบ OTP ในเครื่อง dev

1. Import สคีมา legacy จาก `db/` ลง MariaDB ที่ `DATABASE_URL` ชี้ (หรือแยก instance — ถ้าแยกจริงต้องมี connection ที่สองในโค้ด ซึ่งยังไม่เป็นค่าเริ่มต้นใน repo)
2. มีแถว `acct_cust` ที่ `TELNO` หรือ `MOBILE` (ที่อยู่ `ADRTYP='02'`) ตรงเบอร์ 10 หลัก
3. ตั้งค่า Thai Bulk แล้วทดสอบส่ง SMS จริง
4. อ่านสถานะแถว OTP: `npx tsx scripts/get-last-otp.ts <เบอร์> [refCode]`
5. ถ้าโดน rate limit OTP: คีย์อยู่ใน **`runtimeKv`** (in-memory) — **รีสตาร์ทเซิร์ฟเวอร์** หรือรอ TTL ตาม `src/core/constants.ts` (`OTP_RATE_LIMIT_*`)

---

## 3. ฐานข้อมูลแอป (mysql2 — raw เท่านั้น)

- ใน `src/` ใช้ **`$queryRawUnsafe` / `$executeRawUnsafe`** ผ่าน `prisma` จาก `src/core/db/client.ts` — **ห้าม** เพิ่ม delegate ORM แบบ `findMany` / `create`
- Better Auth ใช้ adapter raw ที่ `src/features/admin-auth/admin-mysql-raw.adapter.ts`
- สคีมาและ migration: ใช้สคริปต์ SQL / pipeline ของทีม — ไม่มี `prisma/schema.prisma` ใน repo นี้

---

## 4. Runtime KV (เคยอ้างถึง Redis ในบางเอกสารเก่า)

- **`src/core/security/runtime-kv.ts`** — key-value ในแรมของโปรเซส API (OTP rate limit, HTTP rate limit, dedupe บางจุด)
- ไม่ต้องตั้ง Redis ใน `.env` สำหรับสิ่งเหล่านี้ — ข้อมูลหายเมื่อ restart / scale หลาย instance ไม่แชร์ state

---

## 5. ค่าคงที่ที่ไม่อยู่ใน `.env`

ดู **`src/core/constants.ts`** — JWT TTL, HTTP/audit log, rate limit, OTP bcrypt/attempt, ขนาดอัปโหลด, `LINE_FLEX_BRAND_NAME` ฯลฯ  
รายการ env ที่ parse ด้วย Zod: **`src/core/env/config.ts`** และ **`env.example`**

---

## 6. แอปลูกค้า (Vite)

- `VITE_API_BASE_URL=http://localhost:3000/api/v1` (หรือ URL จริง)
- เก็บ `accessToken` ใน `localStorage` คีย์ `skm_access_token` หลัง OTP verify

---

## 7. แอดมิน (`skm-admin-3`)

- ล็อกอินผ่าน Better Auth ที่ API — seed แอดมิน: **`npm run seed:admin`** (`scripts/seed-admin.ts`)
- เรียก admin API ด้วย cookie session + prefix `/admin` ตามที่แอดมินตั้งค่า
- ใน **production** ต้องตั้ง `BETTER_AUTH_URL` ให้ตรง origin จริงของ API; `CORS_ORIGINS=*` มีพฤติกรรมพิเศษสำหรับ localhost เพื่อคุกกี้ — ดูคอมเมนต์ใน `config.ts`

---

## 8. อ้างอิงเอกสารอื่น

- **`API_DOCUMENTATION.md`**, **`DATABASE_DOCUMENTATION.md`**, **`PROJECT_SPEC.md`**
- **`sql/dba/HANDOFF_SKM_EASY_V2.sql`**

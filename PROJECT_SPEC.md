# PROJECT_SPEC — SKM Easy API v2 (Hono + TypeScript + MariaDB)

เอกสารนี้สรุป **สถาปัตยกรรมจริงของ repository** `skm-easy-api-v2` และแนวทางออกแบบระยะยาว (บางส่วนเป็นแม่แบบ SaaS / อีคอมเมิร์ซที่ยังไม่ implement ครบในโค้ด)  
คำศัพท์เทคนิคเป็นภาษาอังกฤษ คำอธิบายหลักเป็นภาษาไทย

---

## สารบัญ

1. [ภาพรวมระบบ (ปัจจุบัน)](#1-ภาพรวมระบบ-ปัจจุบัน)
2. [สถาปัตยกรรมและเลเยอร์](#2-สถาปัตยกรรมและเลเยอร์)
3. [โครงสร้างโฟลเดอร์หลัก](#3-โครงสร้างโฟลเดอร์หลัก)
4. [การตั้งค่า: env กับ constants](#4-การตั้งค่า-env-กับ-constants)
5. [ความปลอดภัยและ observability](#5-ความปลอดภัยและ-observability)
6. [แม่แบบโดเมนระยะยาว (อ้างอิงออกแบบ)](#6-แม่แบบโดเมนระยะยาว-อ้างอิงออกแบบ)
7. [Definition of Done (PR)](#7-definition-of-done-pr)
8. [อ้างอิงเอกสารและสคริปต์](#8-อ้างอิงเอกสารและสคริปต์)

---

## 1. ภาพรวมระบบ (ปัจจุบัน)

| หัวข้อ | รายละเอียด |
|--------|-------------|
| **โดเมน** | แพลตฟอร์มผ่อนชำระรถ + แอปลูกค้า + แอดมิน CMS / support + แจ้งเตือน (in-app / LINE) |
| **Runtime** | Node.js ≥ 20, [Hono](https://hono.dev/), TypeScript **strict** |
| **HTTP API** | OpenAPI ผ่าน `@hono/zod-openapi` + Swagger UI (ตามที่ mount ในแอป) |
| **ฐานข้อมูล** | **MariaDB / MySQL** ผ่าน **`mysql2`** connection pool — เลเยอร์ข้อมูลใช้ **raw SQL เท่านั้น** (ไม่มี Prisma ORM / ไม่มี `prisma migrate` ใน repo) |
| **Legacy** | SQL อยู่ในไฟล์ **`config/legacy-sql/*.sql`** (หรือ `LEGACY_SQL_DIR`) โหลดตอนรันไทม์ |
| **แคช / rate limit ในแรม** | **`runtimeKv`** (`src/core/security/runtime-kv.ts`) — in-process key-value; **ไม่บังคับ Redis** สำหรับ API หลัก |
| **Auth** | JWT ลูกค้า (OTP โทรศัพท์), JWT + session ระบบเดิม (`User`), **Better Auth** สำหรับแอดมิน (`/admin-auth`) |
| **คิวงานหนัก** | ใน dependency ปัจจุบัน **ไม่มี BullMQ** — งานประเภทอีเมล/LINE เรียกแบบ sync/async ในโปรเซส HTTP (ออกแบบให้แยก worker ได้ในอนาคต) |

เป้าหมาย: ระบบ production-ready สำหรับ use case ผ่อนชำระ — เน้นความถูกต้องของข้อมูล legacy, ความปลอดภัยของ auth, และสัญญา API ที่ชัด

---

## 2. สถาปัตยกรรมและเลเยอร์

### 2.1 โฟลว์หลัก

```text
HTTP Request
  → router/* (mount path, middleware)
  → feature *.openapi.ts (route + Zod)
  → service / repo (ธุรกิจ + SQL)
  → mysql2 pool (`core/db/client.ts`)
```

### 2.2 กฎการพึ่งพา

| ชั้น | หน้าที่ | ห้าม |
|------|---------|------|
| Route / OpenAPI handler | validate, เรียก service, ส่ง response มาตรฐาน | SQL ad-hoc ยาว ๆ |
| Service | use case, orchestration | ลืมตรวจสิทธิ์ / ลืม idempotency จุดเสี่ยง |
| Repo / โมดูล SQL | คำสั่งต่อ DB | HTTP concerns |

- ลด **cross-import service** ข้าม feature โดยไม่จำเป็น
- Legacy แยกชัดใน `features/legacy-sql/`

### 2.3 ความทนทาน (แนวทาง)

- endpoint ที่รับ webhook / integration ควรมี **dedupe** / idempotency key เมื่อคู่ค้าอาจส่งซ้ำ
- งานที่ช้าหรือไม่จำเป็นต้อง blocking — พิจารณาแยก worker / คิวเมื่อโหลดสูงขึ้น

---

## 3. โครงสร้างโฟลเดอร์หลัก

```text
src/
  app.ts                 # ประกอบ Hono, middleware กลาง
  server.ts              # entry HTTP server
  core/
    db/client.ts         # mysql2 pool + shim `prisma.$queryRawUnsafe` / `$executeRawUnsafe`
    env/config.ts        # Zod parse env (รายการสั้นลง — เฉพาะค่าที่แยก environment จริง)
    constants.ts         # JWT TTL, rate limit, OTP, upload, ชื่อแบรนด์ Flex ฯลฯ
    security/            # JWT, rate-limit, runtime-kv, helmet, middleware auth
    http/                # errors, response shape, CORS helper
    logger/              # Winston
    health/              # health check
    scheduler/           # งาน cleanup ภายในโปรเซส (ไม่ใช้ Redis)
  features/              # โดเมน: auth, customer-auth, customer-app, admin, cms, notifications, …
  integrations/          # LINE, SMS (ThaiBulk), email
  router/                # public / admin / health รวม path
```

โฟลเดอร์ **`config/legacy-sql/`** — ไฟล์ SQL ต่อหนึ่ง use case (ดู mapping ใน `API_DOCUMENTATION.md`)

---

## 4. การตั้งค่า: env กับ constants

| แหล่ง | ใช้เมื่อไหร่ |
|-------|----------------|
| **`.env` / `env.example`** | ค่าที่เปลี่ยนตามสภาพแวดล้อม: `DATABASE_URL`, JWT secrets, SMTP, LINE tokens, ThaiBulk, `BETTER_AUTH_*`, `LEGACY_SQL_DIR`, CORS, integration secrets |
| **`src/core/constants.ts`** | ค่าที่ทีมกำหนดเป็นค่าเริ่มต้นเดียวกันทุก environment (หรือแก้ในโค้ดแทนการ deploy env ยาว ๆ) |

Validate env ตอนบูตด้วย Zod — fail fast ถ้าขาดค่าบังคับ (เช่น `DATABASE_URL`, JWT secrets)

---

## 5. ความปลอดภัยและ observability

- **RBAC / role** — แยก staff / customer / admin ตาม middleware ที่มี
- **Rate limiting** — `rate-limit.middleware.ts` + `runtimeKv`
- **OTP** — เก็บ hash, จำกัดความถี่และจำนวนครั้ง verify (`constants.ts`)
- **Logging** — Winston; ระดับและรายละเอียด request log อ้างอิง `HTTP_LOG_ENABLED` / `AUDIT_LOG_ENABLED` ใน **`constants.ts`** (ไม่ใช่ env)
- **ห้าม** log OTP หรือความลับใน plaintext

---

## 6. แม่แบบโดเมนระยะยาว (อ้างอิงออกแบบ)

ส่วนนี้สรุปแนวคิด SaaS / อีคอมเมิร์ซทั่วไป — **ใน repo นี้อาจมีตารางหรือเทมเพลตอีเมลส่วนหนึ่งแต่ไม่ได้เปิดทุก route**

| พื้นที่ | แนวทางทั่วไป |
|---------|----------------|
| Users / Orders / Payments | state machine, idempotency key, abstraction ผู้ให้บริการชำระเงิน |
| Uploads | stream → temp → commit ใน transaction + ลบไฟล์ค้างเมื่อล้มเหลว |
| Notifications | event-driven หรือ outbox + worker เมื่อมีคิว |
| Webhooks ออก | sign payload, retry, dead-letter |
| Observability | metrics (เช่น Prometheus), correlation id — ขยายตามความต้องการ deploy |

---

## 7. Definition of Done (PR)

- Input ผ่าน Zod / OpenAPI schema ที่เกี่ยวข้อง
- ไม่ฝัง business logic ยาวใน route เปล่า ๆ
- การเข้าถึง DB ผ่าน raw SQL ที่ควบคุมพารามิเตอร์ (ไม่ต่อสตริงค่าผู้ใช้เข้า SQL)
- Endpoint เสี่ยงมี logging/audit ตามความจำเป็น
- อัปเดตเอกสาร (`API_*`, `DATABASE_*`, `DEVELOPMENT_RULES`) เมื่อเปลี่ยนสัญญา env หรือ SQL file layout

---

## 8. อ้างอิงเอกสารและสคริปต์

| เอกสาร / คำสั่ง | หน้าที่ |
|-----------------|----------|
| `API_DOCUMENTATION.md` | สัญญา endpoint, legacy ไฟล์ ↔ ความหมาย |
| `DATABASE_DOCUMENTATION.md` | กลุ่มตาราง, mysql2, ไม่ใช้ Prisma migrate |
| `DEVELOPMENT_RULES.md` | legacy SQL, OTP, runtime KV, seed แอดมิน |
| `SYSTEM_DOCUMENTATION.md` | ภาพรวมระบบ (ถ้ามีรายละเอียดซ้ำ ให้ยึดเอกสารนี้ + สามไฟล์บนเป็นหลักหากขัดกัน) |
| `npm run seed:admin` | seed แอดมิน Better Auth |
| `npm run test:admin-auth` | ทดสอบ Better Auth แบบ CLI |
| `npm run release` | placeholder — ใช้ SQL / pipeline ของทีมแทน bundled migrate |

---

เอกสารนี้ใช้คู่กับ `.cursor/rules` ของโปรเจกต์ เพื่อให้การ generate โค้ดสอดคล้องกับสถาปัตยกรรมปัจจุบัน

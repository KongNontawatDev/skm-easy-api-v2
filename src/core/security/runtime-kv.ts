/**
 * เก็บ state ชั่วคราวใน memory ของโปรเซส (rate limit, dedupe, นับ OTP)
 * ไม่แชร์ระหว่างหลาย instance — เหมาะกับ deploy โหนดเดียวหรือ dev
 */
type CounterEntry = { kind: 'c'; count: number; expiresAt: number };
type StringEntry = { kind: 's'; value: string; expiresAt: number };

const store = new Map<string, CounterEntry | StringEntry>();

function nowMs(): number {
  return Date.now();
}

function getEntry(key: string): CounterEntry | StringEntry | undefined {
  const e = store.get(key);
  if (!e) return undefined;
  if (e.expiresAt <= nowMs()) {
    store.delete(key);
    return undefined;
  }
  return e;
}

/** API แบบ key-value ในแรม (เคยเรียกว่า redis ในโปรเจกต์นี้) */
export const runtimeKv = {
  async connect(): Promise<void> {
    /* no-op */
  },

  async ping(): Promise<'PONG'> {
    return 'PONG';
  },

  async get(key: string): Promise<string | null> {
    const e = getEntry(key);
    if (!e) return null;
    if (e.kind === 's') return e.value;
    return String(e.count);
  },

  async set(key: string, value: string, ...args: unknown[]): Promise<'OK' | null> {
    const ttlSec = args[0] === 'EX' && typeof args[1] === 'number' ? (args[1] as number) : null;
    const nx = args[2] === 'NX';
    if (ttlSec === null) {
      store.set(key, { kind: 's', value, expiresAt: Number.MAX_SAFE_INTEGER });
      return 'OK';
    }
    const expiresAt = nowMs() + ttlSec * 1000;
    if (nx) {
      if (getEntry(key) !== undefined) return null;
      store.set(key, { kind: 's', value, expiresAt });
      return 'OK';
    }
    store.set(key, { kind: 's', value, expiresAt });
    return 'OK';
  },

  async incr(key: string): Promise<number> {
    const e = getEntry(key);
    if (!e) {
      const n = 1;
      store.set(key, { kind: 'c', count: n, expiresAt: Number.MAX_SAFE_INTEGER });
      return n;
    }
    if (e.kind === 's') {
      const n = 1;
      store.set(key, { kind: 'c', count: n, expiresAt: e.expiresAt });
      return n;
    }
    e.count += 1;
    return e.count;
  },

  async expire(key: string, seconds: number): Promise<number> {
    const e = store.get(key);
    if (!e) return 0;
    if (e.expiresAt <= nowMs()) {
      store.delete(key);
      return 0;
    }
    e.expiresAt = nowMs() + seconds * 1000;
    return 1;
  },

  async pexpire(key: string, ms: number): Promise<number> {
    const e = store.get(key);
    if (!e) return 0;
    if (e.expiresAt <= nowMs()) {
      store.delete(key);
      return 0;
    }
    e.expiresAt = nowMs() + ms;
    return 1;
  },

  async del(key: string): Promise<number> {
    return store.delete(key) ? 1 : 0;
  },
};

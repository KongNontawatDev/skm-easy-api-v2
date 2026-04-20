/**
 * อ่านโปรโมชัน / บทความ / คู่มือสาธารณะจาก DB
 */
import dayjs from 'dayjs';
import { prisma } from '../../core/db/client.js';

export type PromotionListItem = {
  id: string;
  title: string;
  description: string;
  image: string | null;
  startDate: string | null;
  endDate: string | null;
};

/** ใช้ชื่อคอลัมน์จริงในตาราง — ไม่พึ่ง `AS camelCase` เพราะไดรเวอร์บางตัวคืน alias เป็นตัวพิมพ์เล็ก (`startdate`) ทำให้แมปผิด */
const promoPublicSelect = `SELECT \`id\`, \`title\`, \`description\`, \`image\`, \`start_date\`, \`end_date\` FROM \`promotions\``;

type PromoRowDb = {
  id: string;
  title: string;
  description: string;
  image: string | null;
  start_date: Date | string | null;
  end_date: Date | string | null;
};

function dateFieldToMs(v: Date | string | null | undefined): number | null {
  if (v == null) return null;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

function toPromotionListItem(r: PromoRowDb): PromotionListItem {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    image: r.image,
    startDate: r.start_date != null ? dayjs(r.start_date).toISOString() : null,
    endDate: r.end_date != null ? dayjs(r.end_date).toISOString() : null,
  };
}

export const cmsPublicService = {
  async listPromotionsActive(): Promise<PromotionListItem[]> {
    const now = Date.now();
    const rows = await prisma.$queryRawUnsafe<PromoRowDb[]>(
      `${promoPublicSelect} WHERE \`is_active\` = true ORDER BY \`created_at\` DESC LIMIT 80`,
    );
    const active = rows.filter((r) => {
      const startMs = dateFieldToMs(r.start_date);
      if (startMs != null && startMs > now) return false;
      const endMs = dateFieldToMs(r.end_date);
      if (endMs != null && endMs < now) return false;
      return true;
    });
    return active.map(toPromotionListItem);
  },

  /** โปรโมชันที่เปิดใช้งานและอยู่ในช่วงเวลา (เดียวกับรายการสาธารณะ) */
  async getPromotionByIdActive(id: string): Promise<PromotionListItem | null> {
    const now = Date.now();
    const rows = await prisma.$queryRawUnsafe<PromoRowDb[]>(
      `${promoPublicSelect} WHERE \`id\` = ? AND \`is_active\` = true LIMIT 1`,
      id,
    );
    const row = rows[0];
    if (!row) return null;
    const startMs = dateFieldToMs(row.start_date);
    if (startMs != null && startMs > now) return null;
    const endMs = dateFieldToMs(row.end_date);
    if (endMs != null && endMs < now) return null;
    return toPromotionListItem(row);
  },

  async listArticlesPublished() {
    return prisma.$queryRawUnsafe<
      {
        id: string;
        title: string;
        content: string;
        coverImage: string | null;
        publishedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
      }[]
    >(
      `SELECT \`id\`, \`title\`, \`content\`, \`cover_image\` AS coverImage, \`published_at\` AS publishedAt,
              \`created_at\` AS createdAt, \`updated_at\` AS updatedAt
       FROM \`articles\` WHERE \`published_at\` IS NOT NULL AND \`published_at\` <= ?
       ORDER BY \`published_at\` DESC LIMIT 50`,
      new Date(),
    );
  },

  async listGuidesOrdered() {
    return prisma.$queryRawUnsafe<
      {
        id: string;
        title: string;
        content: string;
        sortOrder: number;
        createdAt: Date;
        updatedAt: Date;
      }[]
    >(
      `SELECT \`id\`, \`title\`, \`content\`, \`sort_order\` AS sortOrder, \`created_at\` AS createdAt, \`updated_at\` AS updatedAt
       FROM \`app_guides\` ORDER BY \`sort_order\` ASC`,
    );
  },

  /** บทความที่เผยแพร่แล้ว (มี publishedAt และไม่เกินเวลาปัจจุบัน) */
  async getArticleByIdPublished(id: string) {
    const rows = await prisma.$queryRawUnsafe<
      {
        id: string;
        title: string;
        content: string;
        coverImage: string | null;
        publishedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
      }[]
    >(
      `SELECT \`id\`, \`title\`, \`content\`, \`cover_image\` AS coverImage, \`published_at\` AS publishedAt,
              \`created_at\` AS createdAt, \`updated_at\` AS updatedAt
       FROM \`articles\` WHERE \`id\` = ? AND \`published_at\` IS NOT NULL AND \`published_at\` <= ? LIMIT 1`,
      id,
      new Date(),
    );
    return rows[0] ?? null;
  },

  async getGuideById(id: string) {
    const rows = await prisma.$queryRawUnsafe<
      {
        id: string;
        title: string;
        content: string;
        sortOrder: number;
        createdAt: Date;
        updatedAt: Date;
      }[]
    >(
      `SELECT \`id\`, \`title\`, \`content\`, \`sort_order\` AS sortOrder, \`created_at\` AS createdAt, \`updated_at\` AS updatedAt
       FROM \`app_guides\` WHERE \`id\` = ? LIMIT 1`,
      id,
    );
    return rows[0] ?? null;
  },
};

/**
 * คำสั่งฐานข้อมูลแอดมิน — raw SQL ผ่าน mysql2
 */
import { prisma } from '../../core/db/client.js';
import { newDbId } from '../../core/db/new-id.js';
import type { UserRow } from '../auth/auth.repo.js';

const promoSelect = `SELECT \`id\`, \`title\`, \`description\`, \`image\`,
  \`start_date\` AS startDate, \`end_date\` AS endDate, \`is_active\` AS isActive,
  \`created_at\` AS createdAt, \`updated_at\` AS updatedAt FROM \`promotions\``;

export type PromotionRow = {
  id: string;
  title: string;
  description: string;
  image: string | null;
  startDate: Date | null;
  endDate: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const articleSelect = `SELECT \`id\`, \`title\`, \`content\`, \`cover_image\` AS coverImage,
  \`published_at\` AS publishedAt, \`created_at\` AS createdAt, \`updated_at\` AS updatedAt FROM \`articles\``;

export type ArticleRow = {
  id: string;
  title: string;
  content: string;
  coverImage: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const ticketSelect = `SELECT \`id\`, \`idno\`, \`title\`, \`description\`, \`status\`,
  \`admin_reply\` AS adminReply, \`image_url\` AS imageUrl,
  \`created_at\` AS createdAt, \`updated_at\` AS updatedAt FROM \`support_tickets\``;

export type SupportTicketRow = {
  id: string;
  idno: string;
  title: string;
  description: string;
  status: string;
  adminReply: string | null;
  imageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const guideSelect = `SELECT \`id\`, \`title\`, \`content\`, \`sort_order\` AS sortOrder,
  \`created_at\` AS createdAt, \`updated_at\` AS updatedAt FROM \`app_guides\``;

export type AppGuideRow = {
  id: string;
  title: string;
  content: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

const liffSelect = `SELECT \`id\`, \`legacy_customer_id\` AS legacyCustomerId, \`line_user_id\` AS lineUserId,
  \`customer_phone\` AS customerPhone, \`line_display_name\` AS lineDisplayName,
  \`line_picture_url\` AS linePictureUrl, \`created_at\` AS createdAt FROM \`customer_liff_links\``;

export type CustomerLiffLinkRow = {
  id: string;
  legacyCustomerId: string;
  lineUserId: string;
  customerPhone: string;
  lineDisplayName: string | null;
  linePictureUrl: string | null;
  createdAt: Date;
};

export type AdminAuthUserRow = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function num(v: bigint | number | undefined): number {
  if (v === undefined) return 0;
  return typeof v === 'bigint' ? Number(v) : Number(v);
}

export async function adminDashboardCounts(): Promise<{ openTickets: number; adminUserCount: number }> {
  const [o, a] = await Promise.all([
    prisma.$queryRawUnsafe<{ c: bigint | number }[]>(
      `SELECT COUNT(*) AS c FROM \`support_tickets\` WHERE \`status\` IN ('open','replied')`,
    ),
    prisma.$queryRawUnsafe<{ c: bigint | number }[]>(`SELECT COUNT(*) AS c FROM \`admin_auth_user\``),
  ]);
  return { openTickets: num(o[0]?.c), adminUserCount: num(a[0]?.c) };
}

export async function adminListPromotions(): Promise<PromotionRow[]> {
  return prisma.$queryRawUnsafe<PromotionRow[]>(`${promoSelect} ORDER BY \`created_at\` DESC LIMIT 200`);
}

export async function adminCreatePromotion(input: {
  title: string;
  description: string;
  image?: string;
  startDate: Date | null;
  endDate: Date | null;
  isActive: boolean;
}): Promise<PromotionRow> {
  const id = newDbId();
  const t = new Date();
  await prisma.$executeRawUnsafe(
    `INSERT INTO \`promotions\` (\`id\`,\`title\`,\`description\`,\`image\`,\`start_date\`,\`end_date\`,\`is_active\`,\`created_at\`,\`updated_at\`)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    id,
    input.title,
    input.description,
    input.image ?? null,
    input.startDate,
    input.endDate,
    input.isActive,
    t,
    t,
  );
  const rows = await prisma.$queryRawUnsafe<PromotionRow[]>(`${promoSelect} WHERE \`id\` = ? LIMIT 1`, id);
  return rows[0]!;
}

export async function adminGetPromotion(id: string): Promise<PromotionRow | null> {
  const rows = await prisma.$queryRawUnsafe<PromotionRow[]>(`${promoSelect} WHERE \`id\` = ? LIMIT 1`, id);
  return rows[0] ?? null;
}

export async function adminUpdatePromotion(
  id: string,
  patch: Partial<{
    title: string;
    description: string;
    image: string | null;
    startDate: Date | null;
    endDate: Date | null;
    isActive: boolean;
  }>,
): Promise<PromotionRow | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.title !== undefined) {
    sets.push('`title` = ?');
    vals.push(patch.title);
  }
  if (patch.description !== undefined) {
    sets.push('`description` = ?');
    vals.push(patch.description);
  }
  if (patch.image !== undefined) {
    sets.push('`image` = ?');
    vals.push(patch.image);
  }
  if (patch.startDate !== undefined) {
    sets.push('`start_date` = ?');
    vals.push(patch.startDate);
  }
  if (patch.endDate !== undefined) {
    sets.push('`end_date` = ?');
    vals.push(patch.endDate);
  }
  if (patch.isActive !== undefined) {
    sets.push('`is_active` = ?');
    vals.push(patch.isActive);
  }
  if (!sets.length) return adminGetPromotion(id);
  sets.push('`updated_at` = ?');
  vals.push(new Date());
  vals.push(id);
  await prisma.$executeRawUnsafe(
    `UPDATE \`promotions\` SET ${sets.join(', ')} WHERE \`id\` = ?`,
    ...vals,
  );
  return adminGetPromotion(id);
}

export async function adminDeletePromotion(id: string): Promise<void> {
  await prisma.$executeRawUnsafe('DELETE FROM `promotions` WHERE `id` = ?', id);
}

export async function adminListSupportTickets(): Promise<SupportTicketRow[]> {
  return prisma.$queryRawUnsafe<SupportTicketRow[]>(`${ticketSelect} ORDER BY \`created_at\` DESC LIMIT 200`);
}

export async function adminReplySupportTicket(
  id: string,
  adminReply: string,
  status: string,
): Promise<SupportTicketRow> {
  const t = new Date();
  await prisma.$executeRawUnsafe(
    'UPDATE `support_tickets` SET `admin_reply` = ?, `status` = ?, `updated_at` = ? WHERE `id` = ?',
    adminReply,
    status,
    t,
    id,
  );
  const rows = await prisma.$queryRawUnsafe<SupportTicketRow[]>(`${ticketSelect} WHERE \`id\` = ? LIMIT 1`, id);
  const row = rows[0]!;
  const nid = newDbId();
  const ntime = new Date();
  await prisma.$executeRawUnsafe(
    'INSERT INTO `notifications` (`id`,`idno`,`title`,`message`,`type`,`is_read`,`created_at`) VALUES (?,?,?,?,?,?,?)',
    nid,
    row.idno,
    'เจ้าหน้าที่ตอบข้อความของคุณ',
    adminReply.slice(0, 500),
    'SUPPORT_REPLY',
    false,
    ntime,
  );
  return row;
}

export async function adminListArticles(): Promise<ArticleRow[]> {
  return prisma.$queryRawUnsafe<ArticleRow[]>(`${articleSelect} ORDER BY \`created_at\` DESC LIMIT 200`);
}

export async function adminCreateArticle(input: {
  title: string;
  content: string;
  coverImage?: string;
  publishedAt: Date | null;
}): Promise<ArticleRow> {
  const id = newDbId();
  const t = new Date();
  await prisma.$executeRawUnsafe(
    `INSERT INTO \`articles\` (\`id\`,\`title\`,\`content\`,\`cover_image\`,\`published_at\`,\`created_at\`,\`updated_at\`)
     VALUES (?,?,?,?,?,?,?)`,
    id,
    input.title,
    input.content,
    input.coverImage ?? null,
    input.publishedAt,
    t,
    t,
  );
  const rows = await prisma.$queryRawUnsafe<ArticleRow[]>(`${articleSelect} WHERE \`id\` = ? LIMIT 1`, id);
  return rows[0]!;
}

export async function adminGetArticle(id: string): Promise<ArticleRow | null> {
  const rows = await prisma.$queryRawUnsafe<ArticleRow[]>(`${articleSelect} WHERE \`id\` = ? LIMIT 1`, id);
  return rows[0] ?? null;
}

export async function adminUpdateArticle(
  id: string,
  patch: Partial<{ title: string; content: string; coverImage: string | null; publishedAt: Date | null }>,
): Promise<ArticleRow | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.title !== undefined) {
    sets.push('`title` = ?');
    vals.push(patch.title);
  }
  if (patch.content !== undefined) {
    sets.push('`content` = ?');
    vals.push(patch.content);
  }
  if (patch.coverImage !== undefined) {
    sets.push('`cover_image` = ?');
    vals.push(patch.coverImage);
  }
  if (patch.publishedAt !== undefined) {
    sets.push('`published_at` = ?');
    vals.push(patch.publishedAt);
  }
  if (!sets.length) return adminGetArticle(id);
  sets.push('`updated_at` = ?');
  vals.push(new Date());
  vals.push(id);
  await prisma.$executeRawUnsafe(`UPDATE \`articles\` SET ${sets.join(', ')} WHERE \`id\` = ?`, ...vals);
  return adminGetArticle(id);
}

export async function adminDeleteArticle(id: string): Promise<void> {
  await prisma.$executeRawUnsafe('DELETE FROM `articles` WHERE `id` = ?', id);
}

export async function adminListGuides(): Promise<AppGuideRow[]> {
  return prisma.$queryRawUnsafe<AppGuideRow[]>(`${guideSelect} ORDER BY \`sort_order\` ASC LIMIT 200`);
}

export async function adminCreateGuide(input: {
  title: string;
  content: string;
  sortOrder: number;
}): Promise<AppGuideRow> {
  const id = newDbId();
  const t = new Date();
  await prisma.$executeRawUnsafe(
    `INSERT INTO \`app_guides\` (\`id\`,\`title\`,\`content\`,\`sort_order\`,\`created_at\`,\`updated_at\`) VALUES (?,?,?,?,?,?)`,
    id,
    input.title,
    input.content,
    input.sortOrder,
    t,
    t,
  );
  const rows = await prisma.$queryRawUnsafe<AppGuideRow[]>(`${guideSelect} WHERE \`id\` = ? LIMIT 1`, id);
  return rows[0]!;
}

export async function adminUpdateGuide(
  id: string,
  patch: Partial<{ title: string; content: string; sortOrder: number }>,
): Promise<AppGuideRow | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.title !== undefined) {
    sets.push('`title` = ?');
    vals.push(patch.title);
  }
  if (patch.content !== undefined) {
    sets.push('`content` = ?');
    vals.push(patch.content);
  }
  if (patch.sortOrder !== undefined) {
    sets.push('`sort_order` = ?');
    vals.push(patch.sortOrder);
  }
  if (!sets.length) {
    const rows = await prisma.$queryRawUnsafe<AppGuideRow[]>(`${guideSelect} WHERE \`id\` = ? LIMIT 1`, id);
    return rows[0] ?? null;
  }
  sets.push('`updated_at` = ?');
  vals.push(new Date());
  vals.push(id);
  await prisma.$executeRawUnsafe(`UPDATE \`app_guides\` SET ${sets.join(', ')} WHERE \`id\` = ?`, ...vals);
  const rows = await prisma.$queryRawUnsafe<AppGuideRow[]>(`${guideSelect} WHERE \`id\` = ? LIMIT 1`, id);
  return rows[0] ?? null;
}

export async function adminGetGuide(id: string): Promise<AppGuideRow | null> {
  const rows = await prisma.$queryRawUnsafe<AppGuideRow[]>(`${guideSelect} WHERE \`id\` = ? LIMIT 1`, id);
  return rows[0] ?? null;
}

export async function adminDeleteGuide(id: string): Promise<void> {
  await prisma.$executeRawUnsafe('DELETE FROM `app_guides` WHERE `id` = ?', id);
}

export async function adminListCustomerLiffLinks(
  legacyCustomerId?: string,
  take = 200,
): Promise<CustomerLiffLinkRow[]> {
  if (legacyCustomerId) {
    return prisma.$queryRawUnsafe<CustomerLiffLinkRow[]>(
      `${liffSelect} WHERE \`legacy_customer_id\` = ? ORDER BY \`created_at\` DESC LIMIT ?`,
      legacyCustomerId,
      take,
    );
  }
  return prisma.$queryRawUnsafe<CustomerLiffLinkRow[]>(
    `${liffSelect} ORDER BY \`created_at\` DESC LIMIT ?`,
    take,
  );
}

export async function adminListAuthUsers(): Promise<AdminAuthUserRow[]> {
  return prisma.$queryRawUnsafe<AdminAuthUserRow[]>(
    `SELECT \`id\`, \`name\`, \`email\`, \`emailVerified\`, \`image\`, \`createdAt\`, \`updatedAt\` FROM \`admin_auth_user\` ORDER BY \`createdAt\` DESC LIMIT 200`,
  );
}

export async function adminListLegacyStaffUsers(): Promise<UserRow[]> {
  return prisma.$queryRawUnsafe<UserRow[]>(
    'SELECT * FROM `User` WHERE `deletedAt` IS NULL AND `isStaff` = true ORDER BY `createdAt` DESC LIMIT 200',
  );
}

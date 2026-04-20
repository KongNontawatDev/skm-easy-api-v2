/**
 * ทดสอบแบบไม่ต้องมี DB — ตรวจ helper อัปโหลด CMS
 * รัน: npx tsx scripts/test-cms-upload-sanity.ts
 */
import assert from 'node:assert/strict';
import { extensionForMime, CMS_FILES_URL_PREFIX, publicUrlForCmsFile } from '../src/features/cms/cms-upload.service.js';

assert.equal(extensionForMime('image/png'), '.png');
assert.equal(extensionForMime('image/jpeg'), '.jpg');
assert.equal(extensionForMime('image/webp'), '.webp');
assert.equal(extensionForMime('text/plain'), null);

const url = publicUrlForCmsFile('promotions/testid.jpg');
assert.ok(url.startsWith(CMS_FILES_URL_PREFIX));
assert.ok(url.includes('promotions/testid.jpg'));

console.log('test-cms-upload-sanity: OK');

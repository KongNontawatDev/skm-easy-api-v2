/**
 * ค่าคอนฟิก runtime ที่ปลอดภัยต่อการเปิดเผยต่อ client
 */
export type PublicRuntimeConfig = {
  currency: string;
  app: { kind: 'installment'; paymentVerification: 'manual' };
};

export const publicConfigService = {
  get(): PublicRuntimeConfig {
    return {
      currency: 'THB',
      app: { kind: 'installment', paymentVerification: 'manual' },
    };
  },
};

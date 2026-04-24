const SID_BUCKET_PALETTE = [
  { fill: '#fef3c7', border: '#f59e0b', text: '#92400e', softText: '#b45309' },
  { fill: '#dbeafe', border: '#2563eb', text: '#1d4ed8', softText: '#2563eb' },
  { fill: '#dcfce7', border: '#16a34a', text: '#166534', softText: '#15803d' },
  { fill: '#ede9fe', border: '#7c3aed', text: '#5b21b6', softText: '#6d28d9' },
  { fill: '#fee2e2', border: '#dc2626', text: '#991b1b', softText: '#b91c1c' },
  { fill: '#ffedd5', border: '#f97316', text: '#9a3412', softText: '#c2410c' },
  { fill: '#e0f2fe', border: '#0891b2', text: '#0e7490', softText: '#0891b2' },
  { fill: '#fce7f3', border: '#db2777', text: '#9d174d', softText: '#be185d' },
  { fill: '#e2e8f0', border: '#475569', text: '#334155', softText: '#475569' }
];

export function getSidBucketNumber(sid) {
  const numericSid = Number(String(sid ?? '').trim());

  if (!Number.isFinite(numericSid) || numericSid < 1000) {
    return null;
  }

  return Math.floor(numericSid / 1000);
}

export function getSidBucketTheme(sid) {
  const bucketNumber = getSidBucketNumber(sid);

  if (!bucketNumber) {
    return null;
  }

  return SID_BUCKET_PALETTE[(bucketNumber - 1) % SID_BUCKET_PALETTE.length];
}

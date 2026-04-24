import { getSidBucketNumber, getSidBucketTheme } from './sidBuckets';

describe('sid bucket helpers', () => {
  it('groups SIDs by thousand bucket', () => {
    expect(getSidBucketNumber('1999')).toBe(1);
    expect(getSidBucketNumber('2001')).toBe(2);
    expect(getSidBucketNumber('3061')).toBe(3);
    expect(getSidBucketNumber('')).toBeNull();
    expect(getSidBucketNumber('999')).toBeNull();
  });

  it('returns distinct themes for different SID ranges', () => {
    expect(getSidBucketTheme('1999')).not.toBeNull();
    expect(getSidBucketTheme('1999')).not.toEqual(getSidBucketTheme('2999'));
    expect(getSidBucketTheme('3061')).toMatchObject({
      fill: expect.any(String),
      border: expect.any(String),
      text: expect.any(String)
    });
  });
});

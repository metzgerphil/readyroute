import { formatReferenceCode } from './referenceCode';

describe('formatReferenceCode', () => {
  it('shows numeric delivery codes without an unnecessary third leading digit', () => {
    expect(formatReferenceCode('001')).toBe('01');
    expect(formatReferenceCode('002')).toBe('02');
    expect(formatReferenceCode('010')).toBe('10');
    expect(formatReferenceCode('095')).toBe('95');
    expect(formatReferenceCode('100')).toBe('100');
  });

  it('preserves pickup codes and other non-numeric values', () => {
    expect(formatReferenceCode('P01')).toBe('P01');
    expect(formatReferenceCode('P10')).toBe('P10');
  });
});

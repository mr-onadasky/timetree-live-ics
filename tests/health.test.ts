import { describe, it, expect } from 'vitest';
import { maskIfTokenForTest } from '../src/healthHelpers';

describe('health masking', () => {
  it('masks tokenized output paths', () => {
    const masked = maskIfTokenForTest({
      outputPath: '/data/ABC123.ics',
      token: 'ABC123',
    });
    expect(masked).toBe('/data/<redacted>.ics');
  });

  it('leaves non-token paths unchanged', () => {
    const masked = maskIfTokenForTest({
      outputPath: '/data/public.ics',
    });
    expect(masked).toBe('/data/public.ics');
  });
});

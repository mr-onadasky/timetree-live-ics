import { describe, it, expect } from 'vitest';
import { maskIfTokenForTest } from '@/lib/health';
import { buildInfo } from '@/lib/version';

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

  it('exposes version in build info', () => {
    expect(buildInfo.version).toBeDefined();
    expect(buildInfo.version).toBeTypeOf('string');
  });
});

import { describe, it, expect } from 'vitest';
import { contactSchema, safeUrl } from '../domain/model';
describe('optional contact links', () => {
  it('accepts a contact without a LinkedIn URL', () => {
    expect(
      contactSchema.safeParse({
        id: 'c',
        name: 'Recruiter',
        company: 'Example',
        title: '',
        email: '',
        linkedInUrl: '',
        relationship: 'RECRUITER',
        relatedJobIds: [],
        status: 'IDENTIFIED',
        notes: '',
        updatedAt: new Date().toISOString(),
      }).success,
    ).toBe(true);
  });
  it('returns validation failure instead of throwing for malformed URLs', () => {
    expect(safeUrl.safeParse('not a url').success).toBe(false);
  });
});

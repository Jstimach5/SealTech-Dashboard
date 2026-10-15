import { describe, expect, it } from 'vitest';
import { assertNoPrivateText } from '../src/schema.js';

describe('assertNoPrivateText (decision 4)', () => {
  it.each([
    ['money', '$1,412.00', true],
    ['phone', '(734) 555-0199', true],
    ['street, mixed case', '2635 Needham St', true],
    ['street, capitals', '2635 NEEDHAM ST', true],
    ['street, lower case', '2635 needham st', true],
    ['street, three-word name', '410 West Grand River Ave', true],
    ['street, two-word name capitals', '410 GRAND RIVER AVE', true],
    ['wall label', 'BAUER · TESTVILLE · ATT', false],
    ['rail age', '21 d BAUER', false],
    ['blower door', '1,412 > 1,190', false],
    ['focus line', 'PHOTOS BEFORE YOU LEAVE', false],
    ['date', '2026-10-14', false],
  ])('%s: %s → flagged %s', (_name, text, flagged) => {
    expect(assertNoPrivateText({ text }).length > 0).toBe(flagged);
  });
});

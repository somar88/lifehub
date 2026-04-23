'use strict';

const {
  escHtml,
  formatDate,
  formatDateTime,
  formatCurrency,
  toDateInputValue,
  toDatetimeLocalValue,
  currentMonthValue,
  periodToRange,
} = require('../utils');

// ── escHtml ───────────────────────────────────────────────────────────────────

describe('escHtml', () => {
  it('escapes & < > " \'', () => {
    expect(escHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(escHtml("it's")).toBe('it&#39;s');
    expect(escHtml('a & b')).toBe('a &amp; b');
  });

  it('passes plain strings unchanged', () => {
    expect(escHtml('Hello world')).toBe('Hello world');
  });

  it('coerces null/undefined to empty string', () => {
    expect(escHtml(null)).toBe('');
    expect(escHtml(undefined)).toBe('');
  });

  it('coerces numbers', () => {
    expect(escHtml(42)).toBe('42');
  });
});

// ── formatDate ────────────────────────────────────────────────────────────────

describe('formatDate', () => {
  it('returns — for falsy values', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('')).toBe('—');
    expect(formatDate(undefined)).toBe('—');
  });

  it('returns a non-empty string for a valid ISO date', () => {
    const result = formatDate('2026-06-15T00:00:00.000Z');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toBe('—');
  });
});

// ── formatDateTime ────────────────────────────────────────────────────────────

describe('formatDateTime', () => {
  it('returns — for falsy values', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('')).toBe('—');
    expect(formatDateTime(undefined)).toBe('—');
  });

  it('returns a non-empty string for a valid ISO datetime', () => {
    const result = formatDateTime('2026-06-15T09:30:00.000Z');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toBe('—');
  });

  it('produces a different result from formatDate for the same input', () => {
    const iso = '2026-06-15T09:30:00.000Z';
    expect(formatDateTime(iso)).not.toBe(formatDate(iso));
  });
});

// ── formatCurrency ────────────────────────────────────────────────────────────

describe('formatCurrency', () => {
  it('formats 0 without throwing', () => {
    const result = formatCurrency(0);
    expect(typeof result).toBe('string');
    expect(result).toContain('0');
  });

  it('treats null/undefined as 0', () => {
    expect(formatCurrency(null)).toBe(formatCurrency(0));
    expect(formatCurrency(undefined)).toBe(formatCurrency(0));
  });

  it('includes the numeric value in the output', () => {
    const result = formatCurrency(1234.56);
    expect(result).toMatch(/1[,.]?234/);
  });
});

// ── toDateInputValue ──────────────────────────────────────────────────────────

describe('toDateInputValue', () => {
  it('returns empty string for falsy input', () => {
    expect(toDateInputValue(null)).toBe('');
    expect(toDateInputValue('')).toBe('');
  });

  it('returns YYYY-MM-DD format', () => {
    expect(toDateInputValue('2026-06-15T12:00:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ── toDatetimeLocalValue ──────────────────────────────────────────────────────

describe('toDatetimeLocalValue', () => {
  it('returns empty string for falsy input', () => {
    expect(toDatetimeLocalValue(null)).toBe('');
    expect(toDatetimeLocalValue('')).toBe('');
  });

  it('returns YYYY-MM-DDTHH:MM format', () => {
    const result = toDatetimeLocalValue('2026-06-15T09:30:00.000Z');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});

// ── currentMonthValue ─────────────────────────────────────────────────────────

describe('currentMonthValue', () => {
  it('returns YYYY-MM format matching today', () => {
    const result = currentMonthValue();
    expect(result).toMatch(/^\d{4}-\d{2}$/);

    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    expect(result).toBe(expected);
  });
});

// ── periodToRange ─────────────────────────────────────────────────────────────

describe('periodToRange', () => {
  it('returns first and last day of the month', () => {
    const [start, end] = periodToRange('2026-06');
    expect(start).toBe('2026-06-01');
    expect(end).toBe('2026-06-30');
  });

  it('handles February in a non-leap year', () => {
    const [start, end] = periodToRange('2025-02');
    expect(start).toBe('2025-02-01');
    expect(end).toBe('2025-02-28');
  });

  it('handles February in a leap year', () => {
    const [start, end] = periodToRange('2024-02');
    expect(start).toBe('2024-02-01');
    expect(end).toBe('2024-02-29');
  });

  it('handles months with 31 days', () => {
    const [, end] = periodToRange('2026-01');
    expect(end).toBe('2026-01-31');
  });

  it('handles December', () => {
    const [start, end] = periodToRange('2026-12');
    expect(start).toBe('2026-12-01');
    expect(end).toBe('2026-12-31');
  });

  it('returns strings (not Date objects)', () => {
    const [start, end] = periodToRange('2026-06');
    expect(typeof start).toBe('string');
    expect(typeof end).toBe('string');
  });
});

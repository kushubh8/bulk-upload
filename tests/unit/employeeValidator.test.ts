import { validateEmployeeRows, ValidationResult } from '../../src/validators/employeeValidator';
import { ParsedRow } from '../../src/types';

function makeRow(overrides: Partial<Record<string, string>> = {}, rowNumber = 1): ParsedRow {
  return {
    rowNumber,
    data: {
      firstName: overrides.firstName ?? 'John',
      lastName: overrides.lastName ?? 'Doe',
      email: overrides.email ?? 'john.doe@example.com',
      startDate: overrides.startDate ?? '2024-01-15',
      country: overrides.country ?? 'US',
      customerId: overrides.customerId ?? 'cust_123',
    },
  };
}

describe('validateEmployeeRows', () => {
  describe('happy path', () => {
    it('accepts a fully valid row', () => {
      const result: ValidationResult = validateEmployeeRows([makeRow()]);
      expect(result.valid).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
      expect(result.valid[0].employee.firstName).toBe('John');
    });

    it('upper-cases the country code', () => {
      const result = validateEmployeeRows([makeRow({ country: 'us' })]);
      expect(result.valid[0].employee.country).toBe('US');
    });

    it('accepts ISO date with time component', () => {
      const result = validateEmployeeRows([makeRow({ startDate: '2024-01-15T00:00:00Z' })]);
      expect(result.valid).toHaveLength(1);
    });

    it('trims whitespace from string fields', () => {
      const result = validateEmployeeRows([makeRow({ firstName: '  Alice  ', lastName: '  Smith  ' })]);
      expect(result.valid[0].employee.firstName).toBe('Alice');
      expect(result.valid[0].employee.lastName).toBe('Smith');
    });

    it('processes multiple valid rows independently', () => {
      const rows = [makeRow({}, 1), makeRow({ email: 'jane@example.com' }, 2)];
      const result = validateEmployeeRows(rows);
      expect(result.valid).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('required field validation', () => {
    it.each([
      ['firstName', { firstName: '' }],
      ['lastName', { lastName: '' }],
      ['email', { email: '' }],
      ['startDate', { startDate: '' }],
      ['country', { country: '' }],
      ['customerId', { customerId: '' }],
    ])('rejects row with missing %s', (field, override) => {
      const result = validateEmployeeRows([makeRow(override)]);
      expect(result.valid).toHaveLength(0);
      expect(result.errors.some((e) => e.field === field)).toBe(true);
    });
  });

  describe('email validation', () => {
    it.each(['notanemail', 'missing@', '@nodomain.com', 'two@@at.com'])(
      'rejects invalid email: %s',
      (email) => {
        const result = validateEmployeeRows([makeRow({ email })]);
        expect(result.errors.some((e) => e.field === 'email')).toBe(true);
      },
    );

    it('accepts valid email formats', () => {
      const emails = ['user@example.com', 'user+tag@sub.domain.org', 'user123@test.io'];
      for (const email of emails) {
        const result = validateEmployeeRows([makeRow({ email })]);
        expect(result.valid).toHaveLength(1);
      }
    });
  });

  describe('startDate validation', () => {
    it.each(['01/15/2024', '15-01-2024', 'January 15 2024', 'not-a-date'])(
      'rejects non-ISO date: %s',
      (startDate) => {
        const result = validateEmployeeRows([makeRow({ startDate })]);
        expect(result.errors.some((e) => e.field === 'startDate')).toBe(true);
      },
    );

    it('accepts valid ISO dates', () => {
      const dates = ['2024-01-15', '2023-12-31'];
      for (const startDate of dates) {
        const result = validateEmployeeRows([makeRow({ startDate })]);
        expect(result.valid).toHaveLength(1);
      }
    });
  });

  describe('country validation', () => {
    it('rejects unknown country code', () => {
      const result = validateEmployeeRows([makeRow({ country: 'XX' })]);
      expect(result.errors.some((e) => e.field === 'country')).toBe(true);
    });

    it.each(['US', 'GB', 'DE', 'IN', 'SG', 'AU'])(
      'accepts valid country code: %s',
      (country) => {
        const result = validateEmployeeRows([makeRow({ country })]);
        expect(result.valid).toHaveLength(1);
      },
    );
  });

  describe('row-level error accumulation', () => {
    it('reports all errors for a row with multiple bad fields', () => {
      const result = validateEmployeeRows([makeRow({ email: 'bad', country: 'XX' })]);
      expect(result.errors.some((e) => e.field === 'email')).toBe(true);
      expect(result.errors.some((e) => e.field === 'country')).toBe(true);
    });

    it('includes the correct row number in errors', () => {
      const rows = [makeRow({}, 1), makeRow({ email: 'bad' }, 2)];
      const result = validateEmployeeRows(rows);
      const emailError = result.errors.find((e) => e.field === 'email');
      expect(emailError?.row).toBe(2);
    });

    it('handles a mix of valid and invalid rows', () => {
      const rows = [
        makeRow({}, 1),
        makeRow({ email: 'bad' }, 2),
        makeRow({ firstName: '' }, 3),
        makeRow({ email: 'valid@example.com' }, 4),
      ];
      const result = validateEmployeeRows(rows);
      expect(result.valid).toHaveLength(2);
      expect(result.errors).toHaveLength(2);
    });
  });

  describe('empty input', () => {
    it('returns empty arrays for empty input', () => {
      const result = validateEmployeeRows([]);
      expect(result.valid).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });
  });
});

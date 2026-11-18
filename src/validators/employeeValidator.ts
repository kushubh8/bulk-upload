import { EmployeeRecord, ParsedRow, RowError, ValidatedRow } from '../types';

// ISO 3166-1 alpha-2: a minimal but representative list; extend as needed
const ISO_3166_1_ALPHA2 = new Set([
  'AF','AL','DZ','AD','AO','AG','AR','AM','AU','AT','AZ','BS','BH','BD',
  'BB','BY','BE','BZ','BJ','BT','BO','BA','BW','BR','BN','BG','BF','BI',
  'CV','KH','CM','CA','CF','TD','CL','CN','CO','KM','CG','CD','CR','HR',
  'CU','CY','CZ','DK','DJ','DM','DO','EC','EG','SV','GQ','ER','EE','SZ',
  'ET','FJ','FI','FR','GA','GM','GE','DE','GH','GR','GD','GT','GN','GW',
  'GY','HT','HN','HU','IS','IN','ID','IR','IQ','IE','IL','IT','JM','JP',
  'JO','KZ','KE','KI','KP','KR','KW','KG','LA','LV','LB','LS','LR','LY',
  'LI','LT','LU','MG','MW','MY','MV','ML','MT','MH','MR','MU','MX','FM',
  'MD','MC','MN','ME','MA','MZ','MM','NA','NR','NP','NL','NZ','NI','NE',
  'NG','NO','OM','PK','PW','PA','PG','PY','PE','PH','PL','PT','QA','RO',
  'RU','RW','KN','LC','VC','WS','SM','ST','SA','SN','RS','SC','SL','SG',
  'SK','SI','SB','SO','ZA','SS','ES','LK','SD','SR','SE','CH','SY','TW',
  'TJ','TZ','TH','TL','TG','TO','TT','TN','TR','TM','TV','UG','UA','AE',
  'GB','US','UY','UZ','VU','VE','VN','YE','ZM','ZW',
]);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ISO 8601 date: YYYY-MM-DD (optionally with time component)
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]*)?$/;

export interface ValidationResult {
  valid: ValidatedRow[];
  errors: RowError[];
}

function validateField(
  value: unknown,
  fieldName: string,
  row: number,
  errors: RowError[],
): string | null {
  if (value === undefined || value === null || String(value).trim() === '') {
    errors.push({ row, field: fieldName, message: `${fieldName} is required` });
    return null;
  }
  return String(value).trim();
}

export function validateEmployeeRows(rows: ParsedRow[]): ValidationResult {
  const valid: ValidatedRow[] = [];
  const errors: RowError[] = [];

  for (const { rowNumber, data } of rows) {
    const rowErrors: RowError[] = [];

    const firstName = validateField(data.firstName, 'firstName', rowNumber, rowErrors);
    const lastName = validateField(data.lastName, 'lastName', rowNumber, rowErrors);
    const email = validateField(data.email, 'email', rowNumber, rowErrors);
    const startDate = validateField(data.startDate, 'startDate', rowNumber, rowErrors);
    const country = validateField(data.country, 'country', rowNumber, rowErrors);
    const customerId = validateField(data.customerId, 'customerId', rowNumber, rowErrors);

    if (email && !EMAIL_REGEX.test(email)) {
      rowErrors.push({ row: rowNumber, field: 'email', message: 'email must be a valid email address' });
    }

    if (startDate && !ISO_DATE_REGEX.test(startDate)) {
      rowErrors.push({ row: rowNumber, field: 'startDate', message: 'startDate must be an ISO 8601 date string' });
    }

    if (country && !ISO_3166_1_ALPHA2.has(country.toUpperCase())) {
      rowErrors.push({
        row: rowNumber,
        field: 'country',
        message: `country must be a valid ISO 3166-1 alpha-2 code, got "${country}"`,
      });
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
    } else {
      valid.push({
        rowNumber,
        employee: {
          firstName: firstName!,
          lastName: lastName!,
          email: email!,
          startDate: startDate!,
          country: country!.toUpperCase(),
          customerId: customerId!,
        },
      });
    }
  }

  return { valid, errors };
}

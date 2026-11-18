import { parse } from 'csv-parse';
import { Readable } from 'stream';
import { EmployeeRecord, ParsedRow } from '../types';

const EXPECTED_HEADERS: (keyof EmployeeRecord)[] = [
  'firstName',
  'lastName',
  'email',
  'startDate',
  'country',
  'customerId',
];

export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvParseError';
  }
}

export async function parseCsvBuffer(buffer: Buffer): Promise<ParsedRow[]> {
  return new Promise((resolve, reject) => {
    const rows: ParsedRow[] = [];
    let rowNumber = 1; // 1-based: row 1 is the first data row (after header)
    let headersValidated = false;

    const parser = parse({
      columns: (header: string[]) => {
        const normalised = header.map((h) => h.trim());
        for (const expected of EXPECTED_HEADERS) {
          if (!normalised.includes(expected)) {
            throw new CsvParseError(
              `CSV is missing required column "${expected}". Expected columns: ${EXPECTED_HEADERS.join(', ')}`,
            );
          }
        }
        headersValidated = true;
        return normalised;
      },
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });

    const readable = Readable.from(buffer);

    parser.on('data', (record: Record<string, string>) => {
      rows.push({
        rowNumber,
        data: {
          firstName: record['firstName'],
          lastName: record['lastName'],
          email: record['email'],
          startDate: record['startDate'],
          country: record['country'],
          customerId: record['customerId'],
        } as Partial<EmployeeRecord>,
      });
      rowNumber++;
    });

    parser.on('error', (err: Error) => {
      reject(new CsvParseError(`Failed to parse CSV: ${err.message}`));
    });

    parser.on('end', () => {
      if (!headersValidated && rows.length === 0) {
        reject(new CsvParseError('CSV file is empty or has no valid rows'));
        return;
      }
      resolve(rows);
    });

    readable.pipe(parser);
  });
}

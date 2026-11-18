import { parseCsvBuffer } from '../../src/services/csvParser';

function makeValidCsv(rows: string[] = []): Buffer {
  const header = 'firstName,lastName,email,startDate,country,customerId';
  const content = [header, ...rows].join('\n');
  return Buffer.from(content);
}

describe('parseCsvBuffer', () => {
  it('parses a well-formed CSV with one row', async () => {
    const csv = makeValidCsv(['Alice,Smith,alice@example.com,2024-01-15,US,cust_1']);
    const rows = await parseCsvBuffer(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].data.firstName).toBe('Alice');
    expect(rows[0].data.email).toBe('alice@example.com');
    expect(rows[0].rowNumber).toBe(1);
  });

  it('parses multiple rows with correct row numbers', async () => {
    const csv = makeValidCsv([
      'Alice,Smith,alice@example.com,2024-01-15,US,cust_1',
      'Bob,Jones,bob@example.com,2024-02-20,GB,cust_2',
      'Carol,White,carol@example.com,2024-03-10,DE,cust_3',
    ]);
    const rows = await parseCsvBuffer(csv);
    expect(rows).toHaveLength(3);
    expect(rows[0].rowNumber).toBe(1);
    expect(rows[1].rowNumber).toBe(2);
    expect(rows[2].rowNumber).toBe(3);
  });

  it('trims whitespace from values', async () => {
    const csv = makeValidCsv([' Alice , Smith , alice@example.com , 2024-01-15 , US , cust_1 ']);
    const rows = await parseCsvBuffer(csv);
    expect(rows[0].data.firstName).toBe('Alice');
    expect(rows[0].data.country).toBe('US');
  });

  it('skips empty lines', async () => {
    const content = 'firstName,lastName,email,startDate,country,customerId\nAlice,Smith,alice@example.com,2024-01-15,US,cust_1\n\n\n';
    const rows = await parseCsvBuffer(Buffer.from(content));
    expect(rows).toHaveLength(1);
  });

  it('throws CsvParseError when a required column is missing', async () => {
    // missing 'customerId' column
    const csv = Buffer.from('firstName,lastName,email,startDate,country\nAlice,Smith,alice@example.com,2024-01-15,US');
    await expect(parseCsvBuffer(csv)).rejects.toThrow('customerId');
  });

  it('throws CsvParseError for completely empty buffer', async () => {
    await expect(parseCsvBuffer(Buffer.from(''))).rejects.toThrow();
  });

  it('maps all six fields correctly', async () => {
    const csv = makeValidCsv(['John,Doe,john.doe@test.io,2023-06-01,SG,customer_xyz']);
    const rows = await parseCsvBuffer(csv);
    const { data } = rows[0];
    expect(data.firstName).toBe('John');
    expect(data.lastName).toBe('Doe');
    expect(data.email).toBe('john.doe@test.io');
    expect(data.startDate).toBe('2023-06-01');
    expect(data.country).toBe('SG');
    expect(data.customerId).toBe('customer_xyz');
  });

  it('handles extra columns gracefully (relax_column_count)', async () => {
    const content = 'firstName,lastName,email,startDate,country,customerId,extraCol\nAlice,Smith,alice@example.com,2024-01-15,US,cust_1,extraValue';
    const rows = await parseCsvBuffer(Buffer.from(content));
    expect(rows).toHaveLength(1);
    expect(rows[0].data.firstName).toBe('Alice');
  });
});

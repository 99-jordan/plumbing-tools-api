import { google } from 'googleapis';
import { config } from './config.js';
import type { SheetData } from './types.js';

const auth = new google.auth.JWT({
  email: config.googleServiceAccountEmail,
  key: config.googlePrivateKey,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const sheets = google.sheets({ version: 'v4', auth });

let sheetCache: { data: SheetData; loadedAt: number } | null = null;

function rowsToObjects<T>(rows: string[][]): T[] {
  if (!rows.length) return [];
  const [header, ...body] = rows;
  return body
    .filter((row) => row.some((cell) => String(cell || '').trim() !== ''))
    .map((row) => Object.fromEntries(header.map((key, i) => [key, row[i] ?? ''])) as T);
}

async function readTab(tab: string): Promise<string[][]> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetId,
    range: `${tab}!A:Z`
  });
  return (res.data.values ?? []) as string[][];
}

async function loadSheetDataUncached(): Promise<SheetData> {
  const [company, serviceAreas, services, emergencyRules, intakeFlow, faqs, sms] = await Promise.all([
    readTab('Company'),
    readTab('ServiceAreas'),
    readTab('Services'),
    readTab('EmergencyRules'),
    readTab('IntakeFlow'),
    readTab('FAQs'),
    readTab('SMS')
  ]);

  return {
    company: rowsToObjects(company),
    serviceAreas: rowsToObjects(serviceAreas),
    services: rowsToObjects(services),
    emergencyRules: rowsToObjects(emergencyRules),
    intakeFlow: rowsToObjects(intakeFlow),
    faqs: rowsToObjects(faqs),
    sms: rowsToObjects(sms)
  };
}

export async function loadSheetData(): Promise<SheetData> {
  const ttlMs = config.sheetDataCacheTtlSeconds * 1000;
  if (ttlMs <= 0) {
    return loadSheetDataUncached();
  }
  const now = Date.now();
  if (sheetCache && now - sheetCache.loadedAt < ttlMs) {
    return sheetCache.data;
  }
  const data = await loadSheetDataUncached();
  sheetCache = { data, loadedAt: now };
  return data;
}

export function invalidateSheetDataCache(): void {
  sheetCache = null;
}

export async function appendCallLog(row: string[]): Promise<void> {
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.googleSheetId,
    range: 'CallLogs!A:N',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] }
  });
}

const ESCALATIONS_TAB = 'Escalations';
const ESCALATIONS_HEADER = [
  'receivedAt',
  'companyId',
  'callId',
  'name',
  'callerPhone',
  'postcode',
  'address',
  'issueSummary',
  'priority',
  'reason'
] as const;

export async function ensureEscalationsSheet(): Promise<void> {
  const { data } = await sheets.spreadsheets.get({
    spreadsheetId: config.googleSheetId,
    fields: 'sheets.properties.title'
  });
  const titles = (data.sheets ?? [])
    .map((s) => s.properties?.title)
    .filter((t): t is string => Boolean(t));
  if (!titles.includes(ESCALATIONS_TAB)) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: config.googleSheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: ESCALATIONS_TAB } } }]
        }
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/already exists|duplicate/i.test(msg)) {
        throw err;
      }
    }
  }

  const first = await readTab(ESCALATIONS_TAB);
  if (first.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.googleSheetId,
      range: `${ESCALATIONS_TAB}!A1:J1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[...ESCALATIONS_HEADER]] }
    });
    return;
  }
  if (String(first[0]?.[0] ?? '').trim() !== 'receivedAt') {
    throw new Error(
      'Escalations tab exists but row 1 is not the expected header (first column must be "receivedAt"). Fix or clear the tab.'
    );
  }
}

export async function appendEscalationDemoRow(row: string[]): Promise<void> {
  if (row.length !== ESCALATIONS_HEADER.length) {
    throw new Error(`Escalation row must have ${ESCALATIONS_HEADER.length} columns`);
  }
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.googleSheetId,
    range: `${ESCALATIONS_TAB}!A:J`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] }
  });
}

export async function readEscalationsRecent(limit = 50): Promise<Record<string, string>[]> {
  const rows = await readTab(ESCALATIONS_TAB);
  if (rows.length < 2) return [];
  const objects = rowsToObjects<Record<string, string>>(rows);
  return objects.slice(-limit).reverse();
}

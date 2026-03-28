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

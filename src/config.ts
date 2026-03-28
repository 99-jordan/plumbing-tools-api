import dotenv from 'dotenv';

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined || value === '') return undefined;
  return value;
}

function requiredElevenLabsSecret(): string {
  const value =
    process.env.X_ELEVENLABS_SECRET_PLUMBINGPRO ?? process.env.X_ELEVENLABS_SECRET;
  if (!value) {
    throw new Error(
      'Missing environment variable: X_ELEVENLABS_SECRET_PLUMBINGPRO (or legacy X_ELEVENLABS_SECRET)'
    );
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT || 3000),
  elevenSecret: requiredElevenLabsSecret(),
  googleSheetId: required('GOOGLE_SHEET_ID'),
  googleServiceAccountEmail: required('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
  googlePrivateKey: required('GOOGLE_PRIVATE_KEY').replace(/\\n/g, '\n'),
  twilioAccountSid: optional('TWILIO_ACCOUNT_SID'),
  twilioAuthToken: optional('TWILIO_AUTH_TOKEN'),
  twilioFromNumber: optional('TWILIO_FROM_NUMBER'),
  escalationWebhookUrl: optional('ESCALATION_WEBHOOK_URL'),
  escalationWebhookSecret: optional('ESCALATION_WEBHOOK_SECRET'),
  escalationTransferNumber: optional('ESCALATION_TRANSFER_NUMBER'),
  sheetDataCacheTtlSeconds: Math.max(0, Number(process.env.SHEET_DATA_CACHE_TTL_SECONDS || 0))
};

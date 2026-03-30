import { appendCallLog, loadSheetData } from './googleSheets.js';
import { config } from './config.js';
import { postEscalationWebhook } from './escalation.js';
import { isTwilioConfigured, renderSmsTemplate, sendSmsViaTwilio } from './sms.js';
import {
  assertCompanyExists,
  buildCompanyContext,
  buildIntakeFlow,
  buildRulesApplicable,
  buildServicesSearch,
  escalateHumanCanonicalSchema,
  logCallCanonicalSchema,
  resolveSmsTemplate,
  sendSmsCanonicalSchema
} from './logic.js';
import {
  normalizeEscalateHumanInput,
  normalizeLogCallInput,
  normalizeSendSmsInput
} from './tool-payload-normalize.js';
import { parseCanonical } from './tool-validation.js';

export async function handleCompanyContext(companyId: string) {
  const data = await loadSheetData();
  return buildCompanyContext(data, companyId);
}

export async function handleIntakeFlow(companyId: string, askWhen: string | undefined) {
  const data = await loadSheetData();
  return buildIntakeFlow(data, companyId, askWhen);
}

export async function handleServicesSearch(companyId: string, query: string) {
  const data = await loadSheetData();
  return { companyId, query, results: buildServicesSearch(data, companyId, query) };
}

export async function handleRulesApplicable(body: unknown) {
  const data = await loadSheetData();
  return buildRulesApplicable(data, body);
}

export async function handleSendSms(body: unknown) {
  if (!isTwilioConfigured()) {
    const err = new Error(
      'SMS is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER.'
    );
    (err as Error & { statusCode?: number }).statusCode = 503;
    throw err;
  }

  const normalized = normalizeSendSmsInput(body);
  const parsed = parseCanonical(sendSmsCanonicalSchema, normalized);
  const data = await loadSheetData();
  const company = buildCompanyContext(data, parsed.companyId);

  const bl = parsed.bookingLink ?? '';
  const bookingLink = bl.trim() !== '' ? bl : company.bookingLink;

  const vars: Record<string, string> = {
    name: parsed.name ?? '',
    issueSummary: parsed.issueSummary ?? '',
    issue: parsed.issueSummary ?? '',
    postcode: parsed.postcode ?? '',
    callId: parsed.callId,
    companyName: company.companyName,
    bookingLink
  };

  const customText = parsed.messageText ?? '';
  let bodyText: string;
  if (customText.trim() !== '') {
    bodyText = renderSmsTemplate(customText, vars);
  } else {
    const template = resolveSmsTemplate(data, parsed.companyId, parsed.templateId);
    bodyText = renderSmsTemplate(template.template_text, vars);
  }

  const { messageSid } = await sendSmsViaTwilio(parsed.to, bodyText);

  return {
    ok: true,
    templateId: parsed.templateId,
    messageSid,
    bodyLength: bodyText.length
  };
}

export async function handleEscalateHuman(body: unknown) {
  const normalized = normalizeEscalateHumanInput(body);
  const parsed = parseCanonical(escalateHumanCanonicalSchema, normalized);
  const data = await loadSheetData();
  assertCompanyExists(data, parsed.companyId);

  const hasWebhook = Boolean(config.escalationWebhookUrl);
  const transferNumber = config.escalationTransferNumber ?? '';

  if (!hasWebhook && !transferNumber) {
    const err = new Error(
      'Escalation is not configured. Set ESCALATION_WEBHOOK_URL and/or ESCALATION_TRANSFER_NUMBER.'
    );
    (err as Error & { statusCode?: number }).statusCode = 503;
    throw err;
  }

  const timestamp = new Date().toISOString();
  let webhookDelivered = false;
  let webhookStatus: number | undefined;
  let webhookResponsePreview: string | undefined;

  if (hasWebhook) {
    const result = await postEscalationWebhook({
      companyId: parsed.companyId,
      callId: parsed.callId,
      reason: parsed.reason,
      priority: parsed.priority,
      callerPhone: parsed.callerPhone,
      issueSummary: parsed.issueSummary,
      name: parsed.name,
      timestamp,
      postcode: parsed.postcode,
      address: parsed.address
    });
    webhookDelivered = result.ok;
    webhookStatus = result.status;
    webhookResponsePreview = result.responsePreview;
  }

  return {
    ok: true,
    webhookDelivered,
    webhookStatus,
    webhookResponsePreview,
    transferNumber
  };
}

export async function handleLogCall(body: unknown) {
  const normalized = normalizeLogCallInput(body);
  const parsed = parseCanonical(logCallCanonicalSchema, normalized);
  const row: string[] = [
    new Date().toISOString(),
    parsed.companyId,
    parsed.callId,
    parsed.intent ?? 'plumbing_enquiry',
    parsed.priority ?? 'P3',
    parsed.emergencyFlag,
    parsed.name ?? '',
    parsed.phone ?? '',
    parsed.postcode ?? '',
    parsed.issueSummary,
    parsed.actionTaken,
    parsed.smsSent ?? '',
    parsed.escalatedTo ?? '',
    parsed.status
  ];

  await appendCallLog(row);
  return { ok: true, callId: parsed.callId };
}

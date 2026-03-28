import { config } from './config.js';

export type EscalationPayload = {
  companyId: string;
  callId: string;
  reason: string;
  priority: string;
  callerPhone: string;
  issueSummary: string;
  name: string;
  timestamp: string;
};

export async function postEscalationWebhook(payload: EscalationPayload): Promise<{ ok: boolean; status?: number }> {
  const url = config.escalationWebhookUrl;
  if (!url) {
    return { ok: false };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (config.escalationWebhookSecret) {
    headers['x-escalation-secret'] = config.escalationWebhookSecret;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  return { ok: res.ok, status: res.status };
}

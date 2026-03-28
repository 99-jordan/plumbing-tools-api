import { NextRequest, NextResponse } from 'next/server';
import { handleIntakeFlow } from '../../../api-handlers.js';
import { requireElevenSecret } from '../../../lib/elevenlabs-secret.js';
import { jsonError } from '../../../lib/route-error.js';

export async function GET(req: NextRequest) {
  const denied = requireElevenSecret(req);
  if (denied) return denied;

  try {
    const companyId = String(req.nextUrl.searchParams.get('companyId') || 'rapidflow_london');
    const askWhenRaw = req.nextUrl.searchParams.get('askWhen');
    const askWhen = askWhenRaw !== null ? askWhenRaw : undefined;
    return NextResponse.json(await handleIntakeFlow(companyId, askWhen));
  } catch (error) {
    return jsonError(error, 500);
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { handleServicesSearch } from '../../../api-handlers.js';
import { requireElevenSecret } from '../../../lib/elevenlabs-secret.js';
import { jsonError } from '../../../lib/route-error.js';

export async function GET(req: NextRequest) {
  const denied = requireElevenSecret(req);
  if (denied) return denied;

  try {
    const companyId = String(req.nextUrl.searchParams.get('companyId') || 'rapidflow_london');
    const query = String(req.nextUrl.searchParams.get('query') || '');
    return NextResponse.json(await handleServicesSearch(companyId, query));
  } catch (error) {
    return jsonError(error, 500);
  }
}

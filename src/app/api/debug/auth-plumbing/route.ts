import { NextRequest, NextResponse } from 'next/server';
import { ELEVENLABS_PLUMBINGPRO_SECRET_HEADER } from '../../../../elevenlabs-plumbing-header.js';
import {
  buildPlumbingAuthDiagnostics,
  getExpectedSecretFromEnv,
  isPlumbingAuthDebugEnabled
} from '../../../../lib/plumbing-auth-debug.js';

/**
 * Temporary diagnostics: set DEBUG_PLUMBING_AUTH=1 on Vercel, GET without auth.
 * Remove or disable after debugging. Does not expose secret values.
 */
export function GET(req: NextRequest) {
  if (!isPlumbingAuthDebugEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const incoming = req.headers.get(ELEVENLABS_PLUMBINGPRO_SECRET_HEADER);
  const { value: expected = '' } = getExpectedSecretFromEnv();

  return NextResponse.json(
    buildPlumbingAuthDiagnostics(incoming, expected),
    { status: 200 }
  );
}

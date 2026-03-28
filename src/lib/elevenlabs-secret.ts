import { NextRequest, NextResponse } from 'next/server';
import { config } from '../config.js';
import { ELEVENLABS_PLUMBINGPRO_SECRET_HEADER } from '../elevenlabs-plumbing-header.js';
import {
  buildPlumbingAuthDiagnostics,
  isPlumbingAuthDebugEnabled,
  logPlumbingAuthDebug
} from './plumbing-auth-debug.js';

export function requireElevenSecret(req: NextRequest): NextResponse | null {
  const secret = req.headers.get(ELEVENLABS_PLUMBINGPRO_SECRET_HEADER);
  logPlumbingAuthDebug('next', secret, config.elevenSecret);

  if (!secret || secret !== config.elevenSecret) {
    const body: Record<string, unknown> = {
      error: 'Unauthorized',
      reason: 'missing_or_invalid_secret_header',
      header: ELEVENLABS_PLUMBINGPRO_SECRET_HEADER
    };
    if (isPlumbingAuthDebugEnabled()) {
      body.debug = buildPlumbingAuthDiagnostics(secret, config.elevenSecret);
    }
    return NextResponse.json(body, { status: 401 });
  }
  return null;
}

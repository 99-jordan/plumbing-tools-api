import { NextRequest, NextResponse } from 'next/server';
import { config } from '../config.js';
import { ELEVENLABS_PLUMBINGPRO_SECRET_HEADER } from '../elevenlabs-plumbing-header.js';

export function requireElevenSecret(req: NextRequest): NextResponse | null {
  const secret = req.headers.get(ELEVENLABS_PLUMBINGPRO_SECRET_HEADER);
  if (!secret || secret !== config.elevenSecret) {
    return NextResponse.json(
      {
        error: 'Unauthorized',
        reason: 'missing_or_invalid_secret_header',
        header: ELEVENLABS_PLUMBINGPRO_SECRET_HEADER
      },
      { status: 401 }
    );
  }
  return null;
}

import { NextRequest, NextResponse } from 'next/server';
import { config } from '../config.js';

export function requireElevenSecret(req: NextRequest): NextResponse | null {
  const secret = req.headers.get('x-elevenlabs-secret');
  if (!secret || secret !== config.elevenSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

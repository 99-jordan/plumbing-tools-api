import type { Request, Response, NextFunction } from 'express';
import { config } from './config.js';
import { ELEVENLABS_PLUMBINGPRO_SECRET_HEADER } from './elevenlabs-plumbing-header.js';
import {
  buildPlumbingAuthDiagnostics,
  isPlumbingAuthDebugEnabled,
  logPlumbingAuthDebug
} from './lib/plumbing-auth-debug.js';

export function requireElevenSecret(req: Request, res: Response, next: NextFunction) {
  const secret = req.header(ELEVENLABS_PLUMBINGPRO_SECRET_HEADER);
  logPlumbingAuthDebug('express', secret ?? null, config.elevenSecret);

  if (!secret || secret !== config.elevenSecret) {
    const body: Record<string, unknown> = {
      error: 'Unauthorized',
      reason: 'missing_or_invalid_secret_header',
      header: ELEVENLABS_PLUMBINGPRO_SECRET_HEADER
    };
    if (isPlumbingAuthDebugEnabled()) {
      body.debug = buildPlumbingAuthDiagnostics(secret ?? null, config.elevenSecret);
    }
    return res.status(401).json(body);
  }
  next();
}

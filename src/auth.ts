import type { Request, Response, NextFunction } from 'express';
import { config } from './config.js';
import { ELEVENLABS_PLUMBINGPRO_SECRET_HEADER } from './elevenlabs-plumbing-header.js';

export function requireElevenSecret(req: Request, res: Response, next: NextFunction) {
  const secret = req.header(ELEVENLABS_PLUMBINGPRO_SECRET_HEADER);
  if (!secret || secret !== config.elevenSecret) {
    return res.status(401).json({
      error: 'Unauthorized',
      reason: 'missing_or_invalid_secret_header',
      header: ELEVENLABS_PLUMBINGPRO_SECRET_HEADER
    });
  }
  next();
}

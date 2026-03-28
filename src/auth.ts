import type { Request, Response, NextFunction } from 'express';
import { config } from './config.js';

export function requireElevenSecret(req: Request, res: Response, next: NextFunction) {
  const secret = req.header('x-elevenlabs-secret');
  if (!secret || secret !== config.elevenSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

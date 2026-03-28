import { NextResponse } from 'next/server';

export function jsonError(error: unknown, defaultStatus: number) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  const statusCode = (error as Error & { statusCode?: number }).statusCode;
  if (statusCode === 503) {
    return NextResponse.json({ error: message }, { status: 503 });
  }
  if (message.startsWith('SMS template not found')) {
    return NextResponse.json({ error: message }, { status: 404 });
  }
  return NextResponse.json({ error: message }, { status: defaultStatus });
}

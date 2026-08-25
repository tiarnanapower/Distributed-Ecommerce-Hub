import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth/session';
import { scopeFromAuth } from '@/lib/tenancy';
import { searchEverything } from '@/server/services/search';
import { toAppError } from '@/lib/errors';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  }

  const query = new URL(request.url).searchParams.get('q') ?? '';

  try {
    const results = await searchEverything(scopeFromAuth(auth), query);
    return NextResponse.json({ results });
  } catch (error) {
    const appError = toAppError(error);
    logger.error('Global search failed', { detail: appError.detail });
    return NextResponse.json(appError.toPublicJSON(), { status: appError.status });
  }
}

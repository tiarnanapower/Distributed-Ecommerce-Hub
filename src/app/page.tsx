import { redirect } from 'next/navigation';

import { getAuthContext } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function RootPage() {
  const auth = await getAuthContext();
  redirect(auth ? '/overview' : '/login');
}

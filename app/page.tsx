import { redirect } from 'next/navigation';
import { getAdmin } from '@/lib/auth';
import Dashboard from '@/components/smart-dashboard';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const admin = await getAdmin();
  if (!admin) redirect('/login');
  return <Dashboard username={admin.username} />;
}

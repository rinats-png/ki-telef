import { getAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Login from '@/components/login';
export const dynamic = 'force-dynamic';
export default async function LoginPage() { if (await getAdmin()) redirect('/'); return <Login />; }

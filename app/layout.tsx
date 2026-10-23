import type { Metadata } from 'next';
import './globals.css';
import './hub.css';
export const metadata: Metadata = { title: 'STORM · Telefonassistenz', description: 'Geschütztes Disponenten-Dashboard der Storm GmbH', robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="de"><body>{children}</body></html>; }

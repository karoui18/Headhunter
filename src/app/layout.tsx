import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Olfa Job Hunter — Your next chapter',
  description: 'A local-first workspace for an intentional job search.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Olfa' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#183f36' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

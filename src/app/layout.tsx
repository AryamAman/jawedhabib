import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import AppShellLoader from './shell';

export const metadata: Metadata = {
  title: 'Jawed Habib | BITS Pilani',
  description: 'Salon booking portal for Jawed Habib BITS Pilani.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AppShellLoader>{children}</AppShellLoader>
      </body>
    </html>
  );
}

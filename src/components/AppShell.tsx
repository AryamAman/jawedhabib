'use client';

import { Toaster } from 'react-hot-toast';
import type { ReactNode } from 'react';
import Navbar from './Navbar';
import Footer from './Footer';

export default function AppShell({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-stone-50 text-stone-900 font-sans">
      <Navbar />
      <main className="flex-grow">{children}</main>
      <Footer />
      <Toaster position="bottom-right" />
    </div>
  );
}

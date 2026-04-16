'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';

const AppShell = dynamic(() => import('@/src/components/AppShell'), {
  ssr: false,
});

export default function AppShellLoader({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}

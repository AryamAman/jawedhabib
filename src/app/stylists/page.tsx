'use client';

import dynamic from 'next/dynamic';

const StylistsPage = dynamic(() => import('@/src/views/Stylists'), { ssr: false });

export default function Page() {
  return <StylistsPage />;
}

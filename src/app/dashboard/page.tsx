'use client';

import dynamic from 'next/dynamic';

const DashboardPage = dynamic(() => import('@/src/views/Dashboard'), { ssr: false });

export default function Page() {
  return <DashboardPage />;
}

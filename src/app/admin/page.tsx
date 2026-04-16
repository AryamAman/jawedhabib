'use client';

import dynamic from 'next/dynamic';

const AdminDashboardPage = dynamic(() => import('@/src/views/AdminDashboard'), { ssr: false });

export default function Page() {
  return <AdminDashboardPage />;
}

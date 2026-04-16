'use client';

import dynamic from 'next/dynamic';

const AdminLoginPage = dynamic(() => import('@/src/views/AdminLogin'), { ssr: false });

export default function Page() {
  return <AdminLoginPage />;
}

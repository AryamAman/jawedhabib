'use client';

import dynamic from 'next/dynamic';

const LoginPage = dynamic(() => import('@/src/views/Login'), { ssr: false });

export default function Page() {
  return <LoginPage />;
}

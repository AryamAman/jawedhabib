'use client';

import dynamic from 'next/dynamic';

const ServicesPage = dynamic(() => import('@/src/views/Services'), { ssr: false });

export default function Page() {
  return <ServicesPage />;
}

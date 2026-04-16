'use client';

import dynamic from 'next/dynamic';

const AboutPage = dynamic(() => import('@/src/views/About'), { ssr: false });

export default function Page() {
  return <AboutPage />;
}

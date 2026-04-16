'use client';

import dynamic from 'next/dynamic';

const GalleryPage = dynamic(() => import('@/src/views/Gallery'), { ssr: false });

export default function Page() {
  return <GalleryPage />;
}

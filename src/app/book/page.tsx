'use client';

import dynamic from 'next/dynamic';

const BookPage = dynamic(() => import('@/src/views/Book'), { ssr: false });

export default function Page() {
  return <BookPage />;
}

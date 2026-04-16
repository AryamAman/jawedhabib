import { Suspense } from 'react';
import BookPage from '@/src/views/Book';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <BookPage />
    </Suspense>
  );
}

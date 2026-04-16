'use client';

import dynamic from 'next/dynamic';

const SignupPage = dynamic(() => import('@/src/views/Signup'), { ssr: false });

export default function Page() {
  return <SignupPage />;
}

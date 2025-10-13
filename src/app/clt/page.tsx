
'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function CltRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the default or first available sub-page.
    // In this case, we redirect to 'facta' as 'v8' is "coming soon".
    router.replace('/clt/facta');
  }, [router]);

  // You can show a loading spinner here while redirecting
  return null;
}

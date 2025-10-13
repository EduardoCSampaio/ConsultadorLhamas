'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// This page just redirects to the first available INSS feature.
export default function InssRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the first available sub-page.
    router.replace('/inss/cartao-beneficio');
  }, [router]);

  // You can show a loading spinner here while redirecting
  return null;
}

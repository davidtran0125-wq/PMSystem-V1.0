'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { Skeleton } from '@/components/ui';

export default function HomePage() {
  const router = useRouter();
  const { user, status, loadSession } = useAuthStore();

  useEffect(() => {
    if (status === 'idle') void loadSession();
  }, [status, loadSession]);

  useEffect(() => {
    if (status === 'anonymous') router.replace('/login');
    if (status === 'authenticated') {
      router.replace(user?.supplier ? '/supplier/rfqs' : '/dashboard');
    }
  }, [status, user, router]);

  return (
    <div className="space-y-4 p-8">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

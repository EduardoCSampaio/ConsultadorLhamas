
'use client';

import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="flex justify-center">
            <Skeleton className="h-12 w-48" />
        </div>
        <div className="space-y-6">
            <Skeleton className="h-16" />
            <Skeleton className="h-10" />
            <div className="space-y-4">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
            </div>
            <Skeleton className="h-12" />
            <Skeleton className="h-8 w-48 mx-auto" />
        </div>
      </div>
    </div>
  );
}

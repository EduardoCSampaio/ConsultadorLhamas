
import { cn } from "@/lib/utils";
import Link from "next/link";
import Image from "next/image";

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 text-inherit", className)}>
      <div className="bg-primary/10 dark:bg-primary/20 p-2 rounded-lg flex items-center justify-center">
        <Image src="/favicon.ico" alt="Lhamascred Logo" width={20} height={20} className="h-5 w-5" />
      </div>
      <span className="text-lg font-bold tracking-tight font-headline">Lhamascred</span>
    </Link>
  );
}

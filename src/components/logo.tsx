import { cn } from "@/lib/utils";
import Link from "next/link";

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 text-inherit", className)}>
      <span className="text-lg font-bold tracking-tight font-headline">Lhamascred</span>
    </Link>
  );
}

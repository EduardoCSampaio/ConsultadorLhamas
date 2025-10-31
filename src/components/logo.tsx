import { cn } from "@/lib/utils";
import Link from "next/link";
import { Gem } from "lucide-react";

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-3 text-inherit", className)}>
      <div className="bg-primary/20 p-2 rounded-lg flex items-center justify-center">
        <Gem className="h-5 w-5 text-primary" />
      </div>
      <span className="text-xl font-bold tracking-tighter font-headline">Lhamascred</span>
    </Link>
  );
}

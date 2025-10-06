import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/dashboard" className={cn("flex items-center gap-2 text-inherit", className)}>
      <div className="bg-primary/20 p-2 rounded-lg">
        <Sparkles className="h-5 w-5 text-primary" />
      </div>
      <span className="text-lg font-bold tracking-tight font-headline">Beleza Integrada</span>
    </Link>
  );
}

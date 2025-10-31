import { cn } from "@/lib/utils";
import Link from "next/link";
import Image from "next/image";

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-3 text-inherit", className)}>
      <div className="bg-primary/20 p-1 rounded-lg flex items-center justify-center">
        <Image 
            src="/lhamas.jpeg" 
            alt="Lhamascred Logo" 
            width={32} 
            height={32} 
            className="rounded-md"
        />
      </div>
      <span className="text-xl font-bold tracking-tighter font-headline">Lhamascred</span>
    </Link>
  );
}

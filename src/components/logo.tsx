import { cn } from "@/lib/utils";
import Link from "next/link";

function LlamaIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M14 17.913V20h-3v-4.839C6.883 15.422 4.103 14.15 3 12.28c-2.316-3.898.354-9.332 5.09-10.252.5-.1.812.383.626.85-1.503 3.82-3.235 6.642 1.284 8.122 1.34.444 2.873.234 4- .32.939-.462 1.547-1.196 2-2.18.529-1.143.2-2.399-.15-3.5C15.518 3.344 17.5 3 19 3c2.5 0 4 2.5 4 5 0 2.5-2 5-4.5 5H15" />
        </svg>
    )
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 text-inherit", className)}>
      <div className="bg-primary/20 p-2 rounded-lg">
        <LlamaIcon className="h-5 w-5 text-primary" />
      </div>
      <span className="text-lg font-bold tracking-tight font-headline">Lhamascred</span>
    </Link>
  );
}

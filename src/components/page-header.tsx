import type { ReactNode } from "react";

type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
};

export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl text-transparent bg-clip-text bg-gradient-to-r from-primary/90 to-primary/60">
          {title}
        </h1>
        {description && (
          <div className="mt-2 text-muted-foreground max-w-2xl">{description}</div>
        )}
      </div>
      {children && <div className="flex shrink-0 gap-2">{children}</div>}
    </div>
  );
}

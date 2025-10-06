import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Logo } from '@/components/logo';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background p-4 text-center">
      <Logo className="text-foreground" />
      <div>
        <h1 className="text-8xl font-bold text-primary font-headline">404</h1>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight">Página não encontrada</h2>
        <p className="mt-2 text-muted-foreground">
          Oops! A página que você está procurando não existe ou foi movida.
        </p>
      </div>
      <Button asChild>
        <Link href="/dashboard">Voltar para o Dashboard</Link>
      </Button>
    </div>
  );
}

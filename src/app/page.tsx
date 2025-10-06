import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlaceHolderImages } from "@/lib/placeholder-images";
import { DollarSign, FileText, LineChart } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/logo";

export default function Home() {
  const heroImage = PlaceHolderImages.find(p => p.id === "hero-image");

  const featureCards = [
    {
      icon: <DollarSign className="h-8 w-8 text-primary" />,
      title: "Análise de Crédito",
      description: "Avalie propostas de crédito com agilidade e segurança, usando dados inteligentes.",
      image: PlaceHolderImages.find(p => p.id === "feature-1"),
    },
    {
      icon: <FileText className="h-8 w-8 text-primary" />,
      title: "Gestão de Contas",
      description: "Acompanhe contas a pagar e receber, fluxo de caixa e organize suas finanças.",
      image: PlaceHolderImages.find(p => p.id === "feature-2"),
    },
    {
      icon: <LineChart className="h-8 w-8 text-primary" />,
      title: "Relatórios Detalhados",
      description: "Gere relatórios completos e visualize o desempenho do seu negócio.",
      image: PlaceHolderImages.find(p => p.id === "feature-3"),
    },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center">
          <Logo />
          <nav className="ml-auto flex items-center space-x-4">
            <Button variant="ghost" asChild>
              <Link href="/login">Entrar</Link>
            </Button>
            <Button asChild>
              <Link href="/login">Começar Agora</Link>
            </Button>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <section className="relative h-[60vh] min-h-[500px] w-full">
          {heroImage && (
             <Image
              src={heroImage.imageUrl}
              alt={heroImage.description}
              fill
              className="object-cover object-center"
              priority
              data-ai-hint={heroImage.imageHint}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
          <div className="relative z-10 flex h-full flex-col items-center justify-center text-center text-foreground">
            <div className="container">
              <h1 className="font-headline text-4xl font-bold tracking-tight md:text-6xl lg:text-7xl">
                O futuro do seu crédito,{" "}
                <span className="text-primary">descomplicado</span>.
              </h1>
              <p className="mt-4 max-w-2xl mx-auto text-lg text-foreground/80 md:text-xl">
                Simplifique a gestão de crédito e finanças. Análises, contas e relatórios em um só lugar.
              </p>
              <div className="mt-8 flex justify-center gap-4">
                <Button size="lg" asChild>
                  <Link href="/login">Começar Gratuitamente</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="py-12 sm:py-20 lg:py-24">
          <div className="container">
            <div className="text-center">
              <h2 className="font-headline text-3xl font-bold tracking-tight sm:text-4xl">
                Ferramentas para o seu sucesso financeiro
              </h2>
              <p className="mt-4 text-lg text-foreground/70">
                Funcionalidades pensadas para impulsionar a gestão do seu negócio.
              </p>
            </div>
            <div className="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {featureCards.map((feature, index) => (
                <Card key={index} className="overflow-hidden transition-all hover:shadow-lg hover:-translate-y-1">
                  {feature.image && (
                     <div className="h-48 relative">
                      <Image 
                        src={feature.image.imageUrl}
                        alt={feature.image.description}
                        fill
                        className="object-cover"
                        data-ai-hint={feature.image.imageHint}
                      />
                    </div>
                  )}
                  <CardHeader>
                    <div className="flex items-center gap-4">
                      {feature.icon}
                      <CardTitle className="font-headline text-xl">{feature.title}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-foreground/80">{feature.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t py-8">
        <div className="container flex flex-col items-center justify-between gap-4 sm:flex-row">
          <Logo />
          <p className="text-sm text-foreground/60">
            © {new Date().getFullYear()} Lhamascred. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}

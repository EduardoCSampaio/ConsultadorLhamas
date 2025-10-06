
'use client';

import { useState, FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { useAuth } from "@/firebase";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, AuthError } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);

  const auth = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const handleAuth = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
        toast({
          title: "Conta criada com sucesso!",
          description: "Você será redirecionado para o painel.",
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      router.push('/dashboard');
    } catch (err) {
      const authError = err as AuthError;
      let friendlyMessage = 'Ocorreu um erro. Tente novamente.';
      switch (authError.code) {
        case 'auth/user-not-found':
          friendlyMessage = 'Nenhum usuário encontrado com este e-mail.';
          break;
        case 'auth/wrong-password':
          friendlyMessage = 'Senha incorreta. Por favor, tente novamente.';
          break;
        case 'auth/email-already-in-use':
          friendlyMessage = 'Este e-mail já está em uso por outra conta.';
          break;
        case 'auth/invalid-email':
          friendlyMessage = 'O formato do e-mail é inválido.';
          break;
        case 'auth/weak-password':
          friendlyMessage = 'A senha é muito fraca. Tente uma mais forte.';
          break;
        default:
          friendlyMessage = authError.message;
          break;
      }
      setError(friendlyMessage);
      console.error(authError);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Logo className="text-foreground"/>
        </div>
        <Card>
          <form onSubmit={handleAuth}>
            <CardHeader className="text-center">
              <CardTitle className="font-headline text-2xl font-semibold">
                {isSignUp ? "Crie sua conta" : "Bem-vindo de volta!"}
              </CardTitle>
              <CardDescription>
                {isSignUp ? "Preencha os dados para começar." : "Acesse sua conta para gerenciar suas finanças."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Erro de Autenticação</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="seu@email.com" 
                  required 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Senha</Label>
                  {!isSignUp && (
                    <Link href="#" className="text-sm text-primary hover:underline">
                      Esqueceu a senha?
                    </Link>
                  )}
                </div>
                <Input 
                  id="password" 
                  type="password" 
                  required 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button className="w-full" type="submit" disabled={isLoading}>
                {isLoading ? "Carregando..." : (isSignUp ? "Cadastrar" : "Entrar")}
              </Button>
              <div className="text-center text-sm text-muted-foreground">
                {isSignUp ? "Já tem uma conta?" : "Não tem uma conta?"}{' '}
                <Button 
                  variant="link" 
                  className="p-0 h-auto"
                  type="button" 
                  onClick={() => {
                    setIsSignUp(!isSignUp);
                    setError(null);
                  }}
                >
                  {isSignUp ? "Faça o login" : "Cadastre-se"}
                </Button>
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}

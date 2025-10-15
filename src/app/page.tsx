
'use client';

import { useState, FormEvent, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { useAuth, useUser } from "@/firebase";
import { signInWithEmailAndPassword, AuthError, getIdTokenResult } from "firebase/auth";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, CheckCircle } from "lucide-react";
import { doc, updateDoc } from "firebase/firestore";
import { useFirestore } from "@/firebase";
import { setAdminClaim } from "@/app/actions/users";


export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const auth = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();

  const status = searchParams.get('status');

  useEffect(() => {
    if (!isUserLoading && user) {
      getIdTokenResult(user, true).then(() => {
          router.push('/dashboard');
      });
    }
  }, [user, isUserLoading, router]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (!auth || !firestore) {
      setError("Serviços de autenticação não estão disponíveis. Tente novamente mais tarde.");
      setIsLoading(false);
      return;
    }

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const loggedInUser = userCredential.user;
        
        if (loggedInUser.email === 'admin@lhamascred.com.br') {
            await setAdminClaim({ uid: loggedInUser.uid });
            
            const userDocRef = doc(firestore, "users", loggedInUser.uid);
            await updateDoc(userDocRef, {
                role: 'super_admin',
                status: 'active'
            });
        }
        
        await getIdTokenResult(loggedInUser, true); 
        router.push('/dashboard');
    } catch (err) {
      const authError = err as AuthError;
      let friendlyMessage = 'Ocorreu um erro. Tente novamente.';
      switch (authError.code) {
        case 'auth/user-not-found':
        case 'auth/invalid-credential':
          friendlyMessage = 'Credenciais inválidas. Verifique seu e-mail e senha.';
          break;
        case 'auth/wrong-password':
          friendlyMessage = 'Senha incorreta. Por favor, tente novamente.';
          break;
        case 'auth/invalid-email':
          friendlyMessage = 'O formato do e-mail é inválido.';
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

  if (isUserLoading || user) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><Logo /></div>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Logo className="text-foreground"/>
        </div>
          <Card>
            <form onSubmit={handleLogin}>
              <CardHeader className="text-center">
                <CardTitle className="font-headline text-2xl font-semibold">
                  Bem-vindo de volta!
                </CardTitle>
                <CardDescription>
                  Acesse sua conta para gerenciar suas finanças.
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
                 {status === 'pending' && (
                  <Alert variant="default" className="bg-yellow-50 border-yellow-200 text-yellow-800">
                    <AlertCircle className="h-4 w-4 !text-yellow-600" />
                    <AlertTitle>Conta Pendente</AlertTitle>
                    <AlertDescription>Sua conta ainda está aguardando aprovação do administrador.</AlertDescription>
                  </Alert>
                )}
                 {status === 'rejected' && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Acesso Rejeitado</AlertTitle>
                    <AlertDescription>Sua solicitação de acesso foi rejeitada. Entre em contato com o suporte.</AlertDescription>
                  </Alert>
                )}
                {status === 'inactive' && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Conta Inativa</AlertTitle>
                    <AlertDescription>Sua conta foi inativada. Entre em contato com o suporte.</AlertDescription>
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
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Senha</Label>
                      <Link href="#" className="text-sm text-primary hover:underline">
                        Esqueceu a senha?
                      </Link>
                  </div>
                  <Input 
                    id="password" 
                    type="password" 
                    required 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    autoComplete="current-password"
                  />
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-4">
                <Button className="w-full" type="submit" disabled={isLoading}>
                  {isLoading ? "Carregando..." : "Entrar"}
                </Button>
                <div className="text-center text-sm text-muted-foreground">
                  Não tem uma conta?{' '}
                  <Link href="/signup" className="text-primary hover:underline">
                    Cadastre-se
                  </Link>
                </div>
              </CardFooter>
            </form>
          </Card>
      </div>
    </div>
  );
}

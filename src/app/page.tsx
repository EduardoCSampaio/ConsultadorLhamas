
'use client';

import { useState, FormEvent, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { useAuth, useUser } from "@/firebase";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, AuthError, signOut, getIdTokenResult } from "firebase/auth";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, CheckCircle } from "lucide-react";
import { doc, setDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { useFirestore } from "@/firebase";
import { setAdminClaim, logActivity } from "@/app/actions/users";


export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPendingMessage, setShowPendingMessage] = useState(false);

  const auth = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();

  const isPending = searchParams.get('status') === 'pending';

  useEffect(() => {
    if (!isUserLoading && user) {
      getIdTokenResult(user, true).then((idTokenResult) => {
          router.push('/dashboard');
      });
    }
  }, [user, isUserLoading, router]);

  const handleAuth = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setShowPendingMessage(false);

    if (!auth || !firestore) {
      setError("Serviços de autenticação não estão disponíveis. Tente novamente mais tarde.");
      setIsLoading(false);
      return;
    }

    try {
      if (isSignUp) {
        // --- SIGN UP ---
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const newUser = userCredential.user;
        const isSuperAdmin = newUser.email === 'admin@lhamascred.com.br';

        const userProfile = {
          uid: newUser.uid,
          email: newUser.email,
          role: isSuperAdmin ? 'super_admin' : 'user',
          status: isSuperAdmin ? 'active' : 'pending',
          createdAt: serverTimestamp(),
          permissions: { 
              canViewFGTS: isSuperAdmin,
              canViewCLT: isSuperAdmin,
              canViewINSS: isSuperAdmin,
          }
        };

        await setDoc(doc(firestore, "users", newUser.uid), userProfile);
        
        await logActivity({
            userId: newUser.uid,
            action: 'User Registration',
            details: `New user ${newUser.email} signed up.`
        });
        
        if (isSuperAdmin) {
          await setAdminClaim({ uid: newUser.uid });
          await getIdTokenResult(newUser, true);
          router.push('/dashboard');
        } else {
            setShowPendingMessage(true);
            await signOut(auth);
        }

      } else {
        // --- SIGN IN ---
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const loggedInUser = userCredential.user;
        
        if (loggedInUser.email === 'admin@lhamascred.com.br') {
            // Ensure the super_admin claim is set on the backend.
            await setAdminClaim({ uid: loggedInUser.uid });

            // **THE CRITICAL FIX**: Force-update the user's role in Firestore to 'super_admin' on every login.
            // This corrects any accidental data corruption and ensures privileges are recognized.
            const userDocRef = doc(firestore, "users", loggedInUser.uid);
            await updateDoc(userDocRef, {
                role: 'super_admin',
                status: 'active'
            });
        }
        
        await getIdTokenResult(loggedInUser, true);
        router.push('/dashboard');
      }
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
        case 'auth/email-already-in-use':
          friendlyMessage = 'Este e-mail já está em uso por outra conta.';
          break;
        case 'auth/invalid-email':
          friendlyMessage = 'O formato do e-mail é inválido.';
          break;
        case 'auth/weak-password':
          friendlyMessage = 'A senha é muito fraca. Deve ter no mínimo 6 caracteres.';
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

        {showPendingMessage ? (
           <Card>
            <CardHeader className="text-center">
                <div className="mx-auto bg-green-100 rounded-full p-2 w-fit">
                    <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
               <CardTitle className="font-headline text-2xl font-semibold mt-4">Solicitação Enviada!</CardTitle>
               <CardDescription className="text-base">
                 Sua conta foi criada e está aguardando aprovação de um administrador.
               </CardDescription>
             </CardHeader>
             <CardFooter>
               <Button className="w-full" onClick={() => setShowPendingMessage(false)}>Voltar para o Login</Button>
             </CardFooter>
           </Card>
        ) : (
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
                 {isPending && (
                  <Alert variant="default" className="bg-yellow-50 border-yellow-200 text-yellow-800">
                    <AlertCircle className="h-4 w-4 !text-yellow-600" />
                    <AlertTitle>Conta Pendente</AlertTitle>
                    <AlertDescription>Sua conta ainda está aguardando aprovação do administrador.</AlertDescription>
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
                    autoComplete={isSignUp ? "new-password" : "current-password"}
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
        )}
      </div>
    </div>
  );
}

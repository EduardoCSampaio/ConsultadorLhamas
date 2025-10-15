
'use client';

import { useState, FormEvent, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { useAuth, useUser } from "@/firebase";
import { createUserWithEmailAndPassword, AuthError, signOut } from "firebase/auth";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { useFirestore } from "@/firebase";
import { logActivity } from "@/app/actions/users";
import { getTeamAndManager, type Team } from "@/app/actions/teams";


export default function SignUpPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPendingMessage, setShowPendingMessage] = useState(false);
  const [isInvitationValid, setIsInvitationValid] = useState<boolean | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [managerName, setManagerName] = useState<string>('');


  const auth = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();
  const teamId = searchParams.get('convite');

  useEffect(() => {
    if (!isUserLoading && user) {
      router.push('/dashboard');
    }
  }, [user, isUserLoading, router]);

  useEffect(() => {
    async function validateInvitation() {
        if (!teamId) {
            router.push('/');
            return;
        }
        if (!firestore) {
            return;
        }

        setIsLoading(true);
        const { success, team, manager, error } = await getTeamAndManager({ teamId });
        setIsLoading(false);

        if (success && team && manager) {
            setIsInvitationValid(true);
            setTeam(team);
            setManagerName(manager.name || manager.email);
        } else {
            setIsInvitationValid(false);
            setError(error || "O link de convite é inválido ou a equipe não existe mais.");
        }
    }
    if (firestore) {
        validateInvitation();
    }
  }, [teamId, firestore, router]);

  const handleAuth = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setShowPendingMessage(false);

    if (!auth || !firestore || !teamId || !isInvitationValid) {
      setError("Ocorreu um erro. Verifique se o link de convite é válido.");
      setIsLoading(false);
      return;
    }
    
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const newUser = userCredential.user;

        const userProfile = {
          uid: newUser.uid,
          email: newUser.email,
          role: 'user' as const,
          status: 'pending' as const,
          createdAt: serverTimestamp(),
          teamId: teamId, 
          sector: '', // User starts without a sector, manager will assign it.
          permissions: {
            canViewFGTS: false,
            canViewCLT: false,
            canViewINSS: false,
          }
        };

        await setDoc(doc(firestore, "users", newUser.uid), userProfile);
        
        await logActivity({
            userId: newUser.uid,
            action: 'User Registration (Invitation)',
            details: `New user ${newUser.email} signed up for team ${teamId}.`,
            teamId: teamId,
        });
        
        setShowPendingMessage(true);
        await signOut(auth);

    } catch (err) {
      const authError = err as AuthError;
      let friendlyMessage = 'Ocorreu um erro. Tente novamente.';
      switch (authError.code) {
        case 'auth/email-already-in-use':
          friendlyMessage = 'Este e-mail já está em uso. Tente fazer o login.';
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

  if (isUserLoading || user || isInvitationValid === null) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin" /></div>;
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
                 Sua solicitação para entrar na equipe foi enviada e está aguardando aprovação.
               </CardDescription>
             </CardHeader>
             <CardFooter>
               <Button className="w-full" asChild>
                   <Link href="/">Ir para o Login</Link>
                </Button>
             </CardFooter>
           </Card>
        ) : (
          <Card>
            <form onSubmit={handleAuth}>
              <CardHeader className="text-center">
                <CardTitle className="font-headline text-2xl font-semibold">
                  Criar Conta para Equipe
                </CardTitle>
                 {isInvitationValid ? (
                     <CardDescription>
                        Você foi convidado para a equipe <strong>{team?.name}</strong>. Preencha seus dados para se registrar.
                    </CardDescription>
                 ) : (
                    <CardDescription>
                        Carregando informações do convite...
                    </CardDescription>
                 )}
              </CardHeader>
              <CardContent className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Erro no Cadastro</AlertTitle>
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
                    disabled={isLoading || !isInvitationValid}
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <Input 
                    id="password" 
                    type="password" 
                    required 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading || !isInvitationValid}
                    autoComplete="new-password"
                  />
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-4">
                <Button className="w-full" type="submit" disabled={isLoading || !isInvitationValid}>
                  {isLoading ? "Criando conta..." : "Criar conta e solicitar acesso"}
                </Button>
                 <div className="text-center text-sm text-muted-foreground">
                    Já tem uma conta?{' '}
                    <Link href="/" className="text-primary hover:underline">
                        Faça o login
                    </Link>
                </div>
              </CardFooter>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}

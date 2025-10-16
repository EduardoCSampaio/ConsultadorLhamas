'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useUser, useFirestore, useMemoFirebase, useDoc } from '@/firebase';
import type { UserProfile } from '@/app/actions/users';
import { getAllTeams, type TeamWithManager } from '@/app/actions/teams';
import { Users, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { doc } from 'firebase/firestore';


function SuperAdminTeamView() {
    const { toast } = useToast();
    const [teams, setTeams] = useState<TeamWithManager[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchAllTeams = useCallback(async () => {
        setIsLoading(true);
        const { teams, error } = await getAllTeams();
        if (error) {
            toast({ variant: 'destructive', title: 'Erro ao buscar equipes', description: error });
            setTeams([]);
        } else {
            setTeams(teams || []);
        }
        setIsLoading(false);
    }, [toast]);

    useEffect(() => {
        fetchAllTeams();
    }, [fetchAllTeams]);

    return (
        <>
            <PageHeader
                title="Gerenciamento de Equipes"
                description="Visualize e gerencie todas as equipes da plataforma."
            />
            <Card>
                <CardHeader>
                    <CardTitle>Visão Geral de Equipes</CardTitle>
                </CardHeader>
                <CardContent>
                   <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nome da Equipe</TableHead>
                                    <TableHead>Gerente</TableHead>
                                    <TableHead className="text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    Array.from({ length: 3 }).map((_, i) => (
                                        <TableRow key={i}>
                                            <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                                            <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                                            <TableCell className="text-right"><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                                        </TableRow>
                                    ))
                                ) : teams.length > 0 ? (
                                    teams.map(team => (
                                        <TableRow key={team.id}>
                                            <TableCell className="font-medium">{team.name}</TableCell>
                                            <TableCell>{team.managerEmail}</TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="outline" size="sm" asChild>
                                                    <Link href={`/teams/${team.id}`}>
                                                        Gerenciar
                                                        <ArrowRight className="ml-2 h-4 w-4" />
                                                    </Link>
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={3} className="h-60 text-center">
                                             <div className="flex flex-col items-center justify-center gap-4">
                                                <Users className="h-12 w-12 text-muted-foreground" />
                                                <h3 className="text-xl font-bold tracking-tight">Nenhuma equipe encontrada</h3>
                                                <p className="text-sm text-muted-foreground">
                                                    Ainda não há equipes criadas na plataforma.
                                                </p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                   </div>
                </CardContent>
            </Card>
        </>
    )
}

export default function TeamsHubPage() {
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const router = useRouter();

    const userProfileRef = useMemoFirebase(() => {
        if (!firestore || !user) return null;
        return doc(firestore, 'users', user.uid);
    }, [firestore, user]);
    
    const { data: userProfile, isLoading: isProfileLoading } = useDoc<UserProfile>(userProfileRef);

    useEffect(() => {
        // Wait until both user auth and profile data are fully loaded
        if (isUserLoading || isProfileLoading) {
            return; 
        }

        // If loading is finished and we have a profile
        if (userProfile) {
            // If the user is a manager and has a teamId, redirect them to their specific team page
            if (userProfile.role === 'manager' && userProfile.teamId) {
                router.replace(`/teams/${userProfile.teamId}`);
            }
            // If the user is a super_admin, they will see the SuperAdminTeamView.
            // If they are a manager without a teamId, they will see the message below.
            // If they are a regular 'user', they shouldn't be on this page, but we'll show the fallback.
        } else if (!isUserLoading && !isProfileLoading) {
            // If all loading is done and there's still no profile, something is wrong.
            // This could be a new user whose profile doc hasn't been created yet, or an error.
            // A redirect to login or an error page might be appropriate here.
             router.push('/');
        }
    }, [userProfile, isUserLoading, isProfileLoading, router]);

    if (isUserLoading || isProfileLoading || (userProfile?.role === 'manager' && userProfile.teamId)) {
        // Show a full-page loader while authenticating, loading profile, or redirecting a manager
        return (
            <div className='space-y-6'>
                <PageHeader title={<Skeleton className='h-8 w-48' />} description={<Skeleton className='h-5 w-80' />} />
                <Card>
                    <CardHeader>
                        <CardTitle><Skeleton className='h-7 w-56' /></CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Skeleton className='h-40 w-full' />
                    </CardContent>
                </Card>
            </div>
        );
    }
    
    if (userProfile?.role === 'super_admin') {
        return <SuperAdminTeamView />;
    }
    
    if (userProfile?.role === 'manager' && !userProfile.teamId) {
         return (
             <div className="flex flex-col gap-6">
                <PageHeader
                    title="Minha Equipe"
                    description="Gerencie os membros e setores da sua equipe."
                />
                 <Card>
                     <CardContent className="pt-6">
                         <div className="flex flex-col items-center justify-center gap-4 text-center h-60 border-2 border-dashed rounded-lg">
                            <Users className="h-12 w-12 text-muted-foreground" />
                            <h3 className="text-2xl font-bold tracking-tight">Equipe não encontrada</h3>
                            <p className="text-sm text-muted-foreground">
                                Parece que sua conta de gerente não está vinculada a uma equipe. Entre em contato com o suporte.
                            </p>
                        </div>
                     </CardContent>
                 </Card>
            </div>
         );
    }

    // Fallback for regular 'user' role or other unexpected cases.
    return (
        <div className="flex flex-col gap-6">
            <PageHeader title="Acesso Negado" />
            <Card>
                <CardContent className="pt-6">
                    <p>Você não tem permissão para acessar esta página.</p>
                </CardContent>
            </Card>
        </div>
    );
}

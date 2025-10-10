'use client';

import { useState, useEffect, useMemo } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useUser, useFirestore, useMemoFirebase, useDoc } from '@/firebase';
import { collection, query, where, doc } from 'firebase/firestore';
import { useCollection } from '@/firebase/firestore/use-collection';
import type { UserProfile } from '@/app/actions/users';
import { Copy, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type UserStatus = UserProfile['status'];

const getStatusVariant = (status: UserStatus) => {
    switch (status) {
        case 'active': return 'default';
        case 'pending': return 'secondary';
        case 'rejected': case 'inactive': return 'destructive';
        default: return 'outline';
    }
};

const getStatusText = (status: UserStatus) => {
    switch (status) {
        case 'active': return 'Ativo';
        case 'pending': return 'Pendente';
        case 'rejected': return 'Rejeitado';
        case 'inactive': return 'Inativo';
        default: return status;
    }
};

export default function MyTeamPage() {
    const { user: manager, isUserLoading: isManagerAuthLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();

    // Directly get the teamId from the manager's profile
    const managerProfileRef = useMemoFirebase(() => {
        if (!firestore || !manager) return null;
        return doc(firestore, 'users', manager.uid);
    }, [firestore, manager]);
    
    const { data: managerProfile, isLoading: isManagerProfileLoading } = useDoc<UserProfile>(managerProfileRef);
    const teamId = managerProfile?.teamId;

    const teamMembersQuery = useMemoFirebase(() => {
        if (!firestore || !teamId) return null;
        // Query for users that belong to the manager's team.
        return query(collection(firestore, 'users'), where('teamId', '==', teamId));
    }, [firestore, teamId]);

    const { data: teamMembers, isLoading: areMembersLoading } = useCollection<UserProfile>(teamMembersQuery);
    
    const teamMembersFiltered = useMemo(() => {
        // Also filter out the manager themselves from the list
        return teamMembers?.filter(member => member.uid !== manager?.uid);
    }, [teamMembers, manager]);


    const isLoading = isManagerAuthLoading || isManagerProfileLoading || areMembersLoading;
    
    const invitationLink = useMemo(() => {
        if (typeof window !== 'undefined' && teamId) {
            return `${window.location.origin}/signup?convite=${teamId}`;
        }
        return '';
    }, [teamId]);

    const copyToClipboard = () => {
        if (!invitationLink) return;
        navigator.clipboard.writeText(invitationLink);
        toast({ title: "Link de convite copiado!" });
    };

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title="Minha Equipe"
                description="Gerencie os membros da sua equipe e compartilhe o link de convite."
            />

            <Card>
                <CardHeader>
                    <CardTitle>Link de Convite</CardTitle>
                    <CardDescription>Compartilhe este link para que novos usuários possam solicitar entrada na sua equipe.</CardDescription>
                </CardHeader>
                <CardContent>
                    {isManagerProfileLoading || !teamId ? (
                         <Skeleton className="h-10 w-full" />
                    ) : (
                        <div className="flex items-center gap-2">
                            <input
                                readOnly
                                value={invitationLink}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                            <Button onClick={copyToClipboard} size="icon" disabled={!invitationLink}>
                                <Copy className="h-4 w-4" />
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Membros da Equipe</CardTitle>
                    <CardDescription>Visualize e gerencie os usuários do seu time.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Setor</TableHead>
                                    <TableHead className="text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    Array.from({ length: 3 }).map((_, i) => (
                                        <TableRow key={i}>
                                            <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                                            <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                                            <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                            <TableCell className="text-right"><Skeleton className="h-8 w-24" /></TableCell>
                                        </TableRow>
                                    ))
                                ) : teamMembersFiltered && teamMembersFiltered.length > 0 ? (
                                    teamMembersFiltered.map(member => (
                                        <TableRow key={member.uid}>
                                            <TableCell className="font-medium">{member.email}</TableCell>
                                            <TableCell>
                                                <Badge variant={getStatusVariant(member.status)}>
                                                    {getStatusText(member.status)}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>{member.sector || 'Não definido'}</TableCell>
                                            <TableCell className="text-right">
                                                {/* Action buttons will go here */}
                                                <Button variant="outline" size="sm" disabled>
                                                    Gerenciar
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-60 text-center">
                                            <div className="flex flex-col items-center justify-center gap-4">
                                                <Users className="h-12 w-12 text-muted-foreground" />
                                                <h3 className="text-xl font-bold tracking-tight">Nenhum membro na equipe</h3>
                                                <p className="text-sm text-muted-foreground">
                                                    Compartilhe o link de convite para adicionar membros.
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
        </div>
    );
}

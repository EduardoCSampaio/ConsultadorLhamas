
'use client';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection } from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { updateUserStatus } from "@/app/actions/users";
import { useToast } from "@/hooks/use-toast";
import { Check, X } from "lucide-react";
import type { UserProfile } from "@/app/actions/users";

export default function AdminUsersPage() {
    const firestore = useFirestore();
    const { toast } = useToast();

    const usersCollectionRef = useMemoFirebase(() => {
        if (!firestore) return null;
        return collection(firestore, 'users');
    }, [firestore]);

    const { data: users, isLoading } = useCollection<UserProfile>(usersCollectionRef);

    const handleStatusChange = async (uid: string, newStatus: 'active' | 'rejected') => {
        const result = await updateUserStatus({ uid, status: newStatus });
        if (result.success) {
            toast({
                title: "Status do usuário atualizado!",
                description: `O usuário foi ${newStatus === 'active' ? 'aprovado' : 'rejeitado'}.`,
            });
        } else {
            toast({
                variant: "destructive",
                title: "Erro ao atualizar status",
                description: result.error,
            });
        }
    };

    const getStatusVariant = (status: string) => {
        switch (status) {
            case 'active':
                return 'default';
            case 'pending':
                return 'secondary';
            case 'rejected':
                return 'destructive';
            default:
                return 'outline';
        }
    };
    
    const getStatusText = (status: string) => {
        switch (status) {
            case 'active':
                return 'Ativo';
            case 'pending':
                return 'Pendente';
            case 'rejected':
                return 'Rejeitado';
            default:
                return status;
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title="Gerenciamento de Usuários"
                description="Aprove, rejeite e gerencie o acesso dos usuários ao sistema."
            />
            <Card>
                <CardHeader>
                    <CardTitle>Lista de Usuários</CardTitle>
                    <CardDescription>
                        Todos os usuários cadastrados no sistema estão listados abaixo.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Função</TableHead>
                                    <TableHead className="text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <TableRow key={i}>
                                            <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                                            <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                                            <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                                            <TableCell className="text-right"><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    users?.map((user) => (
                                        <TableRow key={user.uid}>
                                            <TableCell className="font-medium">{user.email}</TableCell>
                                            <TableCell>
                                                <Badge variant={getStatusVariant(user.status)} className="capitalize">
                                                    {getStatusText(user.status)}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="capitalize">{user.role}</TableCell>
                                            <TableCell className="text-right">
                                                {user.status === 'pending' ? (
                                                    <div className="flex gap-2 justify-end">
                                                        <Button variant="outline" size="sm" onClick={() => handleStatusChange(user.uid, 'active')}>
                                                            <Check className="mr-2 h-4 w-4"/>
                                                            Aprovar
                                                        </Button>
                                                        <Button variant="destructive" size="sm" onClick={() => handleStatusChange(user.uid, 'rejected')}>
                                                            <X className="mr-2 h-4 w-4"/>
                                                            Rejeitar
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">Nenhuma ação pendente</span>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                     {!isLoading && users?.length === 0 && (
                        <div className="flex flex-col items-center justify-center gap-4 text-center h-60 border-2 border-dashed rounded-lg mt-4">
                            <h3 className="text-2xl font-bold tracking-tight">Nenhum usuário encontrado</h3>
                            <p className="text-sm text-muted-foreground">
                                Ainda não há usuários cadastrados no sistema.
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

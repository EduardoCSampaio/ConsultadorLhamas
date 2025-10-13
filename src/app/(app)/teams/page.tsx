
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useUser, useFirestore, useMemoFirebase, useDoc } from '@/firebase';
import type { UserProfile, UserPermissions } from '@/app/actions/users';
import { updateUserStatus } from '@/app/actions/users';
import { updateTeamSectors, getTeamMembers } from '@/app/actions/teams';
import { Copy, Users, Check, X, UserX, UserCheck, Pencil, Trash2, Plus, Save, Loader2, Settings } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Team } from '@/app/actions/teams';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger
} from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { doc } from 'firebase/firestore';


type UserStatus = UserProfile['status'];
const permissionLabels: Record<keyof UserPermissions, string> = {
    canViewFGTS: "Acesso a Consultas FGTS",
    canViewCLT: "Acesso a Consultas CLT",
    canViewINSS: "Acesso a Consultas INSS",
};

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

function SuperAdminTeamView() {
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
                    <div className="flex flex-col items-center justify-center gap-4 text-center h-60 border-2 border-dashed rounded-lg">
                        <Users className="h-12 w-12 text-muted-foreground" />
                        <h3 className="text-2xl font-bold tracking-tight">Funcionalidade em Breve</h3>
                        <div className="text-sm text-muted-foreground">
                            A capacidade de visualizar e gerenciar todas as equipes como Super Admin está em desenvolvimento.
                        </div>
                    </div>
                </CardContent>
            </Card>
        </>
    )
}

export default function MyTeamPage() {
    const { user: manager, isUserLoading: isManagerAuthLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();

    const [team, setTeam] = useState<Team | null>(null);
    const [teamMembers, setTeamMembers] = useState<UserProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    
    const [isSavingSectors, setIsSavingSectors] = useState(false);
    const [isSectorModalOpen, setIsSectorModalOpen] = useState(false);
    const [currentSector, setCurrentSector] = useState<{name: string, permissions: UserPermissions, isManager?: boolean} | null>(null);
    const [editingSectorName, setEditingSectorName] = useState<string | null>(null);


    const managerProfileRef = useMemoFirebase(() => {
        if (!firestore || !manager) return null;
        return doc(firestore, 'users', manager.uid);
    }, [firestore, manager]);
    
    const { data: managerProfile, isLoading: isManagerProfileLoading } = useDoc<UserProfile>(managerProfileRef);
    const teamId = managerProfile?.teamId;

    const teamRef = useMemoFirebase(() => {
        if (!firestore || !teamId) return null;
        return doc(firestore, 'teams', teamId);
    }, [firestore, teamId]);

    const { data: teamData } = useDoc<Team>(teamRef);

     useEffect(() => {
        if (teamData) {
            setTeam(teamData);
        }
    }, [teamData]);

    const fetchTeamData = useCallback(async (id: string) => {
        if (!firestore || !manager) return;
        
        setIsLoading(true);
        try {
            // Fetch team members using server action
            const { members, error } = await getTeamMembers({ teamId: id, managerId: manager.uid });
            if (error) {
                throw new Error(error);
            }
            setTeamMembers(members || []);

        } catch (error) {
            console.error("Error fetching team data:", error);
            const message = error instanceof Error ? error.message : 'Ocorreu um erro inesperado.'
             if (message.includes('permission-denied') || message.includes('Missing or insufficient permissions')) {
                 toast({ variant: 'destructive', title: 'Erro de Permissão', description: 'Você não tem permissão para ver os membros da equipe.' });
            } else {
                 toast({ variant: 'destructive', title: 'Erro ao buscar dados da equipe', description: message });
            }
        } finally {
            setIsLoading(false);
        }
    }, [firestore, manager, toast]);

    useEffect(() => {
        if (isManagerProfileLoading || isManagerAuthLoading) return;

        if (managerProfile?.role === 'super_admin') {
            setIsLoading(false);
            return;
        }

        if (teamId) {
            fetchTeamData(teamId);
        } else if (!isManagerProfileLoading && managerProfile) {
            setIsLoading(false);
        }
    }, [teamId, managerProfile, isManagerProfileLoading, isManagerAuthLoading, fetchTeamData]);


    const handleStatusChange = async (uid: string, status: UserStatus) => {
        setUpdatingId(uid);
        const result = await updateUserStatus({ uid, status });
        if (result.success) {
            toast({
                title: "Status do usuário atualizado!",
            });
            if (teamId) await fetchTeamData(teamId);
        } else {
            toast({
                variant: "destructive",
                title: "Erro ao atualizar status",
                description: result.error,
            });
        }
        setUpdatingId(null);
    };

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
    
    const finalLoadingState = isLoading || isManagerAuthLoading || isManagerProfileLoading;
    
    const handleOpenSectorModal = (sectorName?: string) => {
        if (sectorName && team?.sectors[sectorName]) {
            setEditingSectorName(sectorName);
            setCurrentSector({ name: sectorName, ...team.sectors[sectorName] });
        } else {
            setEditingSectorName(null);
            setCurrentSector({ name: '', permissions: { canViewCLT: false, canViewFGTS: false, canViewINSS: false } });
        }
        setIsSectorModalOpen(true);
    };

    const handleSaveSector = async () => {
        if (!teamId || !currentSector || !currentSector.name) {
            toast({ variant: 'destructive', title: 'Nome do setor é obrigatório.' });
            return;
        }

        setIsSavingSectors(true);
        
        const newSectors = { ...team?.sectors };
        
        if (editingSectorName && editingSectorName !== currentSector.name) {
            delete newSectors[editingSectorName];
        }
        
        newSectors[currentSector.name] = {
            permissions: currentSector.permissions,
            isManager: currentSector.isManager || false,
        };

        const result = await updateTeamSectors({ teamId, sectors: newSectors });

        if (result.success) {
            toast({ title: 'Setores atualizados com sucesso!' });
            setIsSectorModalOpen(false);
            if (teamId) await fetchTeamData(teamId);
        } else {
            toast({ variant: 'destructive', title: 'Erro ao salvar setores', description: result.message });
        }
        setIsSavingSectors(false);
    };

    const handleDeleteSector = async (sectorName: string) => {
        if (!teamId || !team?.sectors) return;

        // Prevent deleting a sector that is in use
        if (teamMembers.some(m => m.sector === sectorName)) {
            toast({ variant: 'destructive', title: 'Setor em uso', description: 'Não é possível excluir um setor que está sendo utilizado por membros da equipe.' });
            return;
        }
        
        const newSectors = { ...team.sectors };
        delete newSectors[sectorName];

        setIsSavingSectors(true);
        const result = await updateTeamSectors({ teamId, sectors: newSectors });
        if (result.success) {
            toast({ title: 'Setor excluído com sucesso!' });
            if (teamId) await fetchTeamData(teamId);
        } else {
             toast({ variant: 'destructive', title: 'Erro ao excluir setor', description: result.message });
        }
        setIsSavingSectors(false);
    };

    const renderActionButtons = (user: UserProfile) => {
        const isUpdating = updatingId === user.uid;

        if (user.status === 'pending') {
            return (
                <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => handleStatusChange(user.uid, 'active')} disabled={isUpdating}>
                        <Check className="mr-2 h-4 w-4"/> Aprovar
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleStatusChange(user.uid, 'rejected')} disabled={isUpdating}>
                        <X className="mr-2 h-4 w-4"/> Rejeitar
                    </Button>
                </div>
            );
        }
         if (user.status === 'active') {
            return (
                <Button variant="destructive" size="sm" onClick={() => handleStatusChange(user.uid, 'inactive')} disabled={isUpdating}>
                    <UserX className="mr-2 h-4 w-4"/> Inativar
                </Button>
            );
        }
        if (user.status === 'rejected' || user.status === 'inactive') {
            return (
                <Button variant="outline" size="sm" onClick={() => handleStatusChange(user.uid, 'active')} disabled={isUpdating}>
                    <UserCheck className="mr-2 h-4 w-4"/> Reativar
                </Button>
            );
        }

        return null;
    };


    if (managerProfile?.role === 'super_admin' && !finalLoadingState) {
        return <SuperAdminTeamView />;
    }


    return (
        <>
            <div className="flex flex-col gap-6">
                <PageHeader
                    title={team?.name ? `Equipe: ${team.name}` : "Minha Equipe"}
                    description="Gerencie os membros e setores da sua equipe e compartilhe o link de convite."
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
                    <CardHeader className='flex-row items-center justify-between'>
                        <div>
                            <CardTitle>Setores da Equipe</CardTitle>
                            <CardDescription>Crie e gerencie os cargos e suas respectivas permissões.</CardDescription>
                        </div>
                        <Button onClick={() => handleOpenSectorModal()}>
                            <Plus className="mr-2 h-4 w-4" />
                            Novo Setor
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nome do Setor</TableHead>
                                        <TableHead>Permissões</TableHead>
                                        <TableHead className="text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {finalLoadingState || !team ? (
                                         Array.from({ length: 2 }).map((_, i) => (
                                            <TableRow key={i}>
                                                <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                                <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                                                <TableCell className="text-right"><Skeleton className="h-8 w-24" /></TableCell>
                                            </TableRow>
                                        ))
                                    ) : team.sectors && Object.keys(team.sectors).length > 0 ? (
                                        Object.entries(team.sectors).map(([name, sector]) => (
                                            <TableRow key={name}>
                                                <TableCell className="font-medium">{name}</TableCell>
                                                <TableCell className='text-xs text-muted-foreground'>
                                                    {Object.entries(sector.permissions)
                                                        .filter(([_, value]) => value)
                                                        .map(([key]) => permissionLabels[key as keyof UserPermissions])
                                                        .join(' | ') || 'Nenhuma permissão'
                                                    }
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button variant="outline" size="sm" onClick={() => handleOpenSectorModal(name)}>
                                                        <Pencil className="mr-2 h-3 w-3" />
                                                        Editar
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                         <TableRow>
                                            <TableCell colSpan={3} className="h-24 text-center">
                                                Nenhum setor criado.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
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
                                    {finalLoadingState ? (
                                        Array.from({ length: 3 }).map((_, i) => (
                                            <TableRow key={i}>
                                                <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                                                <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                                                <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                                <TableCell className="text-right"><Skeleton className="h-8 w-48 ml-auto" /></TableCell>
                                            </TableRow>
                                        ))
                                    ) : teamMembers && teamMembers.length > 0 ? (
                                        teamMembers.map(member => (
                                            <TableRow key={member.uid}>
                                                <TableCell className="font-medium">{member.email}</TableCell>
                                                <TableCell>
                                                    <Badge variant={getStatusVariant(member.status)}>
                                                        {getStatusText(member.status)}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>{member.sector || 'Não definido'}</TableCell>
                                                <TableCell className="text-right">
                                                    {renderActionButtons(member)}
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

            {/* Sector Management Dialog */}
            <Dialog open={isSectorModalOpen} onOpenChange={setIsSectorModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingSectorName ? 'Editar Setor' : 'Criar Novo Setor'}</DialogTitle>
                        <DialogDescription>
                            Defina o nome e as permissões de acesso para este setor.
                        </DialogDescription>
                    </DialogHeader>
                    {currentSector && (
                         <div className="grid gap-6 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="sector-name" className="text-right">
                                    Nome
                                </Label>
                                <Input
                                    id="sector-name"
                                    value={currentSector.name}
                                    onChange={(e) => setCurrentSector(prev => prev ? { ...prev, name: e.target.value } : null)}
                                    className="col-span-3"
                                    placeholder="Ex: Vendas Internas"
                                />
                            </div>
                            
                            <Separator />

                            <div>
                                <h3 className="text-base font-semibold mb-4">Permissões de Acesso</h3>
                                <div className="space-y-3">
                                    {(Object.keys(permissionLabels) as Array<keyof UserPermissions>).map((key) => {
                                        const managerHasPermission = managerProfile?.permissions?.[key] ?? false;
                                        return (
                                            <div key={key} className="flex items-center space-x-3">
                                                <Checkbox
                                                    id={`perm-${key}`}
                                                    checked={!!currentSector.permissions[key]}
                                                    onCheckedChange={(checked) => {
                                                        setCurrentSector(prev => prev ? {
                                                            ...prev,
                                                            permissions: { ...prev.permissions, [key]: !!checked }
                                                        } : null);
                                                    }}
                                                    disabled={!managerHasPermission}
                                                />
                                                <Label htmlFor={`perm-${key}`} className={`font-normal text-sm ${!managerHasPermission && 'text-muted-foreground'}`}>
                                                    {permissionLabels[key]}
                                                    {!managerHasPermission && <span className='text-xs'> (Você não possui esta permissão)</span>}
                                                </Label>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                         </div>
                    )}
                    <DialogFooter className='items-center'>
                         {editingSectorName && (
                             <AlertDialog>
                                <AlertDialogTrigger asChild>
                                     <Button variant="destructive" className="mr-auto">
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Excluir Setor
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                    <AlertDialogTitle>Excluir "{editingSectorName}"?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Esta ação não pode ser desfeita. Isso removerá o setor permanentemente. A exclusão só é permitida se nenhum membro da equipe estiver neste setor.
                                    </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction
                                        className="bg-destructive hover:bg-destructive/90"
                                        onClick={() => {
                                            handleDeleteSector(editingSectorName);
                                            setIsSectorModalOpen(false);
                                        }}
                                    >
                                        Sim, excluir
                                    </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                         )}
                        <Button variant="outline" onClick={() => setIsSectorModalOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSaveSector} disabled={isSavingSectors}>
                            {isSavingSectors ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Salvar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

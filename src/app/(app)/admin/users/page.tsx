
'use client';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { updateUserStatus, getUsers, exportUsersToExcel, updateUserPermissions } from "@/app/actions/users";
import { useToast } from "@/hooks/use-toast";
import { Check, X, Pencil, UserX, UserCheck, Download, Loader2 } from "lucide-react";
import type { UserProfile, UserPermissions } from "@/app/actions/users";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUser } from "@/firebase";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";


type UserStatus = UserProfile['status'];

const permissionLabels: Record<keyof UserPermissions, string> = {
    canViewFGTS: "Acesso a Consultas FGTS",
    canViewCLT: "Acesso a Consultas CLT",
    canViewINSS: "Acesso a Consultas INSS",
};

export default function AdminUsersPage() {
    const { toast } = useToast();
    const { user: adminUser } = useUser();
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [updatingId, setUpdatingId] = useState<string | null>(null);

    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
    
    // State for editing in modal
    const [newStatus, setNewStatus] = useState<UserStatus | null>(null);
    const [newPermissions, setNewPermissions] = useState<UserPermissions>({});


    const fetchUsers = async () => {
        setIsLoading(true);
        const { users: fetchedUsers, error } = await getUsers();
        if (error) {
            toast({
                variant: "destructive",
                title: "Erro ao carregar usuários",
                description: error,
            });
            setUsers([]);
        } else {
            // Filter out users without an email on the client-side as a safeguard
            setUsers(fetchedUsers?.filter(u => u.email) || []);
        }
        setIsLoading(false);
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleStatusChange = async (uid: string, status: UserStatus) => {
        setUpdatingId(uid);
        const result = await updateUserStatus({ uid, status });
        if (result.success) {
            toast({
                title: "Status do usuário atualizado!",
                description: `O status do usuário foi alterado com sucesso.`,
            });
            await fetchUsers(); // Refresh data
        } else {
            toast({
                variant: "destructive",
                title: "Erro ao atualizar status",
                description: result.error,
            });
        }
        setUpdatingId(null);
    };
    
    const handleOpenEditModal = (user: UserProfile) => {
        setSelectedUser(user);
        setNewStatus(user.status);
        setNewPermissions(user.permissions || {});
        setIsEditModalOpen(true);
    };

    const handleSaveChanges = async () => {
        if (!selectedUser) return;
        setUpdatingId(selectedUser.uid);
        
        let statusUpdated = true;
        if (newStatus && newStatus !== selectedUser.status) {
            const statusResult = await updateUserStatus({ uid: selectedUser.uid, status: newStatus });
            if (!statusResult.success) {
                toast({ variant: "destructive", title: "Erro ao atualizar status", description: statusResult.error });
                statusUpdated = false;
            }
        }
        
        const permsResult = await updateUserPermissions({ uid: selectedUser.uid, permissions: newPermissions });
        if (!permsResult.success) {
             toast({ variant: "destructive", title: "Erro ao atualizar permissões", description: permsResult.error });
        }

        if(statusUpdated && permsResult.success) {
             toast({ title: "Usuário atualizado com sucesso!" });
        }
        
        setIsEditModalOpen(false);
        setUpdatingId(null);
        await fetchUsers();
    };
    
     const handleExport = async () => {
        if (!adminUser) {
            toast({ variant: "destructive", title: "Erro de autenticação" });
            return;
        }
        setIsExporting(true);
        toast({ title: "Gerando relatório...", description: "Aguarde enquanto preparamos o arquivo de usuários." });
        
        const result = await exportUsersToExcel({ userId: adminUser.uid });

        if (result.status === 'success' && result.fileContent && result.fileName) {
            const link = document.createElement("a");
            link.href = result.fileContent;
            link.download = result.fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast({ title: "Download iniciado!", description: `O arquivo ${result.fileName} está sendo baixado.` });
        } else {
            toast({ variant: "destructive", title: "Erro ao exportar", description: result.message });
        }
        setIsExporting(false);
    };

    const getStatusVariant = (status: UserStatus) => {
        switch (status) {
            case 'active':
                return 'default';
            case 'pending':
                return 'secondary';
            case 'rejected':
            case 'inactive':
                return 'destructive';
            default:
                return 'outline';
        }
    };
    
    const getStatusText = (status: UserStatus) => {
        switch (status) {
            case 'active':
                return 'Ativo';
            case 'pending':
                return 'Pendente';
            case 'rejected':
                return 'Rejeitado';
            case 'inactive':
                return 'Inativo';
            default:
                return status;
        }
    };
    
    const renderActionButtons = (user: UserProfile) => {
        const isUpdating = updatingId === user.uid;

        if (user.role === 'admin') {
            return <span className="text-xs text-muted-foreground">Admin</span>;
        }

        switch (user.status) {
            case 'pending':
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
            case 'active':
                return (
                    <Button variant="destructive" size="sm" onClick={() => handleStatusChange(user.uid, 'inactive')} disabled={isUpdating}>
                        <UserX className="mr-2 h-4 w-4"/> Inativar
                    </Button>
                );
            case 'rejected':
            case 'inactive':
                return (
                    <Button variant="outline" size="sm" onClick={() => handleStatusChange(user.uid, 'active')} disabled={isUpdating}>
                        <UserCheck className="mr-2 h-4 w-4"/> Reativar
                    </Button>
                );
            default:
                return <span className="text-xs text-muted-foreground">Nenhuma ação</span>;
        }
    };

    return (
        <>
            <div className="flex flex-col gap-6">
                <PageHeader
                    title="Gerenciamento de Usuários"
                    description="Aprove, rejeite e gerencie o acesso dos usuários ao sistema."
                >
                     <Button onClick={handleExport} disabled={isExporting || isLoading}>
                        {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                        Exportar para Excel
                    </Button>
                </PageHeader>
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
                                                     <div className="flex gap-2 justify-end items-center">
                                                        {renderActionButtons(user)}
                                                        {user.role !== 'admin' && (
                                                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenEditModal(user)}>
                                                                <Pencil className="h-4 w-4" />
                                                            </Button>
                                                        )}
                                                    </div>
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
            
            <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
                <DialogContent className="sm:max-w-[480px]">
                    <DialogHeader>
                        <DialogTitle>Editar Usuário</DialogTitle>
                        <DialogDescription>
                            Altere o status e as permissões do usuário.
                        </DialogDescription>
                    </DialogHeader>
                    {selectedUser && (
                        <>
                            <div className="grid gap-6 py-4">
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="email" className="text-right">
                                        Email
                                    </Label>
                                    <Input id="email" value={selectedUser.email || ''} readOnly className="col-span-3" />
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="status" className="text-right">
                                        Status
                                    </Label>
                                    <Select
                                        value={newStatus || ''}
                                        onValueChange={(value) => setNewStatus(value as UserStatus)}
                                    >
                                        <SelectTrigger className="col-span-3">
                                            <SelectValue placeholder="Selecione um status" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="active">Ativo</SelectItem>
                                            <SelectItem value="pending">Pendente</SelectItem>
                                            <SelectItem value="inactive">Inativo</SelectItem>
                                            <SelectItem value="rejected">Rejeitado</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                
                                <Separator />

                                <div>
                                    <Label className="text-base font-semibold">Permissões de Acesso</Label>
                                    <div className="space-y-3 mt-4">
                                        {(Object.keys(permissionLabels) as Array<keyof UserPermissions>).map((key) => (
                                            <div key={key} className="flex items-center space-x-3">
                                                <Checkbox
                                                    id={`perm-${key}`}
                                                    checked={!!newPermissions[key]}
                                                    onCheckedChange={(checked) => {
                                                        setNewPermissions(prev => ({ ...prev, [key]: !!checked }));
                                                    }}
                                                />
                                                <Label htmlFor={`perm-${key}`} className="font-normal text-sm">
                                                    {permissionLabels[key]}
                                                </Label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancelar</Button>
                                <Button onClick={handleSaveChanges} disabled={updatingId === selectedUser?.uid}>
                                    {updatingId === selectedUser.uid ? "Salvando..." : "Salvar Mudanças"}
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}

    

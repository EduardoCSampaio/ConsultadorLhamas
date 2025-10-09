'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useUser, useFirebase } from '@/firebase';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updateProfile } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UploadCloud, Image as ImageIcon } from 'lucide-react';
import Image from 'next/image';

export function ImageUploadDialog({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const { auth, firestore } = useFirebase();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const selectedFile = acceptedFiles[0];
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpeg', '.png', '.jpg', '.gif'] },
    multiple: false,
  });

  const handleUpload = async () => {
    if (!file || !user || !auth) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Nenhum arquivo selecionado ou usuário não autenticado.',
      });
      return;
    }

    setIsUploading(true);

    try {
      const storage = getStorage(auth.app);
      const storageRef = ref(storage, `profile-pictures/${user.uid}/${file.name}`);

      // Upload file
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);

      // Update Firebase Auth user profile
      await updateProfile(user, { photoURL: downloadURL });
      
      // Update Firestore user document
      if (firestore) {
        const userDocRef = doc(firestore, 'users', user.uid);
        await updateDoc(userDocRef, { photoURL: downloadURL });
      }

      toast({
        title: 'Sucesso!',
        description: 'Sua foto de perfil foi atualizada.',
      });

      // Close dialog and reset state
      setFile(null);
      setPreview(null);
      setIsOpen(false);
    } catch (error) {
      console.error('Error uploading image:', error);
      const message = error instanceof Error ? error.message : 'Ocorreu um erro desconhecido.';
      toast({
        variant: 'destructive',
        title: 'Erro no Upload',
        description: message,
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setPreview(null);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => {
        if(isUploading) e.preventDefault();
      }}>
        <DialogHeader>
          <DialogTitle>Alterar Foto de Perfil</DialogTitle>
          <DialogDescription>
            Selecione uma nova imagem para o seu perfil.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div
            {...getRootProps()}
            className={`flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
              isDragActive ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
            }`}
          >
            <input {...getInputProps()} />
            {preview ? (
              <div className="relative h-32 w-32 rounded-full overflow-hidden">
                <Image src={preview} alt="Pré-visualização" layout="fill" objectFit="cover" />
              </div>
            ) : (
              <div className="text-center">
                <UploadCloud className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="font-semibold">Arraste e solte a imagem aqui</p>
                <p className="text-sm text-muted-foreground">ou clique para selecionar</p>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isUploading}>
            Cancelar
          </Button>
          <Button onClick={handleUpload} disabled={!file || isUploading}>
            {isUploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ImageIcon className="mr-2 h-4 w-4" />
            )}
            {isUploading ? 'Enviando...' : 'Salvar Foto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

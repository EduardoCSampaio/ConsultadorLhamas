
'use client';

import { useState, useCallback } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useDropzone, FileRejection } from 'react-dropzone';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UploadCloud, Copy, Check } from 'lucide-react';
import { extractCpfFromImage, ExtractCpfOutput } from '@/ai/flows/extract-cpf-flow';
import Image from 'next/image';
import { Skeleton } from '@/components/ui/skeleton';

type ExtractionResult = {
  fileName: string;
  preview: string;
  result: ExtractCpfOutput | null;
  error?: string;
  isLoading: boolean;
};

const toBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });

export default function ExtractCpfPage() {
  const { toast } = useToast();
  const [results, setResults] = useState<ExtractionResult[]>([]);

  const handleExtraction = useCallback(async (file: File, index: number) => {
    try {
      const dataUri = await toBase64(file);
      const output = await extractCpfFromImage({ photoDataUri: dataUri });

      setResults((prev) =>
        prev.map((r, i) =>
          i === index ? { ...r, result: output, isLoading: false } : r
        )
      );
    } catch (error) {
      console.error('Error extracting CPF:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido.';
      setResults((prev) =>
        prev.map((r, i) =>
          i === index
            ? { ...r, error: errorMessage, isLoading: false }
            : r
        )
      );
      toast({
        variant: 'destructive',
        title: `Erro ao processar ${file.name}`,
        description: errorMessage,
      });
    }
  }, [toast]);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const newFiles: ExtractionResult[] = acceptedFiles.map((file) => ({
        fileName: file.name,
        preview: URL.createObjectURL(file),
        result: null,
        isLoading: true,
      }));

      setResults((prev) => [...prev, ...newFiles]);

      newFiles.forEach((file, i) => {
        const originalFile = acceptedFiles[i];
        handleExtraction(originalFile, results.length + i);
      });
    },
    [handleExtraction, results.length]
  );

  const onDropRejected = useCallback((fileRejections: FileRejection[]) => {
    fileRejections.forEach(({ file, errors }) => {
      toast({
        variant: 'destructive',
        title: `Arquivo Rejeitado: ${file.name}`,
        description: errors.map((e) => e.message).join(', '),
      });
    });
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected,
    accept: { 'image/*': ['.jpeg', '.png', '.jpg', '.gif'] },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Extrair CPF de Imagens"
        description="Faça o upload de uma ou mais imagens para extrair o número de CPF contido nelas."
      />

      <Card>
        <CardContent className="pt-6">
          <div
            {...getRootProps()}
            className={`flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
              isDragActive ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
            }`}
          >
            <input {...getInputProps()} />
            <UploadCloud className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="font-semibold">Arraste e solte as imagens aqui</p>
            <p className="text-sm text-muted-foreground">ou clique para selecionar</p>
          </div>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {results.map((item, index) => (
            <ResultCard key={`${item.fileName}-${index}`} {...item} />
          ))}
        </div>
      )}
    </div>
  );
}

function ResultCard({ fileName, preview, result, error, isLoading }: ExtractionResult) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (cpfs: string[]) => {
    if (cpfs.length === 0) return;
    navigator.clipboard.writeText(cpfs.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <Image
          src={preview}
          alt={`Preview of ${fileName}`}
          width={400}
          height={200}
          className="rounded-t-lg object-cover aspect-video"
        />
      </CardHeader>
      <CardContent>
        <CardTitle className="text-base truncate">{fileName}</CardTitle>
        <div className="mt-4">
          {isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          )}
          {error && <Alert variant="destructive" className="text-xs">{error}</Alert>}
          {result && (
            <div>
              {result.cpfs && result.cpfs.length > 0 ? (
                <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">{result.cpfs.length} CPF(s) encontrado(s)</p>
                         <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleCopy(result.cpfs!)}
                            className="h-8 w-8"
                          >
                            {copied ? (
                              <Check className="h-4 w-4 text-green-500" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                    </div>
                  <div className="border rounded-md p-3 max-h-40 overflow-y-auto">
                    <ul className="space-y-1">
                        {result.cpfs.map((cpf, i) => (
                            <li key={i} className="font-mono text-sm">{cpf}</li>
                        ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">Nenhum CPF encontrado na imagem.</p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

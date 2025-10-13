
'use server';
/**
 * @fileOverview Um fluxo de IA para extrair um ou mais números de CPF de uma imagem.
 *
 * - extractCpfFromImage - Uma função que executa o fluxo de extração.
 * - ExtractCpfInput - O tipo de entrada para a função.
 * - ExtractCpfOutput - O tipo de retorno para a função.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const ExtractCpfInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "Uma foto de um documento, como um data URI que deve incluir um tipo MIME e usar codificação Base64. Formato esperado: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ExtractCpfInput = z.infer<typeof ExtractCpfInputSchema>;

const ExtractCpfOutputSchema = z.object({
  cpfs: z.array(z.string()).describe('Uma lista de todos os números de CPF extraídos da imagem, cada um formatado como XXX.XXX.XXX-XX.'),
});
export type ExtractCpfOutput = z.infer<typeof ExtractCpfOutputSchema>;

export async function extractCpfFromImage(
  input: ExtractCpfInput
): Promise<ExtractCpfOutput> {
  return extractCpfFlow(input);
}

const prompt = ai.definePrompt({
  name: 'extractCpfPrompt',
  input: { schema: ExtractCpfInputSchema },
  output: { schema: ExtractCpfOutputSchema },
  prompt: `Analise a imagem fornecida. Encontre todos os números de CPF. Retorne uma lista de todos os números de CPF encontrados, cada um formatado como XXX.XXX.XXX-XX. Se nenhum CPF for encontrado, retorne uma lista vazia para o campo cpfs.

Imagem: {{media url=photoDataUri}}`,
});

const extractCpfFlow = ai.defineFlow(
  {
    name: 'extractCpfFlow',
    inputSchema: ExtractCpfInputSchema,
    outputSchema: ExtractCpfOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);

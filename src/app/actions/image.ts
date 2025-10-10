
'use server';

import { z } from 'zod';

const imgbbResponseSchema = z.object({
  data: z.object({
    url: z.string().url(),
  }),
  success: z.boolean(),
  status: z.number(),
});

type UploadResult = {
  success: boolean;
  url?: string;
  message?: string;
};

export async function uploadImageToImgBB(base64Image: string): Promise<UploadResult> {
  const apiKey = process.env.IMGBB_API_KEY;

  if (!apiKey) {
    const errorMessage = 'A chave de API para o serviço de imagem não está configurada no ambiente do servidor (IMGBB_API_KEY).';
    console.error(errorMessage);
    return { success: false, message: errorMessage };
  }

  if (!base64Image) {
    return { success: false, message: 'Nenhuma imagem fornecida para upload.' };
  }

  try {
    // A API do ImgBB espera apenas a string base64, sem o prefixo data URI.
    const base64Data = base64Image.split(',').pop() || base64Image;

    const body = new URLSearchParams();
    body.append('image', base64Data);

    const response = await fetch(
      `https://api.imgbb.com/1/upload?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body,
      }
    );

    const responseData = await response.json();
    const parsedResponse = imgbbResponseSchema.safeParse(responseData);

    if (!response.ok || !parsedResponse.success || !parsedResponse.data.success) {
      console.error('ImgBB API Error:', parsedResponse.error || responseData);
      const apiErrorMessage = parsedResponse.success ? (responseData?.error?.message || 'Erro desconhecido da API ImgBB') : 'A resposta da API de imagem foi inválida.';
      return { success: false, message: `Erro da API ImgBB: ${apiErrorMessage}` };
    }

    return {
      success: true,
      url: parsedResponse.data.data.url,
      message: 'Imagem enviada com sucesso.',
    };
  } catch (error) {
    console.error('Error uploading to ImgBB:', error);
    const message = error instanceof Error ? error.message : 'Erro desconhecido no serviço de upload de imagem.';
    return { success: false, message };
  }
}

'use server';

import axios from 'axios';
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
    // A API do ImgBB espera um corpo `x-www-form-urlencoded`
    // Construir a string manualmente é mais robusto para garantir o formato correto.
    const requestBody = `image=${encodeURIComponent(base64Image)}`;

    const response = await axios.post(
      `https://api.imgbb.com/1/upload?key=${apiKey}`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const parsedResponse = imgbbResponseSchema.safeParse(response.data);

    if (!parsedResponse.success || !parsedResponse.data.success) {
      console.error('ImgBB API Error:', parsedResponse.error || response.data);
      const apiErrorMessage = parsedResponse.success ? response.data?.error?.message : 'A resposta da API de imagem foi inválida.';
      return { success: false, message: `Erro da API ImgBB: ${apiErrorMessage}` };
    }

    return {
      success: true,
      url: parsedResponse.data.data.url,
      message: 'Imagem enviada com sucesso.',
    };
  } catch (error) {
    console.error('Error uploading to ImgBB:', error);
    const message = axios.isAxiosError(error)
      ? error.response?.data?.error?.message || error.message
      : 'Erro desconhecido no serviço de upload de imagem.';
    return { success: false, message };
  }
}

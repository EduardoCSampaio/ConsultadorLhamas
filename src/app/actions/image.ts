
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
    const base64Data = base64Image.split(',').pop();
    if (!base64Data) {
        return { success: false, message: 'Formato de imagem Base64 inválido.' };
    }

    const formData = new FormData();
    formData.append('image', base64Data);

    const response = await fetch(
      `https://api.imgbb.com/1/upload?key=${apiKey}`,
      {
        method: 'POST',
        body: formData,
      }
    );

    const responseData = await response.json();
    
    if (!response.ok) {
        console.error('ImgBB API Error Response:', responseData);
        const apiErrorMessage = responseData?.error?.message || `Request failed with status ${response.status}`;
        return { success: false, message: `Erro da API ImgBB: ${apiErrorMessage}` };
    }
    
    const parsedResponse = imgbbResponseSchema.safeParse(responseData);

    if (!parsedResponse.success || !parsedResponse.data.success) {
      console.error('ImgBB API Error (Zod Validation):', parsedResponse.error || responseData);
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

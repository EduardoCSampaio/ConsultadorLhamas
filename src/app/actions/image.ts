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

// IMPORTANT: This API key is public and for a free, rate-limited service.
// It's suitable for demonstration purposes. For a production application,
// you should use a dedicated account and store the key in environment variables.
const IMGBB_API_KEY = '58a15993365191f64f33168278486064';
const IMGBB_UPLOAD_URL = 'https://api.imgbb.com/1/upload';

export async function uploadImageToImgBB(base64Image: string): Promise<UploadResult> {
  if (!base64Image) {
    return { success: false, message: 'Nenhuma imagem fornecida para upload.' };
  }

  try {
    const formData = new FormData();
    formData.append('image', base64Image);

    const response = await axios.post(
      `${IMGBB_UPLOAD_URL}?key=${IMGBB_API_KEY}`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    const parsedResponse = imgbbResponseSchema.safeParse(response.data);

    if (!parsedResponse.success || !parsedResponse.data.success) {
      console.error('ImgBB API Error:', parsedResponse.error || response.data);
      return { success: false, message: 'A resposta da API de imagem foi inválida.' };
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

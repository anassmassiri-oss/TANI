
import type { AspectRatio } from '../types';

// Generic fetch handler for API calls to our backend
const fetchApi = async (endpoint: string, body: object) => {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'An unknown error occurred.' }));
    throw new Error(errorData.error || `Request failed with status ${response.status}`);
  }

  return response.json();
};

/**
 * Generates an image by calling the backend service.
 * @param prompt - The text prompt describing the image to generate.
 * @param aspectRatio - The desired aspect ratio for the image.
 * @returns A promise that resolves to the base64 encoded image string.
 */
export const generateImage = async (prompt: string, aspectRatio: AspectRatio): Promise<string> => {
  const data = await fetchApi('/api/generate', { prompt, aspectRatio });
  if (!data.imageBase64) {
    throw new Error('Invalid response from server: missing imageBase64 data.');
  }
  return data.imageBase64;
};


/**
 * Edits an image by calling the backend service.
 * @param prompt - The text prompt describing the edit to perform.
 * @param imageBase64Data - The base64 encoded data of the image to edit.
 * @param mimeType - The MIME type of the uploaded image (e.g., 'image/png').
 * @param maskBase64Data - Optional base64 encoded data of the mask image.
 * @returns A promise that resolves to the base64 encoded edited image string.
 */
export const editImage = async (prompt: string, imageBase64Data: string, mimeType: string, maskBase64Data?: string): Promise<string> => {
    const body = {
        prompt,
        imageBase64Data,
        mimeType,
        maskBase64Data
    };
    const data = await fetchApi('/api/edit', body);
    if (!data.imageBase64) {
        throw new Error('Invalid response from server: missing imageBase64 data.');
    }
    return data.imageBase64;
};

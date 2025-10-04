import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { GoogleGenAI, Modality } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
// Increase the limit to handle base64 image data
app.use(express.json({ limit: '20mb' })); 

// --- Gemini API Setup ---
const apiKey = process.env.API_KEY;
if (!apiKey) {
  console.error("API_KEY environment variable is not set.");
  process.exit(1);
}
const ai = new GoogleGenAI({ apiKey });


// --- API Error Handler ---
const handleApiErrorResponse = (res, error) => {
  console.error('Error calling Gemini API:', error);
  let statusCode = 500;
  let message = 'Failed to process request due to an API error.';
  
  if (error instanceof Error) {
    if (error.message.includes('API key not valid')) {
      statusCode = 401;
      message = 'The provided API key is not valid.';
    } else if (error.message.includes('429')) {
      statusCode = 429;
      message = 'API rate limit exceeded. Please try again later.';
    } else if (error.message.startsWith('Image generation failed:')) {
      statusCode = 400;
      message = error.message;
    }
  }
  res.status(statusCode).json({ error: message });
};


// --- API Routes ---

// 1. Generate Image Endpoint
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt, aspectRatio } = req.body;
    if (!prompt || !aspectRatio) {
      return res.status(400).json({ error: 'Prompt and aspect ratio are required.' });
    }

    const response = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: prompt,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/jpeg',
        aspectRatio: aspectRatio,
      },
    });

    const image = response.generatedImages?.[0];
    if (image?.image?.imageBytes) {
      res.json({ imageBase64: image.image.imageBytes });
    } else {
      throw new Error('No image data received from the API.');
    }
  } catch (error) {
    handleApiErrorResponse(res, error);
  }
});


// 2. Edit Image Endpoint
app.post('/api/edit', async (req, res) => {
    try {
        const { prompt, imageBase64Data, mimeType, maskBase64Data } = req.body;
        if (!prompt || !imageBase64Data || !mimeType) {
            return res.status(400).json({ error: 'Prompt, image data, and mimeType are required.' });
        }

        const parts = [
            { inlineData: { data: imageBase64Data, mimeType } },
        ];
        
        if (maskBase64Data) {
            parts.push({
                inlineData: { data: maskBase64Data, mimeType: 'image/png' }
            });
            parts.push({ text: `Using the provided black and white mask image, apply the following edit only to the BLACK areas of the original image, leaving the white areas unchanged: "${prompt}"`});
        } else {
             parts.push({ text: prompt });
        }

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts },
            config: {
                systemInstruction: "You are an expert AI image editor. Your task is to take the user's image and their text prompt as a direct instruction to modify the image. If a black and white mask image is also provided, you MUST only apply the edits described in the prompt to the BLACK areas of the original image. The white areas of the mask indicate parts of the image that should remain unchanged. You must only return the edited image. Do not engage in conversation, ask for clarification, or respond with text. Apply the edit and output the resulting image.",
                responseModalities: [Modality.IMAGE, Modality.TEXT],
            },
        });
        
        const imagePart = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData?.data);

        if (imagePart?.inlineData?.data) {
            res.json({ imageBase64: imagePart.inlineData.data });
        } else {
            const textResponse = response.text;
            if (textResponse) {
                 console.error("Gemini API did not return an image. Text response:", textResponse);
                 throw new Error(`Image generation failed: ${textResponse}`);
            }
            console.error("Gemini API did not return an image. Full response:", JSON.stringify(response, null, 2));
            throw new Error('No image data was received from the API.');
        }
    } catch (error) {
        handleApiErrorResponse(res, error);
    }
});


// --- Static File Serving ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicPath = path.join(__dirname, 'public');

app.use(express.static(publicPath));

// Fallback to index.html for single-page application
app.get('*', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});


app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});

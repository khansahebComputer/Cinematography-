import { GoogleGenAI, Type, Modality, ThinkingLevel } from "@google/genai";
import { Project, Scene, Character } from "../types";

const apiKey = process.env.GEMINI_API_KEY || "";
const ai = new GoogleGenAI({ apiKey });

export const AIService = {
  async generateScript(prompt: string, style?: string): Promise<{ title: string; description: string; script: string }> {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: `Generate a video script based on this prompt: "${prompt}". 
      ${style ? `The visual style of the video should be: ${style}.` : ""}
      Return a JSON object with:
      - title: A catchy title
      - description: A brief summary
      - script: The full narrative script`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            script: { type: Type.STRING },
          },
          required: ["title", "description", "script"],
        },
      },
    });

    return JSON.parse(response.text || "{}");
  },

  async splitIntoScenes(script: string, style?: string): Promise<Partial<Scene>[]> {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: `Split the following script into logical scenes for a video. 
      ${style ? `The overall visual style is: ${style}. Ensure the visual prompts reflect this style.` : ""}
      For each scene, provide:
      - dialogue: The text to be spoken or narrated
      - visualPrompt: A detailed description for an AI image generator
      - duration: Estimated duration in seconds (min 3, max 10)
      
      Script: ${script}`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              dialogue: { type: Type.STRING },
              visualPrompt: { type: Type.STRING },
              duration: { type: Type.NUMBER },
            },
            required: ["dialogue", "visualPrompt", "duration"],
          },
        },
      },
    });

    return JSON.parse(response.text || "[]");
  },

  async generateImage(prompt: string, aspectRatio: string = "16:9", style?: string): Promise<string> {
    try {
      const finalPrompt = style ? `${prompt} -- Style: ${style}` : prompt;
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-image-preview",
        contents: {
          parts: [{ text: finalPrompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio as any,
            imageSize: "1K"
          }
        }
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
      throw new Error("No image generated");
    } catch (e) {
      console.error("Image generation failed, using placeholder", e);
      return `https://picsum.photos/seed/${encodeURIComponent(prompt.substring(0, 10))}/1280/720`;
    }
  },

  async generateSpeech(text: string, voice: string = "Zephyr"): Promise<string> {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice as any },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        return `data:audio/mp3;base64,${base64Audio}`;
      }
      throw new Error("No audio generated");
    } catch (e) {
      console.error("Speech generation failed", e);
      return "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"; // Fallback mock
    }
  }
};

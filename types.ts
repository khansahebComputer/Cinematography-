export interface Character {
  id: string;
  name: string;
  description: string;
  imagePrompt: string;
  imageUrl?: string;
  visualStyle?: string;
}

export interface Scene {
  id: string;
  index: number;
  dialogue: string;
  visualPrompt: string;
  duration: number; // in seconds
  status: 'idle' | 'generating' | 'completed' | 'error';
  videoUrl?: string;
  imageUrl?: string;
  audioUrl?: string;
  visualStyle?: string;
}

export interface Project {
  id: string;
  title: string;
  description: string;
  script: string;
  scenes: Scene[];
  characters: Character[];
  createdAt: number;
  updatedAt: number;
  aspectRatio: '16:9' | '9:16' | '1:1';
  visualStyle?: string;
}

export type AIModel = 'gemini-3-flash-preview' | 'gemini-3.1-pro-preview' | 'openai' | 'groq';

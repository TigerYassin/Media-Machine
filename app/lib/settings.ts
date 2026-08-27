export type ModelTier = "free" | "paid";

export interface ScriptModelOption {
  id: string;
  name: string;
  provider: "OpenAI" | "Groq";
  tier: ModelTier;
  description: string;
}

export interface ImageModelOption {
  id: string;
  name: string;
  tier: ModelTier;
  description: string;
}

export interface VoiceOption {
  id: string;
  name: string;
  description: string;
}

// Free tier via Groq (uses OpenAI-compatible API, requires GROQ_API_KEY)
// Paid via OpenAI (requires OPENAI_API_KEY)
export const SCRIPT_MODELS: ScriptModelOption[] = [
  { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", provider: "Groq", tier: "free", description: "Large, high quality — requires GROQ_API_KEY" },
  { id: "llama-3.1-8b-instant",    name: "Llama 3.1 8B Instant", provider: "Groq", tier: "free", description: "Fast, lightweight — requires GROQ_API_KEY" },
  { id: "gemma2-9b-it",            name: "Gemma 2 9B", provider: "Groq", tier: "free", description: "Google model via Groq — requires GROQ_API_KEY" },
  { id: "gpt-4o-mini",             name: "GPT-4o Mini", provider: "OpenAI", tier: "paid", description: "Best value — recommended default" },
  { id: "gpt-4.1-nano",            name: "GPT-4.1 Nano", provider: "OpenAI", tier: "paid", description: "Cheapest OpenAI model" },
  { id: "gpt-4.1-mini",            name: "GPT-4.1 Mini", provider: "OpenAI", tier: "paid", description: "Balanced speed & quality" },
  { id: "gpt-4o",                  name: "GPT-4o", provider: "OpenAI", tier: "paid", description: "High quality" },
  { id: "gpt-4.1",                 name: "GPT-4.1", provider: "OpenAI", tier: "paid", description: "Latest OpenAI flagship" },
];

export const IMAGE_MODELS: ImageModelOption[] = [
  { id: "dall-e-2",    name: "DALL-E 2",    tier: "paid", description: "Cheapest · square only (1024×1024)" },
  { id: "dall-e-3",    name: "DALL-E 3",    tier: "paid", description: "Better quality · portrait & landscape supported · billed per image" },
  { id: "gpt-image-1", name: "GPT Image 1", tier: "paid", description: "Best quality · all aspect ratios · up to 4 at once" },
];

export const ELEVENLABS_VOICES: VoiceOption[] = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel",  description: "Calm, professional female" },
  { id: "29vD33N1oss6BXCqPKq3", name: "Drew",    description: "Well-rounded male" },
  { id: "2EiwWnXFnvU5JabPnv8n", name: "Clyde",   description: "War-veteran male" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella",   description: "Soft, pleasant female" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni",  description: "Well-rounded male" },
  { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli",    description: "Energetic young female" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh",    description: "Deep, casual male" },
  { id: "VR6AewLTigWG4xSOukaG", name: "Arnold",  description: "Crisp, authoritative male" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam",    description: "Deep narration male" },
  { id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam",     description: "Raspy, intense male" },
];

export interface AppSettings {
  // AI models
  scriptModel: string;
  imageModel: string;
  klingMode: "pro" | "standard";
  voiceId: string;
  // Voiceover tuning
  wordsPerSecond: number;
  // Video defaults
  defaultVideoStyle: string;
  defaultVideoLength: string;
  // Image defaults
  defaultImagePlatform: string;
  defaultImageStyle: string;
  defaultImageTone: string;
  defaultImageCount: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  scriptModel: "gpt-4o-mini",
  imageModel: "gpt-image-1",
  klingMode: "pro",
  voiceId: "21m00Tcm4TlvDq8ikWAM",
  wordsPerSecond: 2.5,
  defaultVideoStyle: "TikTok Ad",
  defaultVideoLength: "60s",
  defaultImagePlatform: "Instagram Post",
  defaultImageStyle: "Photorealistic",
  defaultImageTone: "Professional",
  defaultImageCount: 2,
};

const STORAGE_KEY = "media-machine-settings";

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: AppSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// Size mappings per model — each model supports different aspect ratios
const GPT_IMAGE_1_SIZES: Record<string, "1024x1024" | "1024x1536" | "1536x1024"> = {
  "Instagram Post":    "1024x1024",
  "Instagram Story":   "1024x1536",
  "TikTok Cover":      "1024x1536",
  "Twitter / X":       "1536x1024",
  "LinkedIn":          "1536x1024",
  "YouTube Thumbnail": "1536x1024",
  "Facebook Post":     "1536x1024",
};

const DALLE3_SIZES: Record<string, "1024x1024" | "1024x1792" | "1792x1024"> = {
  "Instagram Post":    "1024x1024",
  "Instagram Story":   "1024x1792",
  "TikTok Cover":      "1024x1792",
  "Twitter / X":       "1792x1024",
  "LinkedIn":          "1792x1024",
  "YouTube Thumbnail": "1792x1024",
  "Facebook Post":     "1792x1024",
};

// DALL-E 2 only supports square — use 1024x1024 for all platforms
const DALLE2_SIZE = "1024x1024" as const;

const ALLOWED_PLATFORMS = Object.keys(GPT_IMAGE_1_SIZES);

const ALLOWED_STYLES = [
  "Photorealistic", "Cinematic", "Illustration", "3D Render",
  "Minimalist", "Neon / Cyberpunk", "Vintage / Retro", "Bold & Graphic",
];

const ALLOWED_TONES = [
  "Professional", "Fun & Playful", "Luxury",
  "Bold & Energetic", "Calm & Serene", "Dark & Dramatic",
];

const ALLOWED_IMAGE_MODELS = ["gpt-image-1", "dall-e-3", "dall-e-2"];

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not set." }, { status: 500 });
  }

  let body: {
    prompt?: unknown;
    platform?: unknown;
    style?: unknown;
    tone?: unknown;
    count?: unknown;
    imageModel?: unknown;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { prompt, platform, style, tone, count = 1, imageModel = "gpt-image-1" } = body;

  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    return NextResponse.json({ error: "`prompt` is required." }, { status: 400 });
  }
  if (typeof platform !== "string" || !ALLOWED_PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: `\`platform\` must be one of: ${ALLOWED_PLATFORMS.join(", ")}` }, { status: 400 });
  }
  if (typeof style !== "string" || !ALLOWED_STYLES.includes(style)) {
    return NextResponse.json({ error: `\`style\` must be one of: ${ALLOWED_STYLES.join(", ")}` }, { status: 400 });
  }
  if (typeof tone !== "string" || !ALLOWED_TONES.includes(tone)) {
    return NextResponse.json({ error: `\`tone\` must be one of: ${ALLOWED_TONES.join(", ")}` }, { status: 400 });
  }

  const model = ALLOWED_IMAGE_MODELS.includes(imageModel as string)
    ? (imageModel as string)
    : "gpt-image-1";

  const imageCount = Math.min(Math.max(Number(count) || 1, 1), 4);
  const enrichedPrompt = `${style} style, ${tone.toLowerCase()} tone, optimized for ${platform}. ${(prompt as string).trim()}. High quality, professional social media visual.`;

  const client = new OpenAI({ apiKey });

  try {
    let images: { url: string | null }[] = [];

    if (model === "gpt-image-1") {
      const size = GPT_IMAGE_1_SIZES[platform as string];
      const response = await client.images.generate({
        model: "gpt-image-1",
        prompt: enrichedPrompt,
        n: imageCount,
        size,
        quality: "high",
      });
      images = (response.data ?? []).map((img) => ({
        url: img.url ?? (img.b64_json ? `data:image/png;base64,${img.b64_json}` : null),
      }));

    } else if (model === "dall-e-3") {
      // DALL-E 3 only supports n=1 per request — fire imageCount parallel calls
      const size = DALLE3_SIZES[platform as string];
      const requests = Array.from({ length: imageCount }, () =>
        client.images.generate({
          model: "dall-e-3",
          prompt: enrichedPrompt,
          n: 1,
          size,
          quality: "hd",
        })
      );
      const responses = await Promise.all(requests);
      images = responses.flatMap((r) =>
        (r.data ?? []).map((img) => ({ url: img.url ?? null }))
      );

    } else {
      // dall-e-2 — square only, no quality param
      const response = await client.images.generate({
        model: "dall-e-2",
        prompt: enrichedPrompt,
        n: imageCount,
        size: DALLE2_SIZE,
      });
      images = (response.data ?? []).map((img) => ({ url: img.url ?? null }));
    }

    const filtered = images.filter((img) => img.url !== null);
    return NextResponse.json({ images: filtered, platform, size: model === "dall-e-2" ? DALLE2_SIZE : model === "dall-e-3" ? DALLE3_SIZES[platform as string] : GPT_IMAGE_1_SIZES[platform as string] }, { status: 200 });
  } catch (err) {
    console.error("generate-image error:", err);
    const message = err instanceof Error ? err.message : "Image generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

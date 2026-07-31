import { NextRequest, NextResponse } from "next/server";
import dns from "dns";
import { Agent, setGlobalDispatcher } from "undici";
import fsp from "fs/promises";
import path from "path";

dns.setDefaultResultOrder("ipv4first");
setGlobalDispatcher(new Agent({ connect: { family: 4 } }));

export const maxDuration = 300;

const TMP_DIR = path.join("/tmp", "engine-videos");

async function submitKlingTask(apiKey: string, visualPrompt: string, cameraMovement: string, style: string): Promise<string> {
  // Retry up to 5 times if we hit the concurrency limit — previous tasks may
  // still be processing from a failed attempt. Wait 20s between retries.
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch("https://api.klingai.com/v1/videos/text2video", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model_name: "kling-v1-6",
        prompt: `${visualPrompt}. ${cameraMovement}. ${style} style. Real people, realistic setting, professional TV commercial quality, sharp focus, natural lighting.`,
        negative_prompt: "abstract, morphing, distorted faces, glowing effects, fantasy, surreal, blurry, watermark, text overlay",
        mode: "pro",
        duration: "10",
      }),
    });
    const json = (await res.json()) as { code: number; message: string; data?: { task_id: string } };
    if (json.code === 0 && json.data?.task_id) return json.data.task_id;
    if (json.message?.includes("resource pack limit") && attempt < 4) {
      await new Promise((r) => setTimeout(r, 12000)); // wait 12s for previous tasks to free up
      continue;
    }
    throw new Error(`Kling submit failed: ${json.message}`);
  }
  throw new Error("Kling submit failed: concurrency limit not cleared after retries.");
}

interface Scene {
  voiceoverText: string;
  visualPrompt: string;
  cameraMovement: string;
  startTime: string;
  endTime: string;
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.KLING_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "KLING_API_KEY not set." }, { status: 500 });

    const { scenes, style, videoTitle } = (await req.json()) as { scenes: Scene[]; style: string; videoTitle: string };
    if (!Array.isArray(scenes) || !scenes.length) return NextResponse.json({ error: "scenes required." }, { status: 400 });

    const jobId = Date.now().toString();
    const jobDir = path.join(TMP_DIR, jobId);
    await fsp.mkdir(jobDir, { recursive: true });

    await fsp.writeFile(path.join(jobDir, "meta.json"), JSON.stringify({ scenes, style, videoTitle }));

    const taskIds: string[] = [];
    for (const scene of scenes) {
      const taskId = await submitKlingTask(apiKey, scene.visualPrompt, scene.cameraMovement, style);
      taskIds.push(taskId);
    }

    await fsp.writeFile(path.join(jobDir, "tasks.json"), JSON.stringify(taskIds));
    return NextResponse.json({ jobId, taskIds, total: scenes.length });
  } catch (err) {
    console.error("video/start error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to start." }, { status: 500 });
  }
}

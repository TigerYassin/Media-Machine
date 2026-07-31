import { NextRequest, NextResponse } from "next/server";
import dns from "dns";
import { Agent, setGlobalDispatcher } from "undici";
import fsp from "fs/promises";
import path from "path";

dns.setDefaultResultOrder("ipv4first");
setGlobalDispatcher(new Agent({ connect: { family: 4 } }));

export const maxDuration = 60;

const TMP_DIR = path.join("/tmp", "engine-videos");

async function submitKlingTask(apiKey: string, visualPrompt: string, cameraMovement: string, style: string): Promise<string> {
  const res = await fetch("https://api.klingai.com/v1/videos/text2video", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model_name: "kling-v1-6",
      prompt: `${style} style. ${visualPrompt}. Camera movement: ${cameraMovement}. Cinematic quality, professional production.`,
      mode: "std",
      duration: "10",
    }),
  });
  const json = (await res.json()) as { code: number; message: string; data?: { task_id: string } };
  if (json.code !== 0 || !json.data?.task_id) throw new Error(`Kling submit failed: ${json.message}`);
  return json.data.task_id;
}

interface Scene {
  voiceoverText: string;
  visualPrompt: string;
  cameraMovement: string;
  startTime: string;
  endTime: string;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.KLING_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "KLING_API_KEY not set." }, { status: 500 });

  const { scenes, style, videoTitle } = (await req.json()) as { scenes: Scene[]; style: string; videoTitle: string };
  if (!Array.isArray(scenes) || !scenes.length) return NextResponse.json({ error: "scenes required." }, { status: 400 });

  const jobId = Date.now().toString();
  const jobDir = path.join(TMP_DIR, jobId);
  await fsp.mkdir(jobDir, { recursive: true });

  // Save metadata so /build can access it later
  await fsp.writeFile(path.join(jobDir, "meta.json"), JSON.stringify({ scenes, style, videoTitle }));

  // Submit all tasks one at a time — each waits for the previous to be accepted
  const taskIds: string[] = [];
  for (const scene of scenes) {
    const taskId = await submitKlingTask(apiKey, scene.visualPrompt, scene.cameraMovement, style);
    taskIds.push(taskId);
  }

  await fsp.writeFile(path.join(jobDir, "tasks.json"), JSON.stringify(taskIds));

  return NextResponse.json({ jobId, taskIds, total: scenes.length });
}

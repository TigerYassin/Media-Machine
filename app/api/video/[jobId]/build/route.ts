import { NextRequest } from "next/server";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import dns from "dns";
import { Agent, setGlobalDispatcher } from "undici";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { put } from "@vercel/blob";

dns.setDefaultResultOrder("ipv4first");
setGlobalDispatcher(new Agent({ connect: { family: 4 } }));
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export const maxDuration = 300;

const TMP_DIR = path.join("/tmp", "engine-videos");

function sseEvent(data: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

async function downloadFile(url: string, dest: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
  await fsp.writeFile(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function generateVoiceover(eleven: ElevenLabsClient, text: string, outputPath: string): Promise<string> {
  const audioStream = await eleven.textToSpeech.convert("21m00Tcm4TlvDq8ikWAM", {
    text,
    modelId: "eleven_multilingual_v2",
    voiceSettings: { stability: 0.5, similarityBoost: 0.75 },
  });
  const buffer = await streamToBuffer(audioStream as unknown as Readable);
  await fsp.writeFile(outputPath, buffer);
  return outputPath;
}

// ElevenLabs Rachel speaks at ~2.5 words/sec. Estimate clip duration from text
// so we can trim the 10s Kling clip to match the voiceover exactly.
function estimateAudioDuration(text: string): number {
  const words = text.trim().split(/\s+/).length;
  const secs = words / 2.5;
  return Math.min(Math.max(secs + 0.6, 2), 10); // clamp 2s–10s, +0.6s buffer
}

async function mergeVideoAudio(
  videoPath: string,
  audioPath: string,
  outputPath: string,
  voiceoverText: string
): Promise<string> {
  const clipDur = estimateAudioDuration(voiceoverText);
  const fadeOut = Math.max(clipDur - 0.35, clipDur * 0.85);

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(videoPath)
      .input(audioPath)
      .complexFilter([
        `[0:v]trim=duration=${clipDur},setpts=PTS-STARTPTS,fade=t=in:st=0:d=0.3,fade=t=out:st=${fadeOut}:d=0.35[v]`,
        `[1:a]apad,atrim=duration=${clipDur},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.3,afade=t=out:st=${Math.max(clipDur - 0.3, 0)}:d=0.3[a]`,
      ])
      .outputOptions(["-map [v]", "-map [a]", "-c:v libx264", "-c:a aac", "-movflags +faststart"])
      .output(outputPath)
      .on("end", () => resolve(outputPath))
      .on("error", reject)
      .run();
  });
}

async function concatenateClips(clipPaths: string[], outputPath: string): Promise<string> {
  const listPath = path.join(path.dirname(outputPath), "concat_list.txt");
  await fsp.writeFile(listPath, clipPaths.map((p) => `file '${p}'`).join("\n"));
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(listPath)
      .inputOptions(["-f concat", "-safe 0"])
      .outputOptions(["-c:v libx264", "-c:a aac", "-movflags +faststart"])
      .output(outputPath)
      .on("end", () => resolve(outputPath))
      .on("error", reject)
      .run();
  });
}

interface SceneBuild {
  videoUrl: string;
  voiceoverText: string;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;

  if (!process.env.ELEVENLABS_API_KEY) {
    return new Response(
      `data: ${JSON.stringify({ type: "error", message: "ELEVENLABS_API_KEY not set." })}\n\n`,
      { status: 500, headers: { "Content-Type": "text/event-stream" } }
    );
  }

  const { scenes, videoTitle } = (await req.json()) as { scenes: SceneBuild[]; videoTitle: string };
  const eleven = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
  const jobDir = path.join(TMP_DIR, jobId);
  await fsp.mkdir(jobDir, { recursive: true });
  const finalOutputPath = path.join(jobDir, "final.mp4");
  const total = scenes.length;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => controller.enqueue(sseEvent(data));
      try {
        send({ type: "progress", step: "download", message: `Downloading all ${total} clips…` });

        // Download all clips in parallel
        const clipPaths = await Promise.all(
          scenes.map(async (scene, i) => {
            const clipPath = path.join(jobDir, `scene${i + 1}_clip.mp4`);
            await downloadFile(scene.videoUrl, clipPath);
            return clipPath;
          })
        );

        send({ type: "progress", step: "audio", message: `Recording ${total} voiceovers…` });

        // Voiceovers in parallel
        const audioPaths = await Promise.all(
          scenes.map(async (scene, i) => {
            const audioPath = path.join(jobDir, `scene${i + 1}_audio.mp3`);
            await generateVoiceover(eleven, scene.voiceoverText, audioPath);
            return audioPath;
          })
        );

        send({ type: "progress", step: "merge", message: `Merging ${total} clips…` });

        // Merge in parallel
        const mergedPaths = await Promise.all(
          clipPaths.map(async (clipPath, i) => {
            const mergedPath = path.join(jobDir, `scene${i + 1}_merged.mp4`);
            await mergeVideoAudio(clipPath, audioPaths[i], mergedPath, scenes[i].voiceoverText);
            send({ type: "progress", step: "merge", scene: i + 1, total, message: `Scene ${i + 1}/${total} merged ✓` });
            return mergedPath;
          })
        );

        send({ type: "progress", step: "concat", message: "Stitching final video…" });
        await concatenateClips(mergedPaths, finalOutputPath);

        send({ type: "progress", step: "upload", message: "Uploading final video…" });
        const fileBuffer = await fsp.readFile(finalOutputPath);
        const blob = await put(`videos/${jobId}/final.mp4`, fileBuffer, {
          access: "public",
          contentType: "video/mp4",
        });

        send({ type: "done", videoUrl: blob.url, videoTitle });
      } catch (err) {
        console.error("build error:", err);
        send({ type: "error", message: err instanceof Error ? err.message : "Build failed." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}

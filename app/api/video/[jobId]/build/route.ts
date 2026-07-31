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

async function mergeVideoAudio(videoPath: string, audioPath: string, outputPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(videoPath)
      .input(audioPath)
      .complexFilter(["[1:a]apad[padded]"])
      .outputOptions(["-map 0:v:0", "-map [padded]", "-c:v copy", "-c:a aac", "-shortest"])
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
      .outputOptions(["-c copy"])
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
            await mergeVideoAudio(clipPath, audioPaths[i], mergedPath);
            send({ type: "progress", step: "merge", scene: i + 1, total, message: `Scene ${i + 1}/${total} merged ✓` });
            return mergedPath;
          })
        );

        send({ type: "progress", step: "concat", message: "Stitching final video…" });
        await concatenateClips(mergedPaths, finalOutputPath);
        await fsp.access(finalOutputPath, fs.constants.F_OK);

        send({ type: "done", videoUrl: `/api/video/${jobId}/final.mp4`, videoTitle });
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

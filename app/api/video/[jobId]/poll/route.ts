import { NextRequest, NextResponse } from "next/server";
import dns from "dns";
import { Agent, setGlobalDispatcher } from "undici";

dns.setDefaultResultOrder("ipv4first");
setGlobalDispatcher(new Agent({ connect: { family: 4 } }));

export const maxDuration = 30;

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const apiKey = process.env.KLING_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "KLING_API_KEY not set." }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const taskIds = searchParams.get("taskIds")?.split(",") ?? [];
  if (!taskIds.length) return NextResponse.json({ error: "taskIds required." }, { status: 400 });

  const statuses = await Promise.all(
    taskIds.map(async (taskId) => {
      const res = await fetch(`https://api.klingai.com/v1/videos/text2video/${taskId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const json = (await res.json()) as {
        code: number;
        message: string;
        data?: { task_status: string; task_status_msg?: string; task_result?: { videos?: { url: string }[] } };
      };
      return {
        taskId,
        status: json.data?.task_status ?? "unknown",
        videoUrl: json.data?.task_result?.videos?.[0]?.url ?? null,
        error: json.data?.task_status_msg ?? null,
      };
    })
  );

  const allDone = statuses.every((s) => s.status === "succeed");
  const anyFailed = statuses.some((s) => s.status === "failed");

  return NextResponse.json({ statuses, allDone, anyFailed });
}

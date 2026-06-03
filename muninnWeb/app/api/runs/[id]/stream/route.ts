import { NextRequest } from "next/server";
import { RUN_DETAIL } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const step of RUN_DETAIL.steps) {
        controller.enqueue(encoder.encode("data: " + JSON.stringify(step) + "\n\n"));
      }
      controller.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

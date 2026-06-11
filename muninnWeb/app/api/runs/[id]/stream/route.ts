import { NextRequest } from "next/server";
import { RUN_DETAIL } from "@/lib/data";

export const dynamic = "force-dynamic";

// Next 15: 동적 라우트의 params 는 Promise. 이 핸들러는 params 를 쓰지 않지만
// 타입 시그니처는 새 규약(Promise)을 따라야 한다.
export async function GET(_req: NextRequest, _ctx: { params: Promise<{ id: string }> }) {
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

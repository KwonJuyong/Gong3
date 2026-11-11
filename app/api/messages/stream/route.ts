import { getSessionUser } from "@/app/db";
import { subscribeToUser, subscriberCount, type ChatEvent } from "@/app/lib/chatBus";

// 한 계정이 연결을 계속 열어 서버 메모리를 채우지 못하게 함. 탭·기기 여러 개는 충분히 허용.
const MAX_STREAMS_PER_USER = 20;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 실시간 메시지 수신용 SSE 스트림. 로그인한 사용자의 채널을 구독해
// 새 메시지/읽음 이벤트를 클라이언트로 흘려보냄
export async function GET(req: Request) {
  const me = await getSessionUser();
  if (!me) return new Response("Unauthorized", { status: 401 });
  if (subscriberCount(me.id) >= MAX_STREAMS_PER_USER) return new Response("Too Many Requests", { status: 429 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      // cleanup 은 아래에서 정함. 쓰기가 실패하면(끊긴 연결에 abort 가 오지 않은 경우) 구독을 바로 품
      let cleanup = () => {};
      const send = (data: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          cleanup();
        }
      };

      // 최초 연결 확인 이벤트
      send(`event: ready\ndata: {}\n\n`);

      const unsubscribe = subscribeToUser(me.id, (event: ChatEvent) => {
        send(`data: ${JSON.stringify(event)}\n\n`);
      });

      // keep-alive (프록시 타임아웃/버퍼링 방지)
      const heartbeat = setInterval(() => send(`: ping\n\n`), 25_000);

      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // noop
        }
      };

      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // nginx 버퍼링 비활성화
    },
  });
}

import "server-only";
import { EventEmitter } from "node:events";

// 실시간 채팅용 인메모리 이벤트 버스 (userId 단위 pub/sub).
// prisma 싱글톤과 동일한 패턴으로 dev 핫리로드에도 단일 인스턴스 유지.
// 수평 확장(다중 컨테이너) 시 아래 publish/subscribe만 Redis Pub/Sub로 교체하면 된다.

export type ChatEvent =
  | {
      // 방에 새 메시지 도착 → 수신자 방 목록/열린 방 갱신
      type: "message";
      conversationId: string;
      senderId: string | null;
    }
  | {
      // 상대가 방의 메시지를 읽음 → 발신자 UI 읽음표시 갱신
      type: "read";
      conversationId: string;
      by: string; // 읽은 사람(userId)
    }
  | {
      // 방 목록 자체가 바뀜(그룹 초대/나가기 등) → 목록만 재조회
      type: "rooms";
    };

const globalForBus = globalThis as unknown as { chatBus?: EventEmitter };

const bus =
  globalForBus.chatBus ??
  (() => {
    const e = new EventEmitter();
    e.setMaxListeners(0); // 접속자 수만큼 리스너 → 상한 해제
    return e;
  })();

if (process.env.NODE_ENV !== "production") globalForBus.chatBus = bus;

function channel(userId: string): string {
  return `u:${userId}`;
}

/** 특정 사용자에게 이벤트 발행 */
export function publishToUser(userId: string, event: ChatEvent): void {
  bus.emit(channel(userId), event);
}

/** 특정 사용자 채널 구독. 반환된 함수 호출 시 구독 해제. */
export function subscribeToUser(
  userId: string,
  handler: (event: ChatEvent) => void,
): () => void {
  const ch = channel(userId);
  bus.on(ch, handler);
  return () => {
    bus.off(ch, handler);
  };
}

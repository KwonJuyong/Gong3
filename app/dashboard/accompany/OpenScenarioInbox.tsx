"use client";

export default function OpenScenarioInbox() {
  return <button className="underline" onClick={() => window.dispatchEvent(new Event("hub:open"))}>메신저에서 학생 메시지 확인하기</button>;
}

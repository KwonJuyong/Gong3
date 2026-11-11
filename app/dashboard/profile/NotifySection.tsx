import PushToggle from "../PushToggle";
import { Card, Note } from "./ui";

/** 알림 설정: 웹 푸시 켜기/끄기. 받은 알림은 머리글 종에서 봄 */
export default function NotifySection() {
  return (
    <div className="space-y-5">
      <Card
        title="웹 푸시 알림"
        desc="앱을 닫아둔 상태에서도 모집 공고·보상 지급 같은 알림을 받습니다. 기기마다 따로 켜야 합니다."
      >
        <div className="rounded-[var(--radius-md)] bg-[var(--surface)] px-3.5 py-3">
          <PushToggle />
        </div>
      </Card>

      <Card
        title="앱으로 설치하면"
        desc="브라우저 탭을 닫아도 알림이 오고, 바탕화면·홈 화면에서 바로 열립니다."
      >
        <Note tone="muted">
          설치는 왼쪽 메뉴 맨 아래 <strong>앱 설치</strong>에서 안내합니다. iPhone은 Safari에서{" "}
          <strong>홈 화면에 추가</strong>한 뒤 그 아이콘으로 열어야 알림을 켤 수 있습니다.
        </Note>
      </Card>
    </div>
  );
}

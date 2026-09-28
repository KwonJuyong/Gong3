/**
 * 테스트에서 앱의 .ts 모듈을 직접 import 하기 위한 Node 훅.
 * 확장자 생략, @/ 경로 별칭, next/headers 스텁을 처리한다. 앱 실행과는 관계없다.
 *
 * 사용: node --conditions=react-server --import ./scripts/ts-hooks.mjs <script>
 */
import path from "node:path";
import { register } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// 훅 본체를 별도 스레드에 등록한다.
register(pathToFileURL(path.join(ROOT, "scripts", "ts-hooks-impl.mjs")).href, {
  data: { root: ROOT },
});

// Prisma 클라이언트는 생성자에서 접속 문자열을 요구하지만 실제 연결은 지연된다.
// 테스트는 DB 를 건드리지 않으므로 형식만 맞는 더미를 넣는다.
process.env.DATABASE_URL ||= "postgresql://selftest:selftest@127.0.0.1:5432/selftest";
process.env.SESSION_SECRET ||= "selftest-secret-selftest-secret-0123456789";

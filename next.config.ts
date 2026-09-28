import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          /**
           * SAMEORIGIN 등으로 완화하지 않는다. 프레임에 들어갈 수 있는 화면이 비밀번호 재설정·
           * 이메일 인증이라 클릭재킹 위험이 있다. 웹메일이 링크를 자기 프레임에서 여는 문제는
           * 메일 본문 링크에 target="_blank" 를 붙여 해결한다.
           */
          { key: "X-Frame-Options", value: "DENY" },
          /**
           * HSTS. http 로 들어오는 첫 요청을 브라우저가 https 로 바꾸게 한다(SSL stripping 방지).
           * max-age 는 되돌리기 어려우므로 300초에서 시작해 이상이 없으면
           * 86400 -> 2592000 -> 31536000 순으로 올린다.
           * 서브도메인의 https 구성을 확인하기 전에는 includeSubDomains 를 넣지 않고,
           * preload 는 쓰지 않는다.
           */
          { key: "Strict-Transport-Security", value: "max-age=300" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;

// PWA 아이콘과 파비콘 생성: public/brand/AI평가단_로고심플.png -> public/icons/*, public/favicon.ico
// 실행: node scripts/gen-icons.mjs  (sharp 는 next 의존성에 포함돼 있다)
//
// 원본에는 가이드선과 미색 배경이 있고 마크가 위로 치우쳐 있다.
// 밝기 임계값으로 마크만 뽑아 알파로 쓰고 정사각 캔버스 중앙에 다시 배치한다.
import sharp from "sharp";
import { mkdir, writeFile } from "fs/promises";

const SRC = "public/brand/AI평가단_로고심플.png";
const OUT = "public/icons";

const MARK = { r: 0x2f, g: 0x2f, b: 0x2d }; // 로고 차콜
const BG = { r: 255, g: 255, b: 255, alpha: 1 }; // manifest background_color 와 동일
const THRESHOLD = 150; // 마크(≈#3a3a38)는 남기고 가이드선(≈#ddd)·미색 배경은 날린다

/** 원본에서 마크만 뽑아 투명 배경 PNG(여백 없는 bbox)로 반환 */
async function extractMark() {
  const { width, height } = await sharp(SRC).metadata();

  // 마크=255, 나머지=0 인 1채널 마스크
  const mask = await sharp(SRC).grayscale().threshold(THRESHOLD).negate().raw().toBuffer();

  // 단색 마크에 위 마스크를 알파로 붙인 뒤, 투명 여백을 잘라 bbox만 남긴다
  const solid = await sharp({ create: { width, height, channels: 3, background: MARK } })
    .joinChannel(mask, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();

  return sharp(solid).trim().png().toBuffer();
}

/**
 * 정사각 아이콘 1장.
 * @param inset 캔버스 대비 마크가 차지할 비율
 * @param bg    배경색 (null이면 투명)
 */
async function square(mark, size, inset, bg) {
  const box = Math.round(size * inset);
  const fitted = await sharp(mark)
    .resize(box, box, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  return sharp({
    create: { width: size, height: size, channels: 4, background: bg ?? { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: fitted, gravity: "centre" }])
    .png()
    .toBuffer();
}

/** PNG 여러 장을 멀티사이즈 .ico 로 묶는다 (ICO는 PNG를 그대로 담을 수 있다) */
function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = icon
  header.writeUInt16LE(pngs.length, 4);

  let offset = 6 + pngs.length * 16;
  const entries = pngs.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 = 256)
    e.writeUInt8(size >= 256 ? 0 : size, 1); // height
    e.writeUInt8(0, 2); // 팔레트 없음
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // color planes
    e.writeUInt16LE(32, 6); // bpp
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });

  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

const mark = await extractMark();
await mkdir(OUT, { recursive: true });

// purpose: any (흰 배경, 여백 넉넉히)
for (const size of [48, 96, 192, 512]) {
  await writeFile(`${OUT}/icon-${size}.png`, await square(mark, size, 0.76, BG));
  console.log("✓ icon-" + size + ".png");
}

// purpose: maskable (OS 가 잘라내므로 중앙 80% 안전영역 안으로)
await writeFile(`${OUT}/icon-maskable-512.png`, await square(mark, 512, 0.58, BG));
console.log("✓ icon-maskable-512.png (안전영역 58%)");

// iOS 홈 화면은 투명을 지원하지 않아 불투명 배경을 쓴다
await writeFile(`${OUT}/apple-touch-icon.png`, await square(mark, 180, 0.72, BG));
console.log("✓ apple-touch-icon.png");

// Windows 바로가기/작업표시줄은 SVG 를 읽지 못해 .ico 가 필요하다
const ico = [];
for (const size of [16, 32, 48]) ico.push({ size, data: await square(mark, size, 0.84, BG) });
await writeFile("public/favicon.ico", buildIco(ico));
console.log("✓ public/favicon.ico (16/32/48)");

console.log("완료");

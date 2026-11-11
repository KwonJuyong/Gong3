import { open, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { ChatContentPart, ChatTurn } from "./chatAgent";
import {
  AI_ATTACHMENT_TURNS,
  AI_FILE_MAX_CHARS,
  AI_FILE_READ_BYTES,
  AI_IMAGE_MAX_BYTES,
  AI_IMAGES_PER_TURN,
  AI_TURN_FILE_MAX_CHARS,
} from "./limits";

export type AgentAttachment = { url: string; name: string; kind: "image" | "file" };

const IMG_MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
};
// 그 외 형식(PDF·docx 등)은 글자로 해석하면 깨진 문자만 나와 토큰만 씀
const TEXT_EXT = new Set(["txt", "csv", "tsv", "md", "json", "log"]);

const uploadDir = () => path.join(process.cwd(), "public", "uploads");

async function readHead(fp: string): Promise<string> {
  const fh = await open(fp, "r");
  try {
    const buf = Buffer.alloc(AI_FILE_READ_BYTES);
    const { bytesRead } = await fh.read(buf, 0, AI_FILE_READ_BYTES, 0);
    return buf.subarray(0, bytesRead).toString("utf-8");
  } finally {
    await fh.close();
  }
}

/** 첨부 내용을 실을 메시지. 가장 최근 첨부 질문부터 정해진 수만큼 고름(입력은 오래된 순). */
export function attachmentTurnIndexes(hasAttachments: boolean[]): Set<number> {
  const out = new Set<number>();
  for (let i = hasAttachments.length - 1; i >= 0 && out.size < AI_ATTACHMENT_TURNS; i--) {
    if (hasAttachments[i]) out.add(i);
  }
  return out;
}

/** 저장된 메시지를 에이전트 입력으로 변환함. includeFiles 가 false 면 파일 이름만 넘김 */
export async function toAgentTurn(
  content: string,
  attachments: AgentAttachment[],
  role: "user" | "assistant",
  includeFiles: boolean,
): Promise<ChatTurn> {
  if (role === "assistant") return { role, content };

  const parts: ChatContentPart[] = [];
  let text = content;
  let images = 0;
  let fileChars = 0;
  for (const a of attachments) {
    const filename = a.url.replace("/api/uploads/", "");
    if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) continue;
    if (!includeFiles) {
      text += `\n\n[이전 첨부: ${a.name}]`;
      continue;
    }
    const ext = (filename.split(".").pop() || "").toLowerCase();
    const fp = path.join(uploadDir(), filename);
    try {
      if (a.kind === "image" && IMG_MIME[ext]) {
        if (images >= AI_IMAGES_PER_TURN) {
          text += `\n\n[첨부 이미지: ${a.name}: 한 번에 ${AI_IMAGES_PER_TURN}장까지만 볼 수 있음]`;
        } else if ((await stat(fp)).size > AI_IMAGE_MAX_BYTES) {
          text += `\n\n[첨부 이미지: ${a.name}: 용량이 커서 볼 수 없음]`;
        } else {
          const buf = await readFile(fp);
          parts.push({ type: "image_url", image_url: { url: `data:${IMG_MIME[ext]};base64,${buf.toString("base64")}` } });
          images++;
        }
      } else if (TEXT_EXT.has(ext)) {
        const room = Math.min(AI_FILE_MAX_CHARS, AI_TURN_FILE_MAX_CHARS - fileChars);
        if (room <= 0) {
          text += `\n\n[첨부파일: ${a.name}: 분량 한도를 넘어 읽지 않음]`;
        } else {
          const body = (await readHead(fp)).slice(0, room);
          fileChars += body.length;
          text += `\n\n[첨부파일: ${a.name}]\n${body}`;
        }
      } else {
        text += `\n\n[첨부파일: ${a.name}: 내용을 읽을 수 없는 형식]`;
      }
    } catch {
      text += `\n\n[첨부파일: ${a.name}: 열 수 없음]`;
    }
  }
  const finalText = text.trim() || "(첨부 파일을 확인해줘)";
  if (parts.length > 0) return { role, content: [{ type: "text", text: finalText }, ...parts] };
  return { role, content: finalText };
}

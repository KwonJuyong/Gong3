import "server-only";
import { createHash } from "node:crypto";

export function reviewStamp(drafts: { id: string; generated: string; edited: string | null; approved: boolean }[]) {
  const rows = [...drafts].sort((a, b) => a.id.localeCompare(b.id))
    .map(d => [d.id, d.generated, d.edited, d.approved]);
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

// 공유 링크: 곡 JSON을 deflate로 줄여 base64url로 만든다. 서버 없이 주소(#s=...)만으로 곡이 전달된다.
import { MAX_SONG_FILE_BYTES, parseSongJson, type ParseResult } from "./songfile";
import type { Song } from "./schema";

export const SHARE_PREFIX = "s=";
/** 이보다 길면 메신저 등에서 잘릴 수 있어 경고한다 */
export const LONG_LINK_CHARS = 6000;

async function pipe(input: Uint8Array, stream: CompressionStream | DecompressionStream, limit: number): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  void writer.write(input as BufferSource).catch(() => {});
  void writer.close().catch(() => {});
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new Error("too large");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** 곡 → "s=..." (주소의 # 뒤에 붙이는 값) */
export async function songToShareHash(song: Song): Promise<string> {
  const bytes = await pipe(new TextEncoder().encode(JSON.stringify(song)), new CompressionStream("deflate"), MAX_SONG_FILE_BYTES);
  return SHARE_PREFIX + toBase64Url(bytes);
}

/** 주소의 hash("#s=...")에 공유 곡이 있는지 */
export const hasShareHash = (hash: string): boolean => hash.replace(/^#/, "").startsWith(SHARE_PREFIX);

/** "#s=..." → 곡. 잘못되거나 너무 크거나 검사에 실패하면 이유를 돌려준다(예외 없음). */
export async function songFromShareHash(hash: string): Promise<ParseResult> {
  const body = hash.replace(/^#/, "");
  if (!body.startsWith(SHARE_PREFIX)) return { ok: false, error: "공유 링크가 아닙니다" };
  try {
    const bytes = await pipe(fromBase64Url(body.slice(SHARE_PREFIX.length)), new DecompressionStream("deflate"), MAX_SONG_FILE_BYTES);
    return parseSongJson(new TextDecoder().decode(bytes));
  } catch {
    return { ok: false, error: "링크가 손상되었거나 잘렸습니다" };
  }
}

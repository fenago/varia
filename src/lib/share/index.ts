/**
 * No-server share links. A review package or a review result is JSON,
 * deflated when the browser has CompressionStream, base64url-encoded and
 * carried in the URL fragment (never sent to any server — fragments do not
 * leave the browser). Prefix `d:` = deflate-raw, `u:` = uncompressed.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipeThrough(bytes: Uint8Array, stream: { readable: ReadableStream<Uint8Array>; writable: WritableStream<BufferSource> }): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  // Copy into a plain ArrayBuffer-backed view so the lib.dom BufferSource type is satisfied.
  const src = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  src.set(bytes);
  // On corrupt input the writer promises reject as well as the reader; swallow the
  // writer side so a bad link surfaces once, through reader.read(), not as an
  // unhandled rejection.
  const pending = Promise.all([writer.write(src).catch(() => undefined), writer.close().catch(() => undefined)]);
  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
  } finally {
    await pending;
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

function hasCompression(): boolean {
  return typeof CompressionStream === "function" && typeof DecompressionStream === "function";
}

/** JSON → (deflate-raw) → base64url, prefixed `d:` or `u:`. */
export async function encodePackage(obj: unknown): Promise<string> {
  const json = enc.encode(JSON.stringify(obj));
  if (hasCompression()) {
    try {
      const deflated = await pipeThrough(json, new CompressionStream("deflate-raw"));
      return "d:" + toBase64Url(deflated);
    } catch {
      /* fall through to uncompressed */
    }
  }
  return "u:" + toBase64Url(json);
}

/** Inverse of `encodePackage`. Throws on a malformed string. */
export async function decodePackage<T>(s: string): Promise<T> {
  const trimmed = s.trim();
  const prefix = trimmed.slice(0, 2);
  const body = trimmed.slice(2);
  if (prefix === "d:") {
    if (!hasCompression()) throw new Error("This browser cannot decompress the link. Ask for the JSON file instead.");
    const bytes = await pipeThrough(fromBase64Url(body), new DecompressionStream("deflate-raw"));
    return JSON.parse(dec.decode(bytes)) as T;
  }
  if (prefix === "u:") {
    return JSON.parse(dec.decode(fromBase64Url(body))) as T;
  }
  throw new Error("Not a VARIA share link.");
}

function origin(): string {
  return typeof location !== "undefined" ? location.origin : "";
}

/** `${origin}/review#pkg=<encoded package>` */
export async function reviewLink(pkg: unknown): Promise<string> {
  return `${origin()}/review#pkg=${await encodePackage(pkg)}`;
}

/** `${origin}/employer#result=<encoded result>` */
export async function resultLink(result: unknown): Promise<string> {
  return `${origin()}/employer#result=${await encodePackage(result)}`;
}

/** Read `name` from `location.hash` parsed as URLSearchParams (after the `#`). */
export function readFragmentParam(name: string): string | null {
  if (typeof location === "undefined") return null;
  const h = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
  if (!h) return null;
  return new URLSearchParams(h).get(name);
}

/** Remove the fragment without adding a history entry or reloading. */
export function clearFragment(): void {
  if (typeof history === "undefined" || typeof location === "undefined") return;
  history.replaceState(history.state, "", location.pathname + location.search);
}

/** Trigger a JSON download in the browser. */
export function downloadJson(obj: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".json") ? filename : `${filename}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Read and parse a JSON file chosen by the user. */
export async function readJsonFile<T>(file: File): Promise<T> {
  const text = await file.text();
  return JSON.parse(text) as T;
}

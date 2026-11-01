/** Snapshot compression for broadcast (gzip via CompressionStream when available; falls back to plain). */
export async function compressString(s: string): Promise<string> {
  if (typeof CompressionStream === "undefined") return "r:" + s;
  try {
    const stream = new Blob([s]).stream().pipeThrough(new CompressionStream("gzip"));
    const buf = await new Response(stream).arrayBuffer();
    return "g:" + bytesToBase64(new Uint8Array(buf));
  } catch {
    return "r:" + s;
  }
}

export async function decompressString(s: string): Promise<string> {
  if (s.startsWith("r:")) return s.slice(2);
  if (s.startsWith("g:")) {
    const bytes = base64ToBytes(s.slice(2));
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
    return await new Response(stream).text();
  }
  return s;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function chunkString(s: string, size = 60000): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out;
}

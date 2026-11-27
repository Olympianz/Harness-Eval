import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function bearer(request: Request) {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

export function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function isOperator(request: Request) {
  const expected = process.env.TENANT_ADMIN_TOKEN;
  return !!expected && expected.length >= 32 &&
    timingSafeEqual(Buffer.from(digest(expected)), Buffer.from(digest(bearer(request))));
}

export function issueKey(kind: "workspace" | "ingest") {
  return (kind === "workspace" ? "hew_" : "hei_") + randomBytes(32).toString("base64url");
}

export function reply(status: number, data: object) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

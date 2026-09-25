import { letterRequestSchema } from "@/lib/apis/contracts";
import { checkOrigin, parseBody } from "@/server/http";
import { callGemini } from "@/server/gemini";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request): Promise<Response> {
  const forbidden = checkOrigin(req);
  if (forbidden) return forbidden;
  const body = await parseBody(req, letterRequestSchema);
  if (!body.ok) return body.response;
  return callGemini(body.data);
}

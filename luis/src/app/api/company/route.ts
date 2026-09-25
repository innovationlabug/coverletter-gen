import { companyRequestSchema } from "@/lib/apis/contracts";
import { checkOrigin, parseBody } from "@/server/http";
import { callTavily } from "@/server/tavily";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request): Promise<Response> {
  const forbidden = checkOrigin(req);
  if (forbidden) return forbidden;
  const body = await parseBody(req, companyRequestSchema);
  if (!body.ok) return body.response;
  return callTavily(body.data);
}

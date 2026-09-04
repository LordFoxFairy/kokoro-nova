import {
  CreateCreationAgentRequestSchema,
  CreationContextWriteRequestSchema,
  CreationContextWriteResponseSchema,
  CreateCreationAgentResponseSchema,
} from "@/contracts/creation-context";
import { parseJsonBody, handle } from "@/server/http";
import {
  readHomeCreationContext,
  recordCreationAgentRequest,
  writeHomeCreationContext,
} from "@/server/creation-context";

export const dynamic = "force-dynamic";

/** Restores the server-side mirror of the browser's home CreationContext draft. */
export async function GET() {
  return handle(async () => ({
    scope: "home" as const,
    context: readHomeCreationContext(),
  }));
}

/** Persists an editable draft; safe to repeat because the full target state is supplied. */
export async function PUT(request: Request) {
  return handle(async () => {
    const body = await parseJsonBody(
      request,
      CreationContextWriteRequestSchema,
    );
    return CreationContextWriteResponseSchema.parse({
      scope: body.scope,
      context: writeHomeCreationContext(body.context),
    });
  });
}

/** Freezes the submitted context as the local Agent's initial request. */
export async function POST(request: Request) {
  return handle(async () => {
    const body = await parseJsonBody(request, CreateCreationAgentRequestSchema);
    return CreateCreationAgentResponseSchema.parse({
      request: recordCreationAgentRequest(body.prompt, body.context),
    });
  });
}

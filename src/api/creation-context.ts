import {
  CreateCreationAgentRequestSchema,
  CreateCreationAgentResponseSchema,
  CreationContextReadResponseSchema,
  CreationContextWriteRequestSchema,
  CreationContextWriteResponseSchema,
  type CreationContext,
} from "@/contracts/creation-context";

export type CreationContextTransport = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

async function typed<T>(
  response: Response,
  schema: {
    safeParse(
      value: unknown,
    ): { success: true; data: T } | { success: false; error: Error };
  },
): Promise<T> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : `请求失败 (${response.status})`;
    throw new Error(message);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    throw new Error(`CreationContext 响应不符合契约：${parsed.error.message}`);
  return parsed.data;
}

function localPath(path: string) {
  if (path !== "/api/creation-context")
    throw new Error("CreationContext client 只允许本地 mock path");
  return path;
}

export function createCreationContextClient(
  transport: CreationContextTransport = fetch,
) {
  return {
    get: async () =>
      typed(
        await transport(localPath("/api/creation-context")),
        CreationContextReadResponseSchema,
      ),
    save: async (context: CreationContext) => {
      const body = CreationContextWriteRequestSchema.parse({
        scope: "home",
        context,
      });
      return typed(
        await transport(localPath("/api/creation-context"), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        CreationContextWriteResponseSchema,
      );
    },
    submit: async (prompt: string, context: CreationContext) => {
      const body = CreateCreationAgentRequestSchema.parse({
        scope: "home",
        prompt,
        context,
      });
      return typed(
        await transport(localPath("/api/creation-context"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        CreateCreationAgentResponseSchema,
      );
    },
  };
}

export const creationContextClient = createCreationContextClient();

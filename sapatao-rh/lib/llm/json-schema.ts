import { z } from "zod";

/**
 * Converts a zod schema to a JSON Schema acceptable by OpenAI structured outputs
 * (strict mode): every object node gets `additionalProperties: false` and a
 * `required` list with ALL of its properties; the top-level `$schema` is dropped.
 */
export function toStrictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const raw = z.toJSONSchema(schema) as Record<string, unknown>;
  delete raw.$schema;
  walk(raw);
  return raw;
}

function walk(node: unknown): void {
  if (Array.isArray(node)) {
    for (const item of node) walk(item);
    return;
  }
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  if (obj.type === "object" && obj.properties && typeof obj.properties === "object") {
    obj.additionalProperties = false;
    obj.required = Object.keys(obj.properties as Record<string, unknown>);
  }
  for (const value of Object.values(obj)) walk(value);
}

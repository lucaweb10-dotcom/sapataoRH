import { describe, it, expect, vi } from "vitest";
import { createOpenAiProvider } from "./openai";
import type { LlmAnexo } from "./types";

// ---------------------------------------------------------------------------
// Helpers: fetch fake + payloads da Responses API
// ---------------------------------------------------------------------------

function okPayload(text = '{"a":1}') {
  return {
    output: [{ type: "message", content: [{ type: "output_text", text }] }],
    usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
  };
}

function resp(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status });
}

type FetchFake = ReturnType<typeof vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>>;

function makeFetch(...responses: Response[]): FetchFake {
  const fn = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  return fn;
}

function makeProvider(fetchFake: FetchFake, modelo = "gpt-5.6-terra") {
  return createOpenAiProvider({ apiKey: "sk-test", modelo, fetchImpl: fetchFake as unknown as typeof fetch });
}

function bodyEnviado(fetchFake: FetchFake, call = 0): Record<string, unknown> {
  const init = fetchFake.mock.calls[call][1];
  return JSON.parse(init!.body as string) as Record<string, unknown>;
}

describe("createOpenAiProvider", () => {
  it("happy path: extrai json + tokens e monta o body correto", async () => {
    const fetchFake = makeFetch(resp(okPayload()));
    const provider = makeProvider(fetchFake, "gpt-5.6-luna");

    const r = await provider.completeJson("prompt do sistema", "prompt do usuário");
    expect(r).toEqual({ json: '{"a":1}', tokensEst: 150, tokensIn: 100, tokensOut: 50 });

    expect(fetchFake).toHaveBeenCalledTimes(1);
    const body = bodyEnviado(fetchFake);
    expect(body.model).toBe("gpt-5.6-luna");
    expect(body.max_output_tokens).toBe(3072);
    expect(body.input).toEqual([
      { role: "system", content: [{ type: "input_text", text: "prompt do sistema" }] },
      { role: "user", content: [{ type: "input_text", text: "prompt do usuário" }] },
    ]);
    // sem jsonSchema em opts → sem text.format
    expect(body.text).toBeUndefined();
  });

  it("envia Authorization Bearer com a apiKey", async () => {
    const fetchFake = makeFetch(resp(okPayload()));
    await makeProvider(fetchFake).completeJson("s", "u");
    const init = fetchFake.mock.calls[0][1]!;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
  });

  it("jsonSchema em opts → body.text.format json_schema strict", async () => {
    const fetchFake = makeFetch(resp(okPayload()));
    const schema = { type: "object", properties: { a: { type: "number" } } };
    await makeProvider(fetchFake).completeJson("s", "u", { jsonSchema: { name: "parecer", schema } });

    const body = bodyEnviado(fetchFake);
    expect(body.text).toEqual({
      format: { type: "json_schema", name: "parecer", strict: true, schema },
    });
  });

  it("anexo image → input_image com data-URL e detail 'low'", async () => {
    const fetchFake = makeFetch(resp(okPayload()));
    const anexo: LlmAnexo = { kind: "image", mime: "image/png", base64: "QUJD" };
    await makeProvider(fetchFake).completeJson("s", "u", { anexos: [anexo] });

    const body = bodyEnviado(fetchFake);
    const userContent = (body.input as { content: unknown[] }[])[1].content;
    expect(userContent[0]).toEqual({ type: "input_text", text: "u" });
    expect(userContent[1]).toEqual({
      type: "input_image",
      image_url: "data:image/png;base64,QUJD",
      detail: "low",
    });
  });

  it("anexo pdf → input_file com filename e file_data", async () => {
    const fetchFake = makeFetch(resp(okPayload()));
    const anexo: LlmAnexo = { kind: "pdf", mime: "application/pdf", base64: "UERG", nome: "cv.pdf" };
    await makeProvider(fetchFake).completeJson("s", "u", { anexos: [anexo] });

    const userContent = (bodyEnviado(fetchFake).input as { content: unknown[] }[])[1].content;
    expect(userContent[1]).toEqual({
      type: "input_file",
      filename: "cv.pdf",
      file_data: "data:application/pdf;base64,UERG",
    });
  });

  it("anexo pdf sem nome → filename fallback 'documento.pdf'", async () => {
    const fetchFake = makeFetch(resp(okPayload()));
    await makeProvider(fetchFake).completeJson("s", "u", {
      anexos: [{ kind: "pdf", mime: "application/pdf", base64: "UERG" }],
    });
    const userContent = (bodyEnviado(fetchFake).input as { content: unknown[] }[])[1].content;
    expect(userContent[1]).toMatchObject({ type: "input_file", filename: "documento.pdf" });
  });

  it("401 → LlmError chave_invalida", async () => {
    const fetchFake = makeFetch(resp({ error: "unauthorized" }, 401));
    await expect(makeProvider(fetchFake).completeJson("s", "u")).rejects.toMatchObject({
      name: "LlmError",
      code: "chave_invalida",
    });
    expect(fetchFake).toHaveBeenCalledTimes(1);
  });

  it("429 → ia_indisponivel SEM retry (fetch chamado 1x)", async () => {
    const fetchFake = makeFetch(resp({ error: "rate limit" }, 429));
    await expect(makeProvider(fetchFake).completeJson("s", "u")).rejects.toMatchObject({
      name: "LlmError",
      code: "ia_indisponivel",
    });
    expect(fetchFake).toHaveBeenCalledTimes(1);
  });

  it("500 duas vezes → 1 retry (fetch 2x) e ia_indisponivel", async () => {
    const fetchFake = makeFetch(resp({ error: "boom" }, 500), resp({ error: "boom" }, 500));
    await expect(makeProvider(fetchFake).completeJson("s", "u")).rejects.toMatchObject({
      name: "LlmError",
      code: "ia_indisponivel",
    });
    expect(fetchFake).toHaveBeenCalledTimes(2);
  });

  it("500 depois 200 → sucesso no retry", async () => {
    const fetchFake = makeFetch(resp({ error: "boom" }, 500), resp(okPayload('{"ok":true}')));
    const r = await makeProvider(fetchFake).completeJson("s", "u");
    expect(r.json).toBe('{"ok":true}');
    expect(fetchFake).toHaveBeenCalledTimes(2);
  });

  it("resposta sem output_text → ia_indisponivel", async () => {
    const fetchFake = makeFetch(
      resp({ output: [{ type: "message", content: [{ type: "reasoning" }] }], usage: { total_tokens: 5 } }),
    );
    await expect(makeProvider(fetchFake).completeJson("s", "u")).rejects.toMatchObject({
      name: "LlmError",
      code: "ia_indisponivel",
    });
  });
});

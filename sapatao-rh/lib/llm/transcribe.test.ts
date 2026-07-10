import { describe, it, expect, vi } from "vitest";
import { transcreverAudio, MAX_AUDIO_BYTES } from "./transcribe";

type FetchFake = ReturnType<typeof vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>>;

function makeFetch(payload: unknown, status = 200): FetchFake {
  return vi
    .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValue(new Response(JSON.stringify(payload), { status }));
}

const audio = { buffer: Buffer.from("dados de audio"), mime: "audio/ogg" };

function cfg(fetchFake: FetchFake, over: Partial<{ modelo: string }> = {}) {
  return { apiKey: "sk-test", fetchImpl: fetchFake as unknown as typeof fetch, ...over };
}

describe("transcreverAudio", () => {
  it("happy path: retorna texto e tokens do usage", async () => {
    const fetchFake = makeFetch({ text: "olá", usage: { total_tokens: 12 } });
    const r = await transcreverAudio(cfg(fetchFake), audio);
    expect(r).toEqual({ texto: "olá", tokens: 12 });
    expect(fetchFake).toHaveBeenCalledTimes(1);
  });

  it("envia FormData com campos model e response_format", async () => {
    const fetchFake = makeFetch({ text: "ok" });
    await transcreverAudio(cfg(fetchFake, { modelo: "modelo-teste" }), audio);

    const init = fetchFake.mock.calls[0][1]!;
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.get("model")).toBe("modelo-teste");
    expect(form.get("response_format")).toBe("json");
    expect(form.get("file")).not.toBeNull();
  });

  it("sem usage → tokens 0", async () => {
    const fetchFake = makeFetch({ text: "sem usage" });
    const r = await transcreverAudio(cfg(fetchFake), audio);
    expect(r).toEqual({ texto: "sem usage", tokens: 0 });
  });

  it("buffer acima de MAX_AUDIO_BYTES → LlmError ia_indisponivel SEM chamar fetch", async () => {
    const fetchFake = makeFetch({ text: "nunca" });
    const grande = { buffer: Buffer.alloc(MAX_AUDIO_BYTES + 1), mime: "audio/ogg" };
    await expect(transcreverAudio(cfg(fetchFake), grande)).rejects.toMatchObject({
      name: "LlmError",
      code: "ia_indisponivel",
    });
    expect(fetchFake).not.toHaveBeenCalled();
  });

  it("401 → LlmError chave_invalida", async () => {
    const fetchFake = makeFetch({ error: "unauthorized" }, 401);
    await expect(transcreverAudio(cfg(fetchFake), audio)).rejects.toMatchObject({
      name: "LlmError",
      code: "chave_invalida",
    });
  });
});

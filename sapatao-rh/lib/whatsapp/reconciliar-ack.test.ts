import { describe, it, expect, vi } from "vitest";
import { reconciliarAcks, type ReconciliarDeps } from "./reconciliar-ack";
import type { MessageStatus } from "@/types/database";

function deps(over: Partial<ReconciliarDeps> = {}): ReconciliarDeps {
  return {
    listarPendentes: vi.fn(async () => [
      { id: "m1", uazapi_msg_id: "P1", status: "sent" as MessageStatus },
    ]),
    buscarNoProvedor: vi.fn(async () => [{ providerId: "P1", status: "read" }]),
    atualizar: vi.fn(async () => {}),
    ...over,
  };
}

describe("reconciliarAcks", () => {
  it("avança sent → read quando o provedor já marcou lido", async () => {
    const d = deps();
    const r = await reconciliarAcks(d);
    expect(r.atualizadas).toBe(1);
    expect(d.atualizar).toHaveBeenCalledWith("m1", "read");
  });

  it("traduz o vocabulário do provedor (delivery_ack → delivered)", async () => {
    const d = deps({ buscarNoProvedor: vi.fn(async () => [{ providerId: "P1", status: "delivery_ack" }]) });
    await reconciliarAcks(d);
    expect(d.atualizar).toHaveBeenCalledWith("m1", "delivered");
  });

  it("é forward-only: não regride read para delivered", async () => {
    const d = deps({
      listarPendentes: vi.fn(async () => [
        { id: "m1", uazapi_msg_id: "P1", status: "read" as MessageStatus },
      ]),
      buscarNoProvedor: vi.fn(async () => [{ providerId: "P1", status: "delivered" }]),
    });
    const r = await reconciliarAcks(d);
    expect(r.atualizadas).toBe(0);
    expect(d.atualizar).not.toHaveBeenCalled();
  });

  it("não escreve quando o status não mudou", async () => {
    const d = deps({ buscarNoProvedor: vi.fn(async () => [{ providerId: "P1", status: "sent" }]) });
    const r = await reconciliarAcks(d);
    expect(r.atualizadas).toBe(0);
    expect(d.atualizar).not.toHaveBeenCalled();
  });

  it("ignora mensagem que o provedor não conhece", async () => {
    const d = deps({ buscarNoProvedor: vi.fn(async () => [{ providerId: "OUTRO", status: "read" }]) });
    const r = await reconciliarAcks(d);
    expect(r.atualizadas).toBe(0);
  });

  it("ignora status desconhecido em vez de gravar lixo", async () => {
    const d = deps({ buscarNoProvedor: vi.fn(async () => [{ providerId: "P1", status: "banana" }]) });
    const r = await reconciliarAcks(d);
    expect(r.atualizadas).toBe(0);
    expect(d.atualizar).not.toHaveBeenCalled();
  });

  it("sem pendentes não chama o provedor (não gasta requisição à toa)", async () => {
    const d = deps({ listarPendentes: vi.fn(async () => []) });
    const r = await reconciliarAcks(d);
    expect(r.atualizadas).toBe(0);
    expect(d.buscarNoProvedor).not.toHaveBeenCalled();
  });

  it("atualiza várias de uma vez", async () => {
    const d = deps({
      listarPendentes: vi.fn(async () => [
        { id: "m1", uazapi_msg_id: "P1", status: "sent" as MessageStatus },
        { id: "m2", uazapi_msg_id: "P2", status: "sent" as MessageStatus },
        { id: "m3", uazapi_msg_id: "P3", status: "delivered" as MessageStatus },
      ]),
      buscarNoProvedor: vi.fn(async () => [
        { providerId: "P1", status: "delivered" },
        { providerId: "P2", status: "read" },
        { providerId: "P3", status: "read" },
      ]),
    });
    const r = await reconciliarAcks(d);
    expect(r.atualizadas).toBe(3);
  });
});

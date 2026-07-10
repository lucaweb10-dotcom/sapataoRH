import { describe, it, expect } from "vitest";
import { filtrarConversas, parseFiltroConversas } from "./filtro-conversas";

const EU = "user-1";

const conversas = [
  { id: "c1", unread_count: 2, candidatos: { atribuido_a: EU } },
  { id: "c2", unread_count: 0, candidatos: { atribuido_a: "user-2" } },
  { id: "c3", unread_count: 1, candidatos: null },
  { id: "c4", unread_count: 0, candidatos: { atribuido_a: EU } },
];

describe("parseFiltroConversas", () => {
  it("aceita os valores válidos e cai em 'todas'", () => {
    expect(parseFiltroConversas("nao-lidas")).toBe("nao-lidas");
    expect(parseFiltroConversas("minhas")).toBe("minhas");
    expect(parseFiltroConversas("qualquer")).toBe("todas");
    expect(parseFiltroConversas(null)).toBe("todas");
  });
});

describe("filtrarConversas", () => {
  it("'todas' devolve tudo", () => {
    expect(filtrarConversas(conversas, "todas", EU)).toHaveLength(4);
  });

  it("'nao-lidas' filtra unread_count > 0", () => {
    expect(filtrarConversas(conversas, "nao-lidas", EU).map((c) => c.id)).toEqual(["c1", "c3"]);
  });

  it("'minhas' filtra candidato.atribuido_a = usuário", () => {
    expect(filtrarConversas(conversas, "minhas", EU).map((c) => c.id)).toEqual(["c1", "c4"]);
  });

  it("'minhas' sem usuário devolve vazio", () => {
    expect(filtrarConversas(conversas, "minhas", null)).toEqual([]);
  });
});

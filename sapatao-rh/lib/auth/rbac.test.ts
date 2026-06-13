import { describe, it, expect } from "vitest";
import { navItemsForRole, canAccessPath, canSeeUnidade, NAV } from "./rbac";

describe("navItemsForRole", () => {
  it("admin sees every nav item incl. configuracoes", () => {
    const keys = navItemsForRole("admin").map((i) => i.key);
    expect(keys).toEqual(NAV.map((i) => i.key));
    expect(keys).toContain("configuracoes");
  });
  it("rh sees operational items but NOT configuracoes", () => {
    const keys = navItemsForRole("rh").map((i) => i.key);
    expect(keys).toContain("chat");
    expect(keys).toContain("funcionarios");
    expect(keys).not.toContain("configuracoes");
  });
  it("viewer sees only dashboard", () => {
    expect(navItemsForRole("viewer").map((i) => i.key)).toEqual(["dashboard"]);
  });
  it("gestor_unidade sees its scoped items, not configuracoes", () => {
    const keys = navItemsForRole("gestor_unidade").map((i) => i.key);
    expect(keys).toContain("funil");
    expect(keys).not.toContain("configuracoes");
  });
});

describe("canAccessPath", () => {
  it("blocks rh from /configuracoes/*", () => {
    expect(canAccessPath("rh", "/configuracoes/acessos")).toBe(false);
  });
  it("allows admin into /configuracoes/*", () => {
    expect(canAccessPath("admin", "/configuracoes/acessos")).toBe(true);
  });
  it("allows rh into /chat", () => {
    expect(canAccessPath("rh", "/chat")).toBe(true);
  });
  it("blocks viewer from /chat", () => {
    expect(canAccessPath("viewer", "/chat")).toBe(false);
  });
});

describe("canSeeUnidade", () => {
  const base = { role: "rh" as const, platform_admin: false, unidades_acesso: ["u1", "u2"] };
  it("true when unidade is in the access list", () => {
    expect(canSeeUnidade(base, "u1")).toBe(true);
  });
  it("false when unidade not in the access list", () => {
    expect(canSeeUnidade(base, "u9")).toBe(false);
  });
  it("platform_admin sees any unidade", () => {
    expect(canSeeUnidade({ ...base, platform_admin: true }, "u9")).toBe(true);
  });
});

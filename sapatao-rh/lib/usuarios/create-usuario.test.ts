import { describe, it, expect, vi } from "vitest";
import { createUsuario, type AdminLike } from "./create-usuario";

const actor = {
  empresa_id: "emp-1",
  ator_id: "admin-1",
  role: "admin" as const,
  platform_admin: false,
};

const input = {
  nome: "Maria RH",
  email: "maria@sapatao.com",
  senha: "trocar123",
  role: "rh" as const,
  unidades_acesso: ["11111111-1111-1111-1111-111111111111"],
};

function makeAdmin(overrides: Partial<AdminLike> = {}): AdminLike {
  return {
    auth: {
      admin: {
        createUser: vi.fn(async () => ({ data: { user: { id: "new-user-1" } }, error: null })),
      },
    },
    from: vi.fn(() => ({
      insert: vi.fn(async () => ({ error: null })),
    })),
    ...overrides,
  } as unknown as AdminLike;
}

describe("createUsuario", () => {
  it("rejects when actor is not admin", async () => {
    const admin = makeAdmin();
    const res = await createUsuario(input, { ...actor, role: "rh" }, admin);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("forbidden");
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it("creates the auth user with email_confirm and inserts the profile in the actor's empresa", async () => {
    const insert = vi.fn(async (_row: unknown) => ({ error: null }));
    const admin = makeAdmin({ from: vi.fn(() => ({ insert })) as AdminLike["from"] });
    const res = await createUsuario(input, actor, admin);

    expect(res.ok).toBe(true);
    expect(admin.auth.admin.createUser).toHaveBeenCalledWith({
      email: input.email,
      password: input.senha,
      email_confirm: true,
    });
    expect(admin.from).toHaveBeenCalledWith("profiles");
    const profileRow = insert.mock.calls[0][0];
    expect(profileRow).toMatchObject({
      id: "new-user-1",
      empresa_id: "emp-1",
      nome: "Maria RH",
      email: "maria@sapatao.com",
      role: "rh",
      unidades_acesso: input.unidades_acesso,
      platform_admin: false,
    });
  });

  it("returns email_exists when the admin API reports a duplicate", async () => {
    const admin = makeAdmin();
    (admin.auth.admin.createUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { user: null },
      error: { message: "User already registered" },
    });
    const res = await createUsuario(input, actor, admin);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("email_exists");
  });
});

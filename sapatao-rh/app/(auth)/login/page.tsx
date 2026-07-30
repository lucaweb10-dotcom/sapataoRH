"use client";

import { useActionState } from "react";
import { signIn } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, null);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-4">
      <form
        action={formAction}
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-card shadow-warm-md"
      >
        <div className="pride-rule" />
        <div className="space-y-5 p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="grid size-12 place-items-center rounded-xl bg-brand-700 font-display text-xl font-bold text-neutro-50 shadow-warm">
              S
            </div>
            <div className="space-y-0.5">
              <h1 className="font-display text-display font-bold text-brand-700">Sapatão RH</h1>
              <p className="text-sm text-muted-foreground">Acesse sua conta</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>

          {state?.error && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Entrando..." : "Entrar"}
          </Button>
        </div>
      </form>
    </main>
  );
}

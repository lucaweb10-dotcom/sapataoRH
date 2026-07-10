"use client";
import { useSyncExternalStore } from "react";
import { Bell, BellOff } from "lucide-react";
import { SOM_STORAGE_KEY } from "@/components/shell/notificacoes-provider";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getSnapshot() {
  return window.localStorage.getItem(SOM_STORAGE_KEY) === "1";
}

function getServerSnapshot() {
  return false;
}

/** Toggle de som das notificações (por dispositivo, localStorage; default OFF).
 *  Lê via useSyncExternalStore (default false no servidor, evitando mismatch de
 *  hidratação) e assina o evento "storage" para refletir mudanças de outras abas
 *  — e, como o próprio botão grava localmente, dispara um StorageEvent sintético
 *  para atualizar-se de imediato (o evento nativo "storage" não dispara na aba
 *  que fez a escrita). */
export function SomToggle() {
  const ligado = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const alternar = () => {
    const proximo = !ligado;
    window.localStorage.setItem(SOM_STORAGE_KEY, proximo ? "1" : "0");
    window.dispatchEvent(new StorageEvent("storage", { key: SOM_STORAGE_KEY }));
  };

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={ligado ? "Desligar som de notificação" : "Ligar som de notificação"}
      title={ligado ? "Som de notificação: ligado" : "Som de notificação: desligado"}
      className="flex size-7 items-center justify-center rounded-md text-neutro-700 transition-colors hover:bg-neutro-100"
    >
      {ligado ? <Bell className="size-4" /> : <BellOff className="size-4" />}
    </button>
  );
}

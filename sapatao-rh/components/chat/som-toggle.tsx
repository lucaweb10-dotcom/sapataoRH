"use client";
import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { SOM_STORAGE_KEY } from "@/components/shell/notificacoes-provider";

/** Toggle de som das notificações (por dispositivo, localStorage; default OFF).
 *  Inicializa em false e sincroniza no effect para evitar mismatch de hidratação. */
export function SomToggle() {
  const [ligado, setLigado] = useState(false);

  useEffect(() => {
    // Sincroniza com localStorage (fonte externa) só depois da hidratação —
    // ler no render causaria mismatch SSR/cliente. Disable pontual: não há
    // "external system" para assinar aqui, é uma leitura única no mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLigado(window.localStorage.getItem(SOM_STORAGE_KEY) === "1");
  }, []);

  const alternar = () => {
    const proximo = !ligado;
    setLigado(proximo);
    window.localStorage.setItem(SOM_STORAGE_KEY, proximo ? "1" : "0");
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

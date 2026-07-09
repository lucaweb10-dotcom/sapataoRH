"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FileText } from "lucide-react";
import { useSendQueue } from "@/stores/send-queue";
import { dispatchSend, dispatchSendMedia } from "@/lib/chat/dispatch-send";

export type TemplatePronto = {
  id: string;
  nome: string;
  categoria: string;
  conteudo: string;
};

interface Props {
  conversationId: string;
  /** Conteúdo do template já preenchido (via ?tpl=) — aplicado 1x, só com campo vazio. */
  prefill?: string | null;
  /** Templates ativos com variáveis resolvidas para o candidato da conversa. */
  templates?: TemplatePronto[];
}

export function Composer({ conversationId, prefill = null, templates = [] }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const enqueueAndRun = useSendQueue((s) => s.enqueueAndRun);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pickerOpen, setPickerOpen] = useState(false);

  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  // Prefill do template (?tpl=): só na montagem e só se o campo estiver vazio.
  // Depois de aplicar, tira o tpl da URL para não re-preencher em reloads.
  const prefillApplied = useRef(false);
  useEffect(() => {
    if (prefillApplied.current || !prefill) return;
    const el = textareaRef.current;
    if (!el || el.value.trim()) return;
    prefillApplied.current = true;
    el.value = prefill;
    autoGrow(el);
    el.focus();
    const params = new URLSearchParams(searchParams.toString());
    if (params.has("tpl")) {
      params.delete("tpl");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [prefill, pathname, router, searchParams]);

  // Picker: templates agrupados por categoria.
  const grupos = useMemo(() => {
    const map = new Map<string, TemplatePronto[]>();
    for (const t of templates) {
      const lista = map.get(t.categoria) ?? [];
      lista.push(t);
      map.set(t.categoria, lista);
    }
    return [...map.entries()];
  }, [templates]);

  function inserirTemplate(t: TemplatePronto) {
    const el = textareaRef.current;
    if (!el) return;
    // Campo vazio: substitui; senão anexa ao final (spec §4).
    el.value = el.value.trim() ? `${el.value}\n${t.conteudo}` : t.conteudo;
    autoGrow(el);
    el.focus();
    setPickerOpen(false);
  }

  function handleSend() {
    const el = textareaRef.current;
    if (!el) return;

    const texto = el.value.trim();
    if (!texto) return;

    const clientMessageId = crypto.randomUUID();

    // Clear immediately — synchronous, before any await
    el.value = "";
    // Reset textarea height if it was auto-grown
    el.style.height = "auto";

    enqueueAndRun({ clientMessageId, conversationId, texto }, dispatchSend);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    // Shift+Enter falls through → natural newline insertion
  }

  function handleInput(e: React.FormEvent<HTMLTextAreaElement>) {
    autoGrow(e.currentTarget);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    // Reset input so the same file can be re-picked next time
    e.target.value = "";

    for (const file of files) {
      const clientMessageId = crypto.randomUUID();
      const objectUrl = URL.createObjectURL(file);

      // Read file as base64
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      // btoa works for binary data up to ~64MB; for very large files a chunked
      // approach is safer, but WhatsApp caps media at 16 MB anyway.
      let b64 = "";
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        b64 += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      const fileBase64 = btoa(b64);

      const mime = file.type;
      const fileName = file.name;

      // Capture variables in closure for the dispatch function
      const capturedClientMessageId = clientMessageId;
      const capturedConversationId = conversationId;
      const capturedFileBase64 = fileBase64;
      const capturedMime = mime;
      const capturedFileName = fileName;

      enqueueAndRun(
        {
          clientMessageId,
          conversationId,
          texto: "",
          media: { objectUrl, mime, fileName },
        },
        () =>
          dispatchSendMedia({
            clientMessageId: capturedClientMessageId,
            conversationId: capturedConversationId,
            fileBase64: capturedFileBase64,
            mime: capturedMime,
            fileName: capturedFileName,
          }),
      );
    }
  }

  return (
    <div className="border-t border-neutro-200 bg-white p-3">
      <div className="flex items-end gap-2">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,.doc,.docx"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Picker de templates */}
        {templates.length > 0 && (
          <div className="relative mb-px">
            <button
              type="button"
              aria-label="Inserir template"
              title="Inserir template"
              onClick={() => setPickerOpen((o) => !o)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutro-200 bg-neutro-50 text-neutro-700 transition-colors hover:bg-neutro-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sapatao-verde/50 active:translate-y-px"
            >
              <FileText className="size-4" />
            </button>
            {pickerOpen && (
              <div className="absolute bottom-11 left-0 z-20 max-h-72 w-72 overflow-y-auto rounded-lg border border-neutro-200 bg-white p-2 shadow-warm">
                {grupos.map(([categoria, lista]) => (
                  <div key={categoria} className="mb-2 last:mb-0">
                    <p className="px-1 pb-1 text-[10px] font-semibold tracking-wide text-neutro-500 uppercase">
                      {categoria}
                    </p>
                    {lista.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => inserirTemplate(t)}
                        className="block w-full rounded px-2 py-1.5 text-left text-sm text-neutro-900 hover:bg-neutro-50"
                      >
                        <span className="font-medium">{t.nome}</span>
                        <span className="mt-0.5 block truncate text-xs text-neutro-700">
                          {t.conteudo}
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Paperclip / attach button */}
        <button
          type="button"
          aria-label="Anexar arquivo"
          onClick={() => fileInputRef.current?.click()}
          className="mb-px flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutro-200 bg-neutro-50 text-neutro-700 transition-colors hover:bg-neutro-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sapatao-verde/50 active:translate-y-px"
        >
          {/* Paperclip icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
          >
            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>

        <textarea
          ref={textareaRef}
          rows={2}
          placeholder="Digite uma mensagem... (Enter envia, Shift+Enter nova linha)"
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          className="flex-1 resize-none rounded-lg border border-neutro-200 bg-neutro-50 px-3 py-2 text-sm text-neutro-900 placeholder:text-neutro-500 focus:border-sapatao-verde focus:outline-none min-h-[2.5rem] max-h-40 overflow-y-auto"
        />
        <button
          type="button"
          onClick={handleSend}
          aria-label="Enviar mensagem"
          className="mb-px flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sapatao-verde text-white transition-colors hover:bg-sapatao-verde/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-sapatao-verde/50 active:translate-y-px disabled:opacity-50"
        >
          {/* Send arrow icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="size-4"
          >
            <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

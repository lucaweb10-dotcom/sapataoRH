// Copia o worker do encoder Opus de node_modules para public/opus.
//
// O opus-recorder carrega o encoder por URL em tempo de execução (Web Worker),
// então o arquivo precisa ser servido estaticamente. Rodar no postinstall e no
// prebuild mantém a cópia em sincronia com a versão do pacote — sem isto, um
// `npm update` deixaria um worker velho em public sem ninguém perceber.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const origem = join(raiz, "node_modules", "opus-recorder", "dist", "encoderWorker.min.js");
const destinoDir = join(raiz, "public", "opus");
const destino = join(destinoDir, "encoderWorker.min.js");

if (!existsSync(origem)) {
  // Em CI com --omit=dev ou instalação parcial, não é erro fatal.
  console.warn("[opus] encoderWorker.min.js não encontrado em node_modules; pulando cópia.");
  process.exit(0);
}

mkdirSync(destinoDir, { recursive: true });
copyFileSync(origem, destino);
console.log("[opus] worker copiado para public/opus/encoderWorker.min.js");

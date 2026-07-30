/**
 * O pacote opus-recorder não publica tipos (8.0.5). Declaramos só o que
 * usamos — encoder Opus em WASM rodando num Web Worker.
 */
declare module "opus-recorder" {
  export interface RecorderConfig {
    /** URL pública do worker do encoder (servido de /public). */
    encoderPath?: string;
    encoderSampleRate?: number;
    numberOfChannels?: number;
    /** 2048 = VOIP, 2049 = áudio, 2051 = baixa latência. */
    encoderApplication?: number;
    encoderBitRate?: number;
    /** false = entrega o arquivo inteiro de uma vez no fim. */
    streamPages?: boolean;
    monitorGain?: number;
    recordingGain?: number;
  }

  export default class Recorder {
    constructor(config?: RecorderConfig);
    static isRecordingSupported(): boolean;
    /** Ogg/Opus completo quando streamPages=false. */
    ondataavailable: ((data: Uint8Array) => void) | null;
    onstart: (() => void) | null;
    onstop: (() => void) | null;
    onpause: (() => void) | null;
    onresume: (() => void) | null;
    start(): Promise<void>;
    stop(): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    close(): void;
  }
}

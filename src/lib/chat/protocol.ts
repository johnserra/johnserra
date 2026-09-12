import { utf8ByteLength } from "./limits";
import type { ChatErrorCode } from "./validation";

export interface ChatDeltaFrame {
  type: "delta";
  text: string;
}

export interface ChatErrorFrame {
  type: "error";
  code: ChatErrorCode;
  message: string;
}

export interface ChatDoneFrame {
  type: "done";
}

export type ChatFrame = ChatDeltaFrame | ChatErrorFrame | ChatDoneFrame;

export const EMPTY_MODEL_RESPONSE_MESSAGE = "The assistant returned an empty answer. Please try again.";

export function terminalChatFrame(hasOutput: boolean): ChatDoneFrame | ChatErrorFrame {
  return hasOutput
    ? { type: "done" }
    : { type: "error", code: "MODEL_ERROR", message: EMPTY_MODEL_RESPONSE_MESSAGE };
}

export function encodeChatFrame(frame: ChatFrame): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(frame)}\n`);
}

export function parseChatFrame(line: string): ChatFrame {
  const value = JSON.parse(line) as unknown;
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Invalid chat frame");
  const frame = value as Record<string, unknown>;
  if (frame.type === "delta" && typeof frame.text === "string") return { type: "delta", text: frame.text };
  if (frame.type === "done") return { type: "done" };
  if (frame.type === "error" && typeof frame.code === "string" && typeof frame.message === "string") {
    return { type: "error", code: frame.code as ChatErrorCode, message: frame.message };
  }
  throw new Error("Invalid chat frame");
}

export class NdjsonChatParser {
  private readonly decoder = new TextDecoder();
  private pending = "";

  push(chunk: Uint8Array | string): ChatFrame[] {
    this.pending += typeof chunk === "string" ? chunk : this.decoder.decode(chunk, { stream: true });
    return this.takeLines();
  }

  finish(): ChatFrame[] {
    this.pending += this.decoder.decode();
    const frames = this.takeLines();
    if (this.pending.trim()) throw new Error("Incomplete NDJSON frame");
    return frames;
  }

  private takeLines(): ChatFrame[] {
    const frames: ChatFrame[] = [];
    let newline = this.pending.indexOf("\n");
    while (newline >= 0) {
      const line = this.pending.slice(0, newline).replace(/\r$/, "");
      this.pending = this.pending.slice(newline + 1);
      if (line.trim()) frames.push(parseChatFrame(line));
      newline = this.pending.indexOf("\n");
    }
    return frames;
  }
}

export function chatFrameBytes(frame: ChatFrame): number {
  return utf8ByteLength(JSON.stringify(frame)) + 1;
}

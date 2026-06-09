// Tokenize the live content of a box into a flat token stream that the
// interpreter consumes. Words, newlines (significant only for `input`), and
// nested boxes (used as procedure bodies, loop bodies, and inline values).

import { boxKind, boxName, contentEl } from "../model/box.js";
import type { BoxKind } from "../model/box.js";

export type Token =
  | { t: "word"; v: string }
  | { t: "nl" }
  | { t: "box"; el: HTMLElement; kind: BoxKind; name: string | null };

export function tokenizeContent(content: HTMLElement): Token[] {
  const out: Token[] = [];

  const pushText = (text: string) => {
    // split into words, emitting a single `nl` for whitespace runs with \n
    const parts = text.split(/(\s+)/);
    for (const part of parts) {
      if (part === "") continue;
      if (/^\s+$/.test(part)) {
        if (part.includes("\n")) out.push({ t: "nl" });
      } else {
        out.push({ t: "word", v: part });
      }
    }
  };

  const walk = (node: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        pushText(child.nodeValue ?? "");
      } else if (child instanceof HTMLElement) {
        if (child.classList.contains("box")) {
          out.push({
            t: "box",
            el: child,
            kind: boxKind(child),
            name: boxName(child),
          });
        } else if (child.tagName === "BR") {
          out.push({ t: "nl" });
        } else if (
          child.classList.contains("box-controls") ||
          child.classList.contains("box-badge")
        ) {
          // chrome
        } else {
          if (child.tagName === "DIV" || child.tagName === "P")
            out.push({ t: "nl" });
          walk(child);
        }
      }
    });
  };

  walk(content);
  return out;
}

export function tokenizeBox(boxEl: HTMLElement): Token[] {
  const c = contentEl(boxEl);
  return c ? tokenizeContent(c) : [];
}

/** A cursor over a token array with lookahead. */
export class TokenReader {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  /** Peek the next non-newline token without consuming. */
  peek(): Token | null {
    let i = this.pos;
    while (i < this.tokens.length && this.tokens[i].t === "nl") i++;
    return this.tokens[i] ?? null;
  }

  /** Consume and return the next non-newline token. */
  next(): Token | null {
    while (this.pos < this.tokens.length && this.tokens[this.pos].t === "nl")
      this.pos++;
    return this.tokens[this.pos] ? this.tokens[this.pos++] : null;
  }

  /** Peek the very next token, newline included. */
  peekRaw(): Token | null {
    return this.tokens[this.pos] ?? null;
  }

  atEnd(): boolean {
    return this.peek() === null;
  }
}

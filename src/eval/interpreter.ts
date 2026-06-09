// A tiny Logo/Boxer-flavored interpreter over the live DOM box tree.
//
// Supported (M1):
//   movement:   forward/fd  back/bk  right/rt  left/lt
//   pen:        penup/pu  pendown/pd  home  clear/cs  setxy  setheading/seth
//   control:    repeat <n> <body-box>   if <expr> <body-box>
//   variables:  make <name> <expr>      (writes back to a named data box -> live update)
//   procedures: a named doit box; `input a b ...` on its first line declares params;
//               call it by name with argument expressions, e.g.  star 40 60
//   expressions: + - * /  and comparisons = <> < > <= >=  (1/0), parens, unary minus,
//                number literals, variable refs, and inline data boxes as values.
//
// Scope is lexical: a name resolves to a named box reachable by walking up the
// DOM box-ancestry of the box where it is *used* (for builtins/vars) or *defined*
// (for a called procedure's body). Call arguments layer a dynamic frame on top.

import {
  boxKind,
  boxName,
  childBoxes,
  contentEl,
  canvasOf,
  enclosingBox,
  setName,
} from "../model/box.js";
import { TokenReader, tokenizeBox } from "./reader.js";
import type { Token } from "./reader.js";
import { Turtle } from "./turtle.js";

export class EvalError extends Error {}

interface Scope {
  vars: Map<string, number>;
  /** lexical anchor for resolving named boxes */
  boxEl: HTMLElement;
  parent: Scope | null;
}

const MOVE = new Set(["forward", "fd", "back", "bk"]);
const TURN = new Set(["right", "rt", "left", "lt"]);
const BUILTINS = new Set([
  ...MOVE,
  ...TURN,
  "penup",
  "pu",
  "pendown",
  "pd",
  "home",
  "clear",
  "cs",
  "clearscreen",
  "setxy",
  "setheading",
  "seth",
  "repeat",
  "if",
  "make",
  "set",
  "input",
  "output",
  "stop",
]);

/** Run a doit box. Returns a human-readable status string. */
export function runDoit(doitEl: HTMLElement): string {
  const canvas = findGraphicsCanvas(doitEl);
  if (!canvas)
    throw new EvalError(
      "No graphics box in scope to draw into — add a graphics box near this doit box.",
    );
  const turtle = new Turtle(canvas);
  turtle.clear();
  turtle.home();

  const scope: Scope = { vars: new Map(), boxEl: doitEl, parent: null };
  const reader = new TokenReader(tokenizeBox(doitEl));
  execBlock(reader, scope, turtle);
  turtle.drawMarker();
  return "ok";
}

function execBlock(reader: TokenReader, scope: Scope, turtle: Turtle): void {
  while (!reader.atEnd()) {
    execStatement(reader, scope, turtle);
  }
}

function execStatement(
  reader: TokenReader,
  scope: Scope,
  turtle: Turtle,
): void {
  const tok = reader.next();
  if (!tok) return;
  if (tok.t === "box") {
    // a bare box at statement position: run it as a sub-block (doit) — ignore data
    if (tok.kind === "doit") execBox(tok.el, scope, turtle);
    return;
  }
  const w = tok.v.toLowerCase();

  if (MOVE.has(w)) {
    const n = readExpr(reader, scope);
    turtle.forward(w === "back" || w === "bk" ? -n : n);
    return;
  }
  if (TURN.has(w)) {
    const n = readExpr(reader, scope);
    turtle.right(w === "left" || w === "lt" ? -n : n);
    return;
  }
  switch (w) {
    case "penup":
    case "pu":
      turtle.penDown = false;
      return;
    case "pendown":
    case "pd":
      turtle.penDown = true;
      return;
    case "home":
      turtle.home();
      return;
    case "clear":
    case "cs":
    case "clearscreen":
      turtle.clear();
      turtle.home();
      return;
    case "setxy": {
      const x = readExpr(reader, scope);
      const y = readExpr(reader, scope);
      turtle.setxy(x, y);
      return;
    }
    case "setheading":
    case "seth":
      turtle.setHeading(readExpr(reader, scope));
      return;
    case "repeat": {
      const count = Math.round(readExpr(reader, scope));
      const body = expectBox(reader, "repeat needs a box of commands to repeat");
      for (let i = 0; i < count; i++) execBox(body, scope, turtle);
      return;
    }
    case "if": {
      const cond = readExpr(reader, scope);
      const body = expectBox(reader, "if needs a box of commands");
      if (cond !== 0) execBox(body, scope, turtle);
      return;
    }
    case "make":
    case "set": {
      const nameTok = reader.next();
      if (!nameTok || nameTok.t !== "word")
        throw new EvalError(`${w} needs a variable name`);
      const value = readExpr(reader, scope);
      assignVar(scope, nameTok.v, value);
      return;
    }
    case "input":
      // declares params; only meaningful at the head of a procedure body,
      // where callProcedure handles it. At top level, skip the name list.
      consumeInputNames(reader);
      return;
    case "output":
    case "stop":
      readOptionalExpr(reader, scope);
      return;
  }

  // not a builtin: try a procedure (named doit box) in scope
  const proc = findNamedBox(scope, w, "doit");
  if (proc) {
    callProcedure(proc, reader, scope, turtle);
    return;
  }
  throw new EvalError(`I don't know how to "${tok.v}".`);
}

function execBox(boxEl: HTMLElement, scope: Scope, turtle: Turtle): void {
  const reader = new TokenReader(tokenizeBox(boxEl));
  // a sub-block sees the same scope (lexical names still resolve via boxEl chain)
  execBlock(reader, scope, turtle);
}

function callProcedure(
  proc: HTMLElement,
  caller: TokenReader,
  callerScope: Scope,
  turtle: Turtle,
): void {
  const tokens = tokenizeBox(proc);
  const body = new TokenReader(tokens);
  const frame: Scope = { vars: new Map(), boxEl: proc, parent: null };

  // optional leading `input a b ...`
  if (peekWord(body) === "input") {
    body.next(); // consume `input`
    const params = readInputNames(body);
    for (const p of params) {
      const arg = readExpr(caller, callerScope); // evaluate in CALLER scope
      frame.vars.set(p.toLowerCase(), arg);
    }
  }
  execBlock(body, frame, turtle);
}

// ---- expressions ---------------------------------------------------------
// precedence:  comparison  <  add/sub  <  mul/div  <  unary  <  primary

function readExpr(reader: TokenReader, scope: Scope): number {
  return parseComparison(reader, scope);
}

function readOptionalExpr(reader: TokenReader, scope: Scope): number | null {
  if (startsValue(reader.peek())) return readExpr(reader, scope);
  return null;
}

function parseComparison(reader: TokenReader, scope: Scope): number {
  let left = parseAdd(reader, scope);
  for (;;) {
    const op = peekOp(reader, ["=", "<>", "<", ">", "<=", ">="]);
    if (!op) return left;
    reader.next();
    const right = parseAdd(reader, scope);
    switch (op) {
      case "=": left = left === right ? 1 : 0; break;
      case "<>": left = left !== right ? 1 : 0; break;
      case "<": left = left < right ? 1 : 0; break;
      case ">": left = left > right ? 1 : 0; break;
      case "<=": left = left <= right ? 1 : 0; break;
      case ">=": left = left >= right ? 1 : 0; break;
    }
  }
}

function parseAdd(reader: TokenReader, scope: Scope): number {
  let left = parseMul(reader, scope);
  for (;;) {
    const op = peekOp(reader, ["+", "-"]);
    if (!op) return left;
    reader.next();
    const right = parseMul(reader, scope);
    left = op === "+" ? left + right : left - right;
  }
}

function parseMul(reader: TokenReader, scope: Scope): number {
  let left = parseUnary(reader, scope);
  for (;;) {
    const op = peekOp(reader, ["*", "/"]);
    if (!op) return left;
    reader.next();
    const right = parseUnary(reader, scope);
    left = op === "*" ? left * right : left / right;
  }
}

function parseUnary(reader: TokenReader, scope: Scope): number {
  if (peekOp(reader, ["-"])) {
    reader.next();
    return -parseUnary(reader, scope);
  }
  if (peekOp(reader, ["+"])) {
    reader.next();
    return parseUnary(reader, scope);
  }
  return parsePrimary(reader, scope);
}

function parsePrimary(reader: TokenReader, scope: Scope): number {
  const tok = reader.next();
  if (!tok) throw new EvalError("Expected a value but the box ended.");
  if (tok.t === "box") {
    if (tok.kind === "data") return boxToNumber(tok.el, scope);
    throw new EvalError("Expected a value, found a non-data box.");
  }
  const w = tok.v;
  if (w === "(") {
    const inner = readExpr(reader, scope);
    const close = reader.next();
    if (!close || close.t !== "word" || close.v !== ")")
      throw new EvalError("Missing ')'.");
    return inner;
  }
  if (isNumber(w)) return parseFloat(w);
  // variable reference
  return resolveVar(scope, w);
}

// ---- names & variables ---------------------------------------------------

function resolveVar(scope: Scope, name: string): number {
  const key = name.toLowerCase();
  for (let s: Scope | null = scope; s; s = s.parent) {
    if (s.vars.has(key)) return s.vars.get(key)!;
  }
  const dataBox = findNamedBox(scope, name, "data");
  if (dataBox) return boxToNumber(dataBox, scope);
  const proc = findNamedBox(scope, name, "doit");
  if (proc) throw new EvalError(`"${name}" is a procedure, not a value.`);
  throw new EvalError(`I don't know the variable "${name}".`);
}

function assignVar(scope: Scope, name: string, value: number): void {
  // naive realism: if a data box with this name is in scope, update it on screen
  const dataBox = findNamedBox(scope, name, "data");
  if (dataBox) {
    const content = contentEl(dataBox);
    content.textContent = formatNumber(value);
  }
  // also bind in the nearest frame so subsequent reads this run are consistent
  scope.vars.set(name.toLowerCase(), value);
}

function boxToNumber(dataBox: HTMLElement, _scope: Scope): number {
  const reader = new TokenReader(tokenizeBox(dataBox));
  const inner: Scope = { vars: new Map(), boxEl: dataBox, parent: null };
  if (reader.atEnd()) throw new EvalError("A data box used as a value is empty.");
  return readExpr(reader, inner);
}

/** Find a named box of a given kind, lexically, from `scope.boxEl` upward. */
function findNamedBox(
  scope: Scope,
  name: string,
  kind: "data" | "doit",
): HTMLElement | null {
  const target = name.toLowerCase();
  let box: HTMLElement | null = scope.boxEl;
  while (box) {
    for (const child of childBoxes(box)) {
      const n = boxName(child);
      if (n && n.toLowerCase() === target && boxKind(child) === kind)
        return child;
    }
    // also allow the box itself to be the named definition (rare) — skip
    box = enclosingBox(box.parentElement);
  }
  return null;
}

// ---- token helpers -------------------------------------------------------

function expectBox(reader: TokenReader, msg: string): HTMLElement {
  const tok = reader.next();
  if (!tok || tok.t !== "box") throw new EvalError(msg);
  return tok.el;
}

function peekWord(reader: TokenReader): string | null {
  const t = reader.peek();
  return t && t.t === "word" ? t.v.toLowerCase() : null;
}

function peekOp(reader: TokenReader, ops: string[]): string | null {
  const t = reader.peek();
  if (t && t.t === "word" && ops.includes(t.v)) return t.v;
  return null;
}

function startsValue(t: Token | null): boolean {
  if (!t) return false;
  if (t.t === "box") return t.kind === "data";
  return t.v === "(" || t.v === "-" || t.v === "+" || isNumber(t.v) || isName(t.v);
}

/** read `input a b c` parameter names up to a newline */
function readInputNames(reader: TokenReader): string[] {
  const names: string[] = [];
  for (;;) {
    const raw = reader.peekRaw();
    if (!raw) break;
    if (raw.t === "nl") break;
    if (raw.t === "word" && isName(raw.v)) {
      reader.next();
      names.push(raw.v);
    } else break;
  }
  return names;
}

function consumeInputNames(reader: TokenReader): void {
  readInputNames(reader);
}

function isNumber(w: string): boolean {
  return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(w);
}

function isName(w: string): boolean {
  return /^[A-Za-z_][\w-]*$/.test(w);
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1e6) / 1e6);
}

// ---- graphics target -----------------------------------------------------

/**
 * Find the graphics canvas this doit box should draw into: search the box's
 * own subtree, then each ancestor's subtree, taking the nearest graphics box.
 */
function findGraphicsCanvas(doitEl: HTMLElement): HTMLCanvasElement | null {
  let scope: HTMLElement | null = doitEl;
  while (scope) {
    const gfx = firstGraphicsIn(scope, doitEl);
    if (gfx) return canvasOf(gfx);
    scope = enclosingBox(scope.parentElement);
  }
  return null;
}

function firstGraphicsIn(
  root: HTMLElement,
  exclude: HTMLElement,
): HTMLElement | null {
  if (boxKind(root) === "graphics") return root;
  for (const child of childBoxes(root)) {
    if (child === exclude) continue;
    const found = firstGraphicsIn(child, exclude);
    if (found) return found;
  }
  return null;
}

// re-export for callers that want to set a name programmatically later
export { setName };

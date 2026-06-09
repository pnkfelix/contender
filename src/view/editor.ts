// Editor interactions: inserting/nesting boxes at the caret, the per-box
// control strip, and keyboard shortcuts. Editing itself is plain
// contenteditable — the DOM is the document.

import {
  boxDisplay,
  boxKind,
  boxName,
  contentEl,
  enclosingBox,
  isBox,
  makeBox,
  setDisplay,
  setKind,
  setName,
} from "../model/box.js";
import type { BoxKind, BoxDisplay } from "../model/box.js";
import { runDoit, EvalError } from "../eval/interpreter.js";

type StatusFn = (msg: string, isError?: boolean) => void;

let world!: HTMLElement;
let status: StatusFn = () => {};

export function installEditor(worldEl: HTMLElement, statusFn: StatusFn): void {
  world = worldEl;
  status = statusFn;

  world.addEventListener("click", onControlClick);
  world.addEventListener("keydown", onKeyDown);
}

// ---- inserting boxes -----------------------------------------------------

export function insertBoxAtCaret(kind: BoxKind): void {
  const host = activeEditableHost() ?? rootContent();
  if (!host) {
    status("Nowhere to put a box yet.", true);
    return;
  }
  const box = makeBox(kind, kind === "doit" ? { text: "" } : {});
  box.classList.add("just-made");
  setTimeout(() => box.classList.remove("just-made"), 500);

  const range = caretRangeIn(host);
  range.insertNode(box);

  // place the caret inside the new box (text kinds) or right after it (graphics)
  if (kind === "graphics") {
    placeCaretAfter(box);
  } else {
    const inner = contentEl(box);
    placeCaretAtStart(inner);
  }
  status(`Inserted a ${kind} box.`);
}

export function runFocusedDoit(): void {
  const box = focusedBoxOfKind("doit");
  if (!box) {
    status("Put the cursor inside a doit box, then run.", true);
    return;
  }
  runBox(box);
}

export function runBox(box: HTMLElement): void {
  try {
    runDoit(box);
    status(`Ran ${boxName(box) ?? "doit box"}.`);
  } catch (e) {
    const msg = e instanceof EvalError ? e.message : String(e);
    status(msg, true);
    if (!(e instanceof EvalError)) console.error(e);
  }
}

// ---- control strip -------------------------------------------------------

function onControlClick(ev: MouseEvent): void {
  const btn = (ev.target as HTMLElement).closest(
    ".box-controls button",
  ) as HTMLElement | null;
  if (!btn) return;
  const box = enclosingBox(btn);
  if (!box) return;
  ev.preventDefault();

  switch (btn.dataset.action) {
    case "run":
      runBox(box);
      break;
    case "kind":
      cycleKind(box);
      break;
    case "name":
      toggleName(box);
      break;
    case "size":
      toggleSize(box);
      break;
    case "full":
      toggleFull(box);
      break;
    case "delete":
      deleteBox(box);
      break;
  }
}

const KIND_CYCLE: BoxKind[] = ["doit", "data", "graphics"];

function cycleKind(box: HTMLElement): void {
  const cur = boxKind(box);
  const next = KIND_CYCLE[(KIND_CYCLE.indexOf(cur) + 1) % KIND_CYCLE.length];
  setKind(box, next);
  status(`Box is now a ${next} box.`);
}

function toggleName(box: HTMLElement): void {
  if (boxName(box) === null) {
    setName(box, "name");
    const tab = box.querySelector(":scope > .box-tab") as HTMLElement;
    selectAll(tab);
  } else {
    setName(box, null);
  }
}

function toggleSize(box: HTMLElement): void {
  const d = boxDisplay(box);
  setDisplay(box, d === "shrunken" ? "expanded" : "shrunken");
}

function toggleFull(box: HTMLElement): void {
  const d = boxDisplay(box);
  setDisplay(box, d === "fullscreen" ? "expanded" : "fullscreen");
}

function deleteBox(box: HTMLElement): void {
  if (box === world.firstElementChild) {
    status("Can't delete the top-level box.", true);
    return;
  }
  const parentContent = box.parentElement;
  placeCaretAfter(box);
  box.remove();
  parentContent?.normalize();
}

// ---- keyboard ------------------------------------------------------------

function onKeyDown(ev: KeyboardEvent): void {
  const mod = ev.metaKey || ev.ctrlKey;

  if (mod && ev.key === "Enter") {
    ev.preventDefault();
    runFocusedDoit();
    return;
  }
  if (mod && (ev.key === "b" || ev.key === "B")) {
    ev.preventDefault();
    insertBoxAtCaret("doit");
    return;
  }
  if (mod && ev.shiftKey && (ev.key === "d" || ev.key === "D")) {
    ev.preventDefault();
    insertBoxAtCaret("data");
    return;
  }
  if (ev.key === "Escape") {
    const box = currentBox();
    if (box && box !== world.firstElementChild) {
      ev.preventDefault();
      placeCaretAfter(box);
    }
  }
}

// ---- selection helpers ---------------------------------------------------

/** The editable element (.box-content or .box-tab) the caret is in. */
function activeEditableHost(): HTMLElement | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const node = sel.anchorNode;
  let el = node instanceof Element ? node : node?.parentElement;
  while (el) {
    if (
      el.classList?.contains("box-content") &&
      (el as HTMLElement).isContentEditable
    )
      return el as HTMLElement;
    if (el.classList?.contains("box-tab")) {
      // typing a box from the tab: redirect into that box's content
      const box = enclosingBox(el);
      return box ? contentEl(box) : null;
    }
    if (el === world) break;
    el = el.parentElement;
  }
  return null;
}

function currentBox(): HTMLElement | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  return enclosingBox(sel.anchorNode);
}

function focusedBoxOfKind(kind: BoxKind): HTMLElement | null {
  let box = currentBox();
  while (box) {
    if (boxKind(box) === kind) return box;
    box = enclosingBox(box.parentElement);
  }
  return null;
}

function rootContent(): HTMLElement | null {
  const root = world.firstElementChild;
  return isBox(root) ? contentEl(root) : null;
}

/** A range at the current caret if it's inside `host`, else at host's end. */
function caretRangeIn(host: HTMLElement): Range {
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const r = sel.getRangeAt(0);
    if (host.contains(r.startContainer)) {
      r.deleteContents();
      return r;
    }
  }
  const r = document.createRange();
  r.selectNodeContents(host);
  r.collapse(false);
  return r;
}

function placeCaretAtStart(el: HTMLElement): void {
  el.focus();
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(true);
  applyRange(r);
}

function placeCaretAfter(node: Node): void {
  const r = document.createRange();
  r.setStartAfter(node);
  r.collapse(true);
  applyRange(r);
  const host = enclosingEditable(node.parentNode);
  host?.focus();
}

function selectAll(el: HTMLElement): void {
  el.focus();
  const r = document.createRange();
  r.selectNodeContents(el);
  applyRange(r);
}

function applyRange(r: Range): void {
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(r);
}

function enclosingEditable(node: Node | null): HTMLElement | null {
  let el = node instanceof Element ? node : node?.parentElement;
  while (el) {
    if ((el as HTMLElement).isContentEditable) return el as HTMLElement;
    el = el.parentElement;
  }
  return null;
}

export type { BoxDisplay };

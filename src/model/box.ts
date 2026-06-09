// The box model. In Contender the *live DOM is the document* (naive realism),
// so these helpers are mostly thin queries/constructors over .box elements.
// A serializable BoxNode tree is produced only for save/load.

export type BoxKind = "data" | "doit" | "graphics";
export type BoxDisplay = "expanded" | "shrunken" | "fullscreen";

export type ContentItem =
  | { type: "text"; text: string }
  | { type: "box"; box: BoxNode };

export interface BoxNode {
  kind: BoxKind;
  name: string | null;
  display: BoxDisplay;
  content: ContentItem[];
  /** graphics boxes only */
  graphics?: { width: number; height: number };
}

export const DEFAULT_GRAPHICS = { width: 360, height: 300 };

// ---- queries -------------------------------------------------------------

export function isBox(el: Element | null): el is HTMLElement {
  return !!el && el.classList.contains("box");
}

export function boxKind(el: HTMLElement): BoxKind {
  return (el.dataset.kind as BoxKind) ?? "doit";
}

export function boxDisplay(el: HTMLElement): BoxDisplay {
  return (el.dataset.display as BoxDisplay) ?? "expanded";
}

export function boxName(el: HTMLElement): string | null {
  const tab = el.querySelector(":scope > .box-tab");
  return tab ? tab.textContent!.trim() || null : null;
}

/** The editable content element of a box (holds text + child boxes, or a canvas). */
export function contentEl(el: HTMLElement): HTMLElement {
  return el.querySelector(":scope > .box-content") as HTMLElement;
}

export function canvasOf(el: HTMLElement): HTMLCanvasElement | null {
  return el.querySelector(":scope > .box-content > canvas");
}

/** Direct child boxes of a box (those living in its content). */
export function childBoxes(el: HTMLElement): HTMLElement[] {
  const content = contentEl(el);
  if (!content) return [];
  return Array.from(content.children).filter((c) =>
    isBox(c),
  ) as HTMLElement[];
}

/** Nearest enclosing box of an arbitrary node (or the node's box itself). */
export function enclosingBox(node: Node | null): HTMLElement | null {
  let el =
    node instanceof Element ? node : (node?.parentElement ?? null);
  return (el?.closest(".box") as HTMLElement) ?? null;
}

// ---- mutation ------------------------------------------------------------

export function setKind(el: HTMLElement, kind: BoxKind): void {
  const prev = boxKind(el);
  if (prev === kind) return;
  el.dataset.kind = kind;
  const badge = el.querySelector(":scope > .box-badge");
  if (badge) badge.textContent = kind;
  // toggle graphics canvas vs editable text
  if (kind === "graphics" && prev !== "graphics") {
    makeGraphicsContent(el);
  } else if (kind !== "graphics" && prev === "graphics") {
    makeTextContent(el);
  }
  refreshRunControl(el);
}

export function setDisplay(el: HTMLElement, display: BoxDisplay): void {
  el.dataset.display = display;
}

export function setName(el: HTMLElement, name: string | null): void {
  let tab = el.querySelector(":scope > .box-tab") as HTMLElement | null;
  if (name === null) {
    tab?.remove();
    return;
  }
  if (!tab) {
    tab = document.createElement("div");
    tab.className = "box-tab";
    tab.contentEditable = "true";
    tab.spellcheck = false;
    el.insertBefore(tab, el.firstChild);
  }
  tab.textContent = name;
}

// ---- construction --------------------------------------------------------

let uid = 0;
export function freshId(): string {
  return `b${++uid}`;
}

interface MakeOpts {
  name?: string | null;
  display?: BoxDisplay;
  text?: string;
  graphics?: { width: number; height: number };
}

export function makeBox(kind: BoxKind, opts: MakeOpts = {}): HTMLElement {
  const el = document.createElement("div");
  el.className = "box";
  el.dataset.kind = kind;
  el.dataset.display = opts.display ?? "expanded";
  el.dataset.id = freshId();
  el.contentEditable = "false"; // wrapper is atomic within its parent's content

  if (opts.name != null) setName(el, opts.name);

  if (kind === "graphics") {
    makeGraphicsContent(el, opts.graphics);
  } else {
    const content = document.createElement("div");
    content.className = "box-content";
    content.contentEditable = "true";
    content.spellcheck = false;
    if (opts.text) content.textContent = opts.text;
    el.appendChild(content);
  }

  addChrome(el, kind);
  return el;
}

function addChrome(el: HTMLElement, kind: BoxKind): void {
  const controls = document.createElement("div");
  controls.className = "box-controls";
  controls.contentEditable = "false";
  controls.innerHTML = controlsHTML(kind);
  el.appendChild(controls);

  const badge = document.createElement("div");
  badge.className = "box-badge";
  badge.contentEditable = "false";
  badge.textContent = kind;
  el.appendChild(badge);
}

function controlsHTML(kind: BoxKind): string {
  const run =
    kind === "doit" ? `<button data-action="run" title="Run (Cmd/Ctrl+Enter)">▷</button>` : "";
  return (
    run +
    `<button data-action="kind" title="Change kind">${kind}</button>` +
    `<button data-action="name" title="Name / unname">🏷</button>` +
    `<button data-action="size" title="Shrink / expand">▭</button>` +
    `<button data-action="full" title="Full screen">⛶</button>` +
    `<button data-action="delete" title="Delete box">✕</button>`
  );
}

function refreshRunControl(el: HTMLElement): void {
  const controls = el.querySelector(":scope > .box-controls");
  if (!controls) return;
  const kind = boxKind(el);
  const kindBtn = controls.querySelector('[data-action="kind"]');
  if (kindBtn) kindBtn.textContent = kind;
  const hasRun = !!controls.querySelector('[data-action="run"]');
  if (kind === "doit" && !hasRun) {
    const b = document.createElement("button");
    b.dataset.action = "run";
    b.title = "Run (Cmd/Ctrl+Enter)";
    b.textContent = "▷";
    controls.insertBefore(b, controls.firstChild);
  } else if (kind !== "doit" && hasRun) {
    controls.querySelector('[data-action="run"]')!.remove();
  }
}

function makeGraphicsContent(
  el: HTMLElement,
  size = DEFAULT_GRAPHICS,
): void {
  contentEl(el)?.remove();
  const content = document.createElement("div");
  content.className = "box-content";
  content.contentEditable = "false";
  const canvas = document.createElement("canvas");
  canvas.className = "box-canvas";
  canvas.width = size.width;
  canvas.height = size.height;
  content.appendChild(canvas);
  // insert after tab (if any), before controls/badge
  const ref = el.querySelector(":scope > .box-controls");
  el.insertBefore(content, ref);
}

function makeTextContent(el: HTMLElement): void {
  contentEl(el)?.remove();
  const content = document.createElement("div");
  content.className = "box-content";
  content.contentEditable = "true";
  content.spellcheck = false;
  const ref = el.querySelector(":scope > .box-controls");
  el.insertBefore(content, ref);
}

// ---- serialize / deserialize --------------------------------------------

export function readBox(el: HTMLElement): BoxNode {
  const kind = boxKind(el);
  const node: BoxNode = {
    kind,
    name: boxName(el),
    display: boxDisplay(el),
    content: [],
  };
  if (kind === "graphics") {
    const c = canvasOf(el);
    node.graphics = c
      ? { width: c.width, height: c.height }
      : { ...DEFAULT_GRAPHICS };
    return node;
  }
  node.content = readContent(contentEl(el));
  return node;
}

function readContent(content: HTMLElement): ContentItem[] {
  const items: ContentItem[] = [];
  const pushText = (t: string) => {
    if (!t) return;
    const last = items[items.length - 1];
    if (last && last.type === "text") last.text += t;
    else items.push({ type: "text", text: t });
  };
  const walk = (node: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        pushText(child.nodeValue ?? "");
      } else if (child instanceof HTMLElement) {
        if (child.classList.contains("box")) {
          items.push({ type: "box", box: readBox(child) });
        } else if (child.tagName === "BR") {
          pushText("\n");
        } else if (
          child.classList.contains("box-controls") ||
          child.classList.contains("box-badge")
        ) {
          // chrome: skip
        } else {
          // a wrapper div/p that the editor created for a line
          if (child.tagName === "DIV" || child.tagName === "P") pushText("\n");
          walk(child);
        }
      }
    });
  };
  walk(content);
  return items;
}

export function renderBox(node: BoxNode): HTMLElement {
  const el = makeBox(node.kind, {
    name: node.name,
    display: node.display,
    graphics: node.graphics,
  });
  if (node.kind !== "graphics") {
    const content = contentEl(el);
    content.textContent = "";
    for (const item of node.content) {
      if (item.type === "text") {
        content.appendChild(document.createTextNode(item.text));
      } else {
        content.appendChild(renderBox(item.box));
      }
    }
  }
  return el;
}

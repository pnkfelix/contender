import "./styles.css";
import {
  readBox,
  renderBox,
  DEFAULT_GRAPHICS,
} from "./model/box.js";
import type { BoxNode, ContentItem } from "./model/box.js";
import {
  installEditor,
  insertBoxAtCaret,
  runFocusedDoit,
} from "./view/editor.js";

const STORAGE_KEY = "contender.world.v1";

const world = document.getElementById("world")!;
const statusEl = document.getElementById("status")!;

function setStatus(msg: string, isError = false): void {
  statusEl.textContent = msg;
  statusEl.classList.toggle("error", isError);
}

// ---- seed world ----------------------------------------------------------

const txt = (text: string): ContentItem => ({ type: "text", text });
const sub = (box: BoxNode): ContentItem => ({ type: "box", box });

function node(
  kind: BoxNode["kind"],
  content: ContentItem[],
  name: string | null = null,
): BoxNode {
  return { kind, name, display: "expanded", content };
}
const doit = (c: ContentItem[], name: string | null = null) =>
  node("doit", c, name);
const data = (c: ContentItem[], name: string | null = null) =>
  node("data", c, name);
const graphics = (): BoxNode => ({
  kind: "graphics",
  name: null,
  display: "expanded",
  content: [],
  graphics: { ...DEFAULT_GRAPHICS },
});

function seedWorld(): BoxNode {
  return data(
    [
      txt(
        "Welcome to Contender — a reconstructible medium made of boxes.\n\n" +
          "Everything you see is the computational world itself. Put the cursor in a doit box and press Cmd/Ctrl+Enter (or click ▷) to run it.\n\n" +
          "1. A loop. The box after `repeat 36` is the body that repeats:\n",
      ),
      sub(
        doit([txt("repeat 36 "), sub(doit([txt("right 10\nforward 30")]))]),
      ),
      txt("\nIt draws into this graphics box:\n"),
      sub(graphics()),
      txt(
        "\n2. A procedure — a named doit box. `input` names its parameters.\n",
      ),
      sub(
        doit(
          [
            txt("input size angle\nrepeat 360 / angle "),
            sub(doit([txt("forward size\nright angle")])),
          ],
          "star",
        ),
      ),
      txt("   Run this to call it: "),
      sub(doit([txt("star 40 144")])),
      txt(
        "\n\n3. A variable is a named data box. Edit the value, then run — naive realism means the change takes effect:\n   side = ",
      ),
      sub(data([txt("60")], "side")),
      txt("   "),
      sub(
        doit([txt("repeat 4 "), sub(doit([txt("forward side\nright 90")]))]),
      ),
      txt(
        "\n\nMake your own: use the toolbar (+ data / + doit / + graphics) or Cmd/Ctrl+B to nest a doit box at the cursor. Hover a box for its controls.",
      ),
    ],
    "world",
  );
}

// ---- persistence ---------------------------------------------------------

function mountWorld(rootNode: BoxNode): void {
  world.replaceChildren(renderBox(rootNode));
}

function save(): void {
  const root = world.firstElementChild as HTMLElement | null;
  if (!root) return;
  const json = JSON.stringify(readBox(root));
  localStorage.setItem(STORAGE_KEY, json);
  setStatus("Saved.");
}

function load(): void {
  const json = localStorage.getItem(STORAGE_KEY);
  if (!json) {
    setStatus("Nothing saved yet.", true);
    return;
  }
  try {
    mountWorld(JSON.parse(json) as BoxNode);
    setStatus("Loaded saved world.");
  } catch {
    setStatus("Saved world was corrupt; keeping current.", true);
  }
}

function exportJson(): void {
  const root = world.firstElementChild as HTMLElement | null;
  if (!root) return;
  const blob = new Blob([JSON.stringify(readBox(root), null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "contender-world.json";
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus("Exported contender-world.json.");
}

function reset(): void {
  if (!confirm("Discard the current world and start from the seed?")) return;
  mountWorld(seedWorld());
  setStatus("Reset to seed world.");
}

// ---- toolbar -------------------------------------------------------------

document.getElementById("toolbar")!.addEventListener("click", (ev) => {
  const btn = (ev.target as HTMLElement).closest("button[data-cmd]");
  if (!btn) return;
  switch ((btn as HTMLElement).dataset.cmd) {
    case "new-data": insertBoxAtCaret("data"); break;
    case "new-doit": insertBoxAtCaret("doit"); break;
    case "new-graphics": insertBoxAtCaret("graphics"); break;
    case "run": runFocusedDoit(); break;
    case "save": save(); break;
    case "load": load(); break;
    case "export": exportJson(); break;
    case "reset": reset(); break;
  }
});

// ---- boot ----------------------------------------------------------------

installEditor(world, setStatus);

const existing = localStorage.getItem(STORAGE_KEY);
if (existing) {
  try {
    mountWorld(JSON.parse(existing) as BoxNode);
    setStatus("Loaded saved world. (Reset to get the tutorial back.)");
  } catch {
    mountWorld(seedWorld());
  }
} else {
  mountWorld(seedWorld());
  setStatus("Welcome. Run a doit box with Cmd/Ctrl+Enter.");
}

// Snake in a side panel: steer with the arrow keys or WASD, eat the dots, don't hit a wall
// or yourself. Space starts and pauses, R restarts. The game pauses itself when the panel
// hides or the keyboard goes elsewhere, and runs no timer unless a game is running.
//
// A layout places it twice: the board as a block in the `panel-body` stack, and its Snake
// button as a block with props { button: true } after the tab bar. props.radius is the
// button's corner (default 6, as Herdr's own panel buttons); props.divider: false drops the
// line under it, for a tab bar without one.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { layout, props, run, setShared, shared, theme, checking } from "herdr";

const MOD = "herdr-snake";
const COLS = 16, ROWS = 16;
// Room between the board's rounded border and the grid, so cells never reach its corners.
const INSET = 4, RADIUS = 10;
// Milliseconds per step: starts at START, shortens by STEP per dot eaten, never below FASTEST.
const START = 150, STEP = 4, FASTEST = 60;
const DIRS = {
  up: [0, -1], w: [0, -1], down: [0, 1], s: [0, 1],
  left: [-1, 0], a: [-1, 0], right: [1, 0], d: [1, 0],
};

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

function mine() {
  const root = layout(), panel = find(root, "panel"), body = find(root, "panel-body");
  const block = body?.children?.find(c => c.content?.mod === MOD && !c.content?.props?.button);
  return { id: block?.id ?? null, on: Boolean(block && panel && !panel.hidden && body.active === block.id) };
}

const shown = () => { const m = mine(); return m.id ? m.on : true; };

function panelButton(t) {
  const { id, on } = mine();
  return h_flex().size_full().items_center().bg(t.chrome)
    .when(props()?.divider !== false, el => el.border_b(1).border_color(t.border))
    .child(h_flex().id(`${MOD}-button`).h(26).px(8).gap(5).flex_none().items_center().rounded(props()?.radius ?? 6)
      .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
      .hover(s => s.bg(t.hover)).on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(() => {
        if (!id) return;
        if (on) { run("layout.hide", { id: "panel" }); return; }
        const known = shared("workspace.panels") ?? ["files", "changes"];
        if (!known.includes(id)) setShared("workspace.panels", [...known, id]);
        run("layout.select", { stack: "panel-body", child: id });
        run("layout.show", { id: "panel" });
      })
      .child(svg("mods/herdr-snake/snake.svg").size(14)).child("Snake"));
}

export default class Snake extends View {
  init(_props, cx) {
    if (props()?.button) return;
    this.handle = cx.focus_handle();
    this.best = Number(localStorage.getItem("best")) || 0;
    this.size = null;       // the panel's size, to fit the board in both directions
    this.visible = false;
    this.task = null;
    this.reset();
  }

  reset() {
    const y = Math.floor(ROWS / 2);
    this.snake = [{ x: 5, y }, { x: 4, y }, { x: 3, y }];
    this.dir = [1, 0];
    this.queue = [];
    this.score = 0;
    this.state = "ready";   // ready | running | paused | over
    this.food = this.place();
  }

  // A free cell for the next dot.
  place() {
    const taken = new Set(this.snake.map(p => `${p.x},${p.y}`));
    const free = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (!taken.has(`${x},${y}`)) free.push({ x, y });
    return free.length ? free[Math.floor(Math.random() * free.length)] : null;
  }

  speed() { return Math.max(FASTEST, START - this.score * STEP); }

  // The step timer runs only while a game runs; its pace follows the score.
  start(cx) {
    this.stopTimer();
    this.state = "running";
    const pace = this.speed();
    this.task = cx.timer.every(pace, (cx) => {
      // Lost the keyboard or the panel: pause instead of playing blind.
      if (!shown() || !this.handle.is_focused()) { this.pause(cx); return; }
      this.step(cx);
      if (this.state === "running" && this.speed() !== pace) this.start(cx);
    });
    cx.notify();
  }

  stopTimer() {
    this.task?.cancel();
    this.task = null;
  }

  pause(cx) {
    if (this.state !== "running") return;
    this.stopTimer();
    this.state = "paused";
    cx.notify();
  }

  over(cx) {
    this.stopTimer();
    this.state = "over";
    if (this.score > this.best) { this.best = this.score; localStorage.setItem("best", String(this.best)); }
    cx.notify();
  }

  step(cx) {
    // At most one turn per step, from the keys pressed since the last one.
    const turn = this.queue.shift();
    if (turn) this.dir = turn;
    const head = this.snake[0];
    const next = { x: head.x + this.dir[0], y: head.y + this.dir[1] };
    const grows = this.food && next.x === this.food.x && next.y === this.food.y;
    // The tail moves away this step unless the snake grows, so stepping onto it is fine.
    const body = grows ? this.snake : this.snake.slice(0, -1);
    if (next.x < 0 || next.y < 0 || next.x >= COLS || next.y >= ROWS || body.some(p => p.x === next.x && p.y === next.y)) {
      this.over(cx);
      return;
    }
    this.snake = [next, ...body];
    if (grows) {
      this.score++;
      this.food = this.place();
      if (!this.food) { this.over(cx); return; }   // the board is full: a perfect game
    }
    cx.notify();
  }

  key(e, cx) {
    const k = e.key;
    if (DIRS[k]) {
      const [dx, dy] = DIRS[k];
      const last = this.queue[this.queue.length - 1] ?? this.dir;
      // No reversing into yourself, and no repeat of the same direction.
      if (!(dx === -last[0] && dy === -last[1]) && !(dx === last[0] && dy === last[1]) && this.queue.length < 2) this.queue.push([dx, dy]);
      if (this.state === "ready" || this.state === "paused") this.start(cx);
      cx.stop_propagation();
    } else if (k === "space" || k === "enter") {
      if (this.state === "running") this.pause(cx);
      else { if (this.state === "over") this.reset(); this.start(cx); }
      cx.stop_propagation();
    } else if (k === "r") {
      this.stopTimer();
      this.reset();
      this.start(cx);
      cx.stop_propagation();
    } else if (k === "escape") {
      this.pause(cx);
      cx.stop_propagation();
    }
  }

  render(cx) {
    const t = theme();
    if (props()?.button) return panelButton(t);
    // Showing the panel hands it the keyboard; hiding it pauses the game.
    const visible = shown();
    if (visible !== this.visible) {
      this.visible = visible;
      if (visible && !checking()) cx.timer.after(0, () => this.handle.focus());
      else if (!visible) cx.timer.after(0, (cx) => this.pause(cx));   // not during render
    }
    // The board fits both ways: 28px of side padding, ~90px for the header and the hint line.
    const w = this.size?.width ?? 316, h = this.size?.height ?? 420;
    const cell = Math.max(10, Math.floor(Math.min((w - 28 - INSET * 2) / COLS, (h - 96 - INSET * 2) / ROWS)));
    const board = cell * COLS, boardH = cell * ROWS;
    const focused = this.handle.is_focused();
    const message = {
      ready: ["Snake", "Press Space or an arrow key to start"],
      paused: ["Paused", focused ? "Press Space to go on" : "Click here, then press Space"],
      over: [`Game over · ${this.score}`, this.score && this.score >= this.best ? "A new best! Space to play again" : "Space to play again"],
    }[this.state];

    const block = (p, color, inset, radius) => div().absolute()
      .left(p.x * cell + inset).top(p.y * cell + inset).size(cell - inset * 2).rounded(radius).bg(color);

    return v_flex().id("snake").size_full().min_h(0).text_color(t.foreground)
      .track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .on_mouse_down("left", (_e, cx) => { this.handle.focus(); cx.notify(); })
      .on_size_change((size, cx) => {
        if (!this.size || Math.abs(size.width - this.size.width) > 1 || Math.abs(size.height - this.size.height) > 1) { this.size = size; cx.notify(); }
      })
      .child(h_flex().h(42).flex_none().pl(14).pr(14).items_center().gap(10)
        .child(div().flex_1().text_size(13).font_semibold().child("Snake"))
        .child(div().text_size(11.5).text_color(t.muted).child(`Score ${this.score}`))
        .child(div().text_size(11.5).text_color(t.dim).child(`Best ${this.best}`)))
      .child(div().flex_none().px(14)
        .child(div().relative().w(board + INSET * 2 + 2).h(boardH + INSET * 2 + 2).rounded(RADIUS).border_1()
          .border_color(focused ? t.accent : t.border).bg(t.raised).overflow_hidden()
          .child(div().absolute().left(INSET).top(INSET).w(board).h(boardH)
            .when(Boolean(this.food), el => el.child(block(this.food, t.blocked, Math.max(2, cell / 4), cell)))
            .children(this.snake.map((p, i) => block(p, i === 0 ? t.foreground : t.done, 1, i === 0 ? 5 : 3))))
          // A see-through scrim, so a paused or finished board still shows where things were.
          .when(Boolean(message), el => el.child(v_flex().absolute().left(0).top(0).size_full().rounded(RADIUS - 1)
            .items_center().justify_center().gap(4)
            .bg("#0000008c")
            .child(div().text_size(15).font_semibold().child(message[0]))
            .child(div().text_size(11.5).text_color(t.dim).child(message[1]))))))
      .child(div().px(14).pt(10).text_size(11).text_color(t.dim)
        .child("Arrows or WASD to move · Space to pause · R to restart"));
  }
}

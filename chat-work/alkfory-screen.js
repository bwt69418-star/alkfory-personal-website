const out = process.stdout;
const logs = [];
let frame = 0;
let active = true;

const original = {
  log: console.log,
  warn: console.warn,
  error: console.error
};

function capture(type, args) {
  logs.push(type + " " + args.map(x =>
    typeof x === "string" ? x : String(x)
  ).join(" "));
  while (logs.length > 4) logs.shift();
}

console.log = (...a) => capture("●", a);
console.warn = (...a) => capture("⚠", a);
console.error = (...a) => capture("✖", a);

function center(text, width) {
  text = String(text);
  const pad = Math.max(0, Math.floor((width - text.length) / 2));
  return " ".repeat(pad) + text;
}

function heartbeat(width, phase) {
  const chars = ["_", "_", "_", "/", "‾", "\\", "_", "_", "_"];
  let line = "";
  const pulse = Math.max(8, Math.min(18, Math.floor(width / 7)));
  const pos = phase % Math.max(1, width);

  for (let i = 0; i < width; i++) {
    const d = i - pos;
    if (d >= -pulse && d <= pulse) {
      line += chars[Math.abs(d) % chars.length];
    } else {
      line += "─";
    }
  }
  return line;
}

function draw() {
  if (!active || !out.isTTY) return;

  const w = Math.max(35, Math.min(out.columns || 60, 100));
  const h = Math.max(18, out.rows || 30);
  const red = "\x1b[31m";
  const bright = "\x1b[91m";
  const gold = "\x1b[33m";
  const green = "\x1b[92m";
  const cyan = "\x1b[96m";
  const white = "\x1b[97m";
  const dim = "\x1b[90m";
  const reset = "\x1b[0m";

  const art = [
    "             .-=========-.",
    "          .-'  .-''''-.   '-.",
    "         /    /  .--.  \\     \\",
    "        |    |  /    \\  |     |",
    "        |    | |  **  | |     |",
    "         \\    \\ \\____/ /     /",
    "          '._  '------'  _.'",
    "             /|  /\\  |\\",
    "            / | /  \\ | \\",
    "           /__|/____\\|__\\",
    "             /  /  \\  \\",
    "            /__/    \\__\\",
    "           /__/      \\__\\"
  ];

  const lines = [];
  lines.push(center(gold + "👑  ZIAD ALKFORY  👑" + reset, w));
  lines.push("");
  lines.push(center(bright + "ＡＬＫＦＯＲＹ" + reset, w));
  lines.push(center(white + "BUILD  •  INNOVATE  •  INSPIRE" + reset, w));
  lines.push("");
  lines.push(center(red + "╔══════════════════════════════════╗" + reset, w));
  lines.push(center(red + "║" + reset + "       " + gold + "THE ALKFORY TERMINAL" + reset + "       " + red + "║" + reset, w));
  lines.push(center(red + "╚══════════════════════════════════╝" + reset, w));
  lines.push("");

  for (const row of art) {
    lines.push(center(bright + row + reset, w));
  }

  lines.push("");
  lines.push(center(bright + heartbeat(w - 4, frame * 2) + reset, w));
  lines.push(center(red + "♥  SYSTEM PULSE  ♥" + reset, w));
  lines.push("");
  lines.push(center(green + "✓ SERVER ONLINE" + reset, w));
  lines.push(center(cyan + "http://localhost:3000" + reset, w));
  lines.push(center(gold + "ALKFORY • FOREVER" + reset, w));
  lines.push("");

  const logHeight = Math.min(4, Math.max(2, h - lines.length - 2));
  lines.push(center(dim + "LIVE SERVER LOGS" + reset, w));
  for (const entry of logs.slice(-logHeight)) {
    lines.push(" " + entry.slice(0, w - 2));
  }

  while (lines.length < h - 1) lines.push("");
  out.write("\x1b[H" + lines.slice(0, h - 1).join("\n") + "\x1b[J");
  frame++;
}

if (out.isTTY) {
  out.write("\x1b[?1049h\x1b[?25l\x1b[2J");
  draw();
  const timer = setInterval(draw, 120);
  out.on("resize", draw);

  function restore() {
    if (!active) return;
    active = false;
    clearInterval(timer);
    out.removeListener("resize", draw);
    out.write("\x1b[?25h\x1b[?1049l");
    console.log = original.log;
    console.warn = original.warn;
    console.error = original.error;
  }

  process.once("SIGINT", () => {
    restore();
    process.exit(0);
  });
  process.once("exit", restore);
}

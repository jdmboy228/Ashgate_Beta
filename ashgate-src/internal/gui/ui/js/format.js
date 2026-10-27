// Formatting helpers. Pure functions: no DOM, no state, safe to unit-test.

const UNITS = ["Б", "КБ", "МБ", "ГБ", "ТБ"];

export function bytes(n) {
  n = Math.abs(Number(n) || 0);
  let i = 0;
  while (n >= 1024 && i < UNITS.length - 1) { n /= 1024; i++; }
  const text = i === 0 ? String(Math.round(n)) : n.toFixed(n >= 100 ? 0 : 1).replace(".", ",");
  return text + " " + UNITS[i];
}

export function rate(n) {
  return bytes(n) + "/с";
}

// plural picks the Russian word form for n: one (1, 21), few (2–4, 22–24), many.
export function plural(n, one, few, many) {
  n = Math.abs(Math.trunc(Number(n) || 0));
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export const words = {
  app: (n) => plural(n, "приложение", "приложения", "приложений"),
  flow: (n) => plural(n, "поток", "потока", "потоков"),
  rule: (n) => plural(n, "правило", "правила", "правил"),
  program: (n) => plural(n, "программа", "программы", "программ"),
};

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function unquote(process) {
  return String(process ?? "").trim().replace(/^"+|"+$/g, "");
}

export function baseName(process) {
  const s = unquote(process).replace(/\//g, "\\");
  const i = s.lastIndexOf("\\");
  return i >= 0 ? s.slice(i + 1) : s;
}

// appLabel is the name a person recognises: "Telegram" for any path,
// "Discord…" for a mask.
export function appLabel(process) {
  const parts = unquote(process).replace(/\//g, "\\").split("\\").filter(Boolean);
  // A mask such as *\Discord\*.exe has no name in its last part: borrow the folder.
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i].replace(/\.exe$/i, "");
    if (p.replace(/[*?]/g, "")) return p.replace(/\*/g, "…").replace(/\?/g, "·");
  }
  return unquote(process);
}

export function proxyTypeLabel(t) {
  if (t === "http") return "HTTP";
  if (t === "vless") return "VLESS";
  return "SOCKS5";
}

// buildText shows which exe is running: version · commit · date.
export function buildText(b) {
  b = b || {};
  let t = b.version || "";
  if (b.commit) t += " · " + b.commit;
  if (b.time) {
    const d = new Date(b.time);
    if (!Number.isNaN(d.getTime())) t += " · " + d.toLocaleDateString("ru-RU");
  }
  if (b.modified) t += " · с локальными правками";
  return t;
}

// dnsServer adds the default port to a bare IP: "1.1.1.1" -> "1.1.1.1:53".
export function dnsServer(s) {
  s = String(s || "").trim();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) return s + ":53";
  if (/^[0-9a-f]*:[0-9a-f:]*:[0-9a-f]*$/i.test(s) && !s.startsWith("[")) return "[" + s + "]:53";
  return s;
}

// glyphHue gives every app a stable colour for its letter tile when the exe
// icon is not available.
export function glyphHue(label) {
  let h = 0;
  for (const ch of String(label || "").toLowerCase()) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h % 360;
}

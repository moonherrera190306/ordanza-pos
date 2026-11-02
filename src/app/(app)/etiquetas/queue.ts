// Cola de etiquetas por equipo (localStorage).
const KEY = "ordz_labels";
export type LabelQ = { id: string; n: number }[];

export function readLabels(): LabelQ {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
export function writeLabels(q: LabelQ) {
  try { localStorage.setItem(KEY, JSON.stringify(q)); } catch {}
}
export function addToLabels(id: string, n = 1) {
  const q = readLabels();
  const l = q.find((x) => x.id === id);
  if (l) l.n += n; else q.push({ id, n });
  writeLabels(q);
  return q;
}

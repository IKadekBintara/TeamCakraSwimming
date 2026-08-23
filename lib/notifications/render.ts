/**
 * TEAM CAKRA SWIMMING — Template renderer.
 * Variable system: {{variable}} dengan fallback aman (tidak pernah "Hello undefined").
 */

export type Vars = Record<string, string | number | null | undefined>;

/** Render template: ganti {{var}} dengan nilai, fallback "(tidak tersedia)". */
export function renderTemplate(body: string, vars: Vars): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
    const v = vars[key];
    if (v === null || v === undefined) return "(tidak tersedia)";
    return String(v);
  });
}

/** Ekstrak daftar variable yang dipakai template. */
export function extractVariables(body: string): string[] {
  const out = new Set<string>();
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) out.add(m[1]);
  return Array.from(out);
}

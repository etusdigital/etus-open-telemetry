/** Monta um href com query string a partir de um mapa de params. */
export function buildHref(
  basePath: string,
  params: Record<string, string>,
): string {
  const qs = new URLSearchParams(params).toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

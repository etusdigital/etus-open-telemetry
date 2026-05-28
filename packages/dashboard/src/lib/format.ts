// Formatters para os charts. Sem locale-dependency confusa — só pt-BR.

export function formatInt(v: number): string {
  return v.toLocaleString('pt-BR');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;
  const TB = GB * 1024;
  if (bytes < MB) return `${(bytes / KB).toFixed(1)} KB`;
  if (bytes < GB) return `${(bytes / MB).toFixed(1)} MB`;
  if (bytes < TB) return `${(bytes / GB).toFixed(1)} GB`;
  return `${(bytes / TB).toFixed(1)} TB`;
}

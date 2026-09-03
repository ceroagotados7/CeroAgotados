// Validación del número de factura, espejo exacto de la regla de la API y de
// la DB (_normalizar_factura): 3-30 caracteres, empieza y termina en
// alfanumérico; guiones, barras, puntos y espacios permitidos en el medio.

export const FACTURA_REGEX = /^[A-Za-z0-9][A-Za-z0-9 ./-]{1,28}[A-Za-z0-9]$/;

/** Normaliza lo tecleado: recorta extremos y colapsa espacios internos. */
export function normalizarFactura(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function facturaValida(s: string): boolean {
  return FACTURA_REGEX.test(normalizarFactura(s));
}

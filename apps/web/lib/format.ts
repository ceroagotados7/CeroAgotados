/** Formatea un valor en pesos colombianos (COP) sin decimales. */
export function cop(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

/** Entero con separador de miles es-CO: 24149 → "24.149". */
export function miles(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(value);
}

/** Deja solo los dígitos de un texto: "1.250.000" / "$1,250,000" → "1250000". */
export function soloDigitos(s: string): string {
  return s.replace(/\D+/g, "");
}

/** Valor de un input numérico mientras se escribe: dígitos → "1.250.000" ("" si no hay). */
export function milesInput(s: string): string {
  const digits = soloDigitos(s);
  if (!digits) return "";
  return miles(Number(digits));
}

export const ESTADO_ORDEN_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  aceptada_parcial: "Aceptada parcial",
  aceptada_total: "Aceptada",
  rechazada: "Rechazada",
  despachada: "Despachada",
  completada: "Completada",
  cancelada: "Cancelada",
};

/** Tono de badge por estado de orden (design system).
 *  aceptada_parcial es ÁMBAR (no teal): hubo faltantes y la farmacia debe
 *  notarlo de un vistazo (feedback del fundador). */
export const ESTADO_ORDEN_TONE: Record<string, "green" | "teal" | "amber" | "red" | "gray"> = {
  pendiente: "amber",
  aceptada_parcial: "amber",
  aceptada_total: "green",
  despachada: "green",
  completada: "green",
  rechazada: "red",
  cancelada: "gray",
};

/** Tiempo relativo compacto en español: "hace 12 min", "hace 2 h", "ayer", fecha. */
export function hace(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const min = Math.floor((Date.now() - t) / 60000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ayer";
  if (d < 7) return `hace ${d} días`;
  return new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

/** Fecha y hora cortas para el timeline: "21 ago, 3:45 p. m.". */
export function fechaHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("es-CO", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Iniciales (hasta 2 letras) a partir de un nombre, para avatares. */
export function iniciales(nombre: string): string {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** Nombre del mes actual y del anterior (para el hero de ventas). */
export function mesActual(): string {
  return MESES[new Date().getMonth()];
}
export function mesAnterior(): string {
  return MESES[(new Date().getMonth() + 11) % 12];
}

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

/** Acota un valor al rango permitido. Vive aquí (y no en el componente) para
 *  poder probarla sola: es la regla que decide qué número queda en la casilla
 *  cuando el usuario sale del campo. */
export function acotar(n: number, min?: number, max?: number): number {
  let v = Number.isFinite(n) ? n : (min ?? 0);
  if (max != null && v > max) v = max;
  if (min != null && v < min) v = min;
  return v;
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

export type TonoBadge = "green" | "teal" | "amber" | "red" | "gray";

/** Etiqueta y tono de una orden, mirando TAMBIÉN el veredicto de recepción.
 *
 *  `estado` por sí solo no basta: la RPC `registrar_recepcion` deja la orden en
 *  'completada' tanto si la farmacia la recibió conforme como si la rechazó
 *  entera, así que el distribuidor veía el mismo badge verde "Completada" en
 *  los dos casos. Pasó en producción con ORD-0017 (petición del fundador:
 *  "debe haber un estado que permita entender muy rápidamente que ese pedido se
 *  completó, pero con novedades").
 *
 *  Es una etiqueta DERIVADA, no un estado nuevo en la base: `orden_estado` no
 *  cambia y ninguna RPC se toca. */
export function etiquetaOrden(
  estado: string,
  recepcion?: string | null,
): { label: string; tone: TonoBadge } {
  if (estado === "completada" && recepcion === "no_aceptada_parcial") {
    return { label: "Completada con novedades", tone: "amber" };
  }
  if (estado === "completada" && recepcion === "no_aceptada_total") {
    return { label: "Entrega rechazada", tone: "red" };
  }
  // Fallback explícito: la vista del proveedor indexaba los mapas a pelo y un
  // estado desconocido pintaba "undefined".
  return {
    label: ESTADO_ORDEN_LABEL[estado] ?? estado,
    tone: ESTADO_ORDEN_TONE[estado] ?? "gray",
  };
}

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

// Resumen de faltantes de un pedido para la farmacia (f6).
// Regla del fundador: una aceptación PARCIAL también significa que el proveedor
// no tenía — el faltante se puede pedir a otro proveedor sin rehacer el pedido.
// Lógica pura y testeable: la UI solo pinta lo que esto devuelve.

import { miles } from "./format";
import type { EstadoOrden, OrdenItem } from "./types";

export type Faltante = {
  itemId: string;
  productoId: string;
  nombre: string;
  /** sin_stock = rechazado (0 cajas); parcial = aceptó menos de lo pedido. */
  tipo: "sin_stock" | "parcial";
  pedidas: number;
  aceptadas: number;
  faltan: number;
};

/**
 * Ítems con faltante de una orden. Vacío para órdenes canceladas (los ítems
 * quedan "pendientes" con aceptada=0 y no son un faltante real) y para
 * pendientes (aún no hay decisión del proveedor).
 */
export function faltantesDeOrden(items: OrdenItem[], estado: EstadoOrden): Faltante[] {
  if (estado === "cancelada" || estado === "pendiente") return [];
  const out: Faltante[] = [];
  for (const i of items) {
    const pedidas = Math.max(0, i.cantidad_solicitada);
    // Datos corruptos no deben pintar "faltan -2": se acota a [0, pedidas].
    const aceptadas = Math.min(Math.max(0, i.cantidad_aceptada), pedidas);
    if (i.estado_item === "rechazado") {
      out.push({
        itemId: i.id,
        productoId: i.producto_maestro_id,
        nombre: i.producto?.nombre ?? "Producto",
        tipo: "sin_stock",
        pedidas,
        aceptadas: 0,
        faltan: pedidas,
      });
    } else if (i.estado_item === "aceptado" && aceptadas < pedidas) {
      out.push({
        itemId: i.id,
        productoId: i.producto_maestro_id,
        nombre: i.producto?.nombre ?? "Producto",
        tipo: "parcial",
        pedidas,
        aceptadas,
        faltan: pedidas - aceptadas,
      });
    }
  }
  return out;
}

/** "1 caja" / "5 cajas" / "1.200 cajas" — evita "faltan 1 cajas". */
export function cajas(n: number): string {
  return `${miles(n)} caja${n === 1 ? "" : "s"}`;
}

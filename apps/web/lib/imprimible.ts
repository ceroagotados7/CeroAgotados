// Valorización de la hoja imprimible del pedido (feedback de Edgar, punto #7):
// el papel que va a bodega debe cotejarse 1:1 contra la factura definitiva,
// renglón por renglón (cantidad × vr. unitario = subtotal).
//
// Regla: mientras el pedido está PENDIENTE (o fue cancelado) se valoriza lo
// SOLICITADO — es lo que hay que verificar en bodega. Una vez el proveedor lo
// gestionó, se valoriza lo ACEPTADO — que es exactamente lo que va a facturar
// (un ítem rechazado queda en 0 y no infla el total).

import { presentacionCompacta, tituloProducto } from "./producto";
import type { Orden } from "./types";

export type FilaImprimible = {
  itemId: string;
  nombre: string;
  presentacion: string;
  laboratorio: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
};

export type OrdenValorizada = {
  /** true cuando el proveedor ya decidió: se valoriza lo aceptado. */
  gestionada: boolean;
  filas: FilaImprimible[];
  total: number;
};

export function valorizarOrden(orden: Orden): OrdenValorizada {
  const gestionada = orden.estado !== "pendiente" && orden.estado !== "cancelada";
  const filas = orden.items.map((i) => {
    // Datos corruptos no deben valorizar de más: aceptada acotada a [0, pedida].
    const pedida = Math.max(0, i.cantidad_solicitada);
    const aceptada = Math.min(Math.max(0, i.cantidad_aceptada), pedida);
    const cantidad = gestionada ? aceptada : pedida;
    return {
      itemId: i.id,
      // Con concentración: la hoja se coteja contra la factura renglón por
      // renglón, y "Torrox" sin los mg no identifica el renglón.
      nombre: tituloProducto(i.producto ?? {}),
      // Forma abreviada ("Tabletas" → "Tab.") para que el renglón no se parta
      // en dos líneas en la hoja impresa (Tanda 6). El nombre y la
      // concentración van completos: ahí no se abrevia nada.
      presentacion: presentacionCompacta(i.producto ?? {}) || "—",
      laboratorio: i.producto?.laboratorio ?? "—",
      cantidad,
      precioUnitario: i.precio_unitario_snapshot,
      subtotal: cantidad * i.precio_unitario_snapshot,
    };
  });
  return {
    gestionada,
    filas,
    total: filas.reduce((acc, f) => acc + f.subtotal, 0),
  };
}

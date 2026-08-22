"use client";

import { cop, fechaHora } from "@/lib/format";
import type { Orden } from "@/lib/types";

/** Hoja imprimible del pedido: para llevar a bodega y verificar antes de
 *  aceptar/rechazar. Solo visible en la impresión (@media print). Se usa desde
 *  el detalle de la orden y directamente desde la bandeja de órdenes. */
export function OrdenImprimible({ orden }: { orden: Orden }) {
  const total = orden.items.reduce(
    (acc, i) => acc + i.cantidad_solicitada * i.precio_unitario_snapshot,
    0,
  );
  return (
    <div className="orden-print" aria-hidden>
      <style>{`
        .orden-print { display: none; }
        @media print {
          body * { visibility: hidden; }
          .orden-print, .orden-print * { visibility: visible; }
          .orden-print {
            display: block; position: absolute; left: 0; top: 0; width: 100%;
            padding: 28px; color: #000; background: #fff;
            font-family: Arial, Helvetica, sans-serif; font-size: 13px;
          }
          .orden-print table { width: 100%; border-collapse: collapse; margin-top: 14px; }
          .orden-print th, .orden-print td { border: 1px solid #999; padding: 7px 9px; text-align: left; }
          .orden-print th { background: #eee; font-size: 11px; text-transform: uppercase; }
          .orden-print .caja { display: inline-block; width: 13px; height: 13px; border: 1.5px solid #000; }
        }
      `}</style>
      <h1 style={{ fontSize: 19, margin: 0 }}>Pedido #{orden.codigo} — Cero Agotados</h1>
      <p style={{ margin: "6px 0 0" }}>
        Farmacia: <b>{orden.farmacia?.razon_social ?? "—"}</b>
        {orden.farmacia?.ciudad ? ` · ${orden.farmacia.ciudad}` : ""}
        {orden.farmacia?.nit ? ` · NIT ${orden.farmacia.nit}` : ""}
      </p>
      {orden.farmacia?.direccion && (
        <p style={{ margin: "2px 0 0" }}>
          Entregar en: <b>{orden.farmacia.direccion}</b>
        </p>
      )}
      <p style={{ margin: "2px 0 0" }}>Recibido: {fechaHora(orden.created_at)}</p>
      <table>
        <thead>
          <tr>
            <th style={{ width: 30 }}>OK</th>
            <th>Producto</th>
            <th>Presentación</th>
            <th style={{ width: 90 }}>Cajas pedidas</th>
            <th style={{ width: 110 }}>Cajas en bodega</th>
          </tr>
        </thead>
        <tbody>
          {orden.items.map((i) => (
            <tr key={i.id}>
              <td><span className="caja" /></td>
              <td>{i.producto?.nombre ?? "Producto"}</td>
              <td>
                {[i.producto?.forma_farmaceutica, i.producto?.presentacion].filter(Boolean).join(" · ") || "—"}
              </td>
              <td>{i.cantidad_solicitada}</td>
              <td />
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginTop: 12 }}>
        Total solicitado (referencia): <b>{cop(total)}</b>
      </p>
      <p style={{ marginTop: 6, fontSize: 11.5 }}>
        Verifica las cantidades en bodega y vuelve a Cero Agotados para aceptar, aceptar
        parcialmente o marcar sin stock cada ítem.
      </p>
    </div>
  );
}

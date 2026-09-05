"use client";

import { cop, fechaHora, miles } from "@/lib/format";
import { valorizarOrden } from "@/lib/imprimible";
import type { Orden } from "@/lib/types";

/** Hoja imprimible del pedido: para llevar a bodega y verificar antes de
 *  aceptar/rechazar, y para cotejar 1:1 contra la factura definitiva
 *  (valorizada renglón por renglón, feedback de Edgar). Solo visible en la
 *  impresión (@media print). Se usa desde el detalle de la orden y
 *  directamente desde la bandeja de órdenes. */
export function OrdenImprimible({ orden }: { orden: Orden }) {
  // Pendiente → lo solicitado (a verificar en bodega); gestionada → lo
  // aceptado (lo que se factura). Regla en lib/imprimible (testeada).
  const { gestionada, filas, total } = valorizarOrden(orden);
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
          .orden-print td.num, .orden-print th.num { text-align: right; }
          .orden-print .caja { display: inline-block; width: 13px; height: 13px; border: 1.5px solid #000; }
          .orden-print tfoot td { font-weight: bold; border-top: 2px solid #000; }
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
      {/* La factura enlazada al despacho (Grupo 4), cuando ya existe. */}
      {orden.factura_numero && (
        <p style={{ margin: "2px 0 0" }}>
          Factura de venta: <b>{orden.factura_numero}</b>
        </p>
      )}
      <table>
        <thead>
          <tr>
            {!gestionada && <th style={{ width: 30 }}>OK</th>}
            <th>Producto</th>
            <th>Presentación</th>
            <th>Laboratorio</th>
            <th className="num" style={{ width: 70 }}>
              {gestionada ? "Cajas" : "Cajas pedidas"}
            </th>
            <th className="num" style={{ width: 90 }}>Vr. unitario</th>
            <th className="num" style={{ width: 100 }}>Subtotal</th>
            {!gestionada && <th style={{ width: 90 }}>Cajas en bodega</th>}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.itemId}>
              {!gestionada && <td><span className="caja" /></td>}
              <td>{f.nombre}</td>
              <td>{f.presentacion}</td>
              <td>{f.laboratorio}</td>
              <td className="num">{miles(f.cantidad)}</td>
              <td className="num">{cop(f.precioUnitario)}</td>
              <td className="num">{cop(f.subtotal)}</td>
              {!gestionada && <td />}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={gestionada ? 5 : 6}>
              {gestionada ? "Total a facturar" : "Total solicitado (referencia)"}
            </td>
            <td className="num">{cop(total)}</td>
            {!gestionada && <td />}
          </tr>
        </tfoot>
      </table>
      <p style={{ marginTop: 6, fontSize: 11.5 }}>
        {gestionada
          ? "Cantidades y valores confirmados por el proveedor: deben coincidir renglón por renglón con la factura de venta."
          : "Verifica las cantidades en bodega y vuelve a Cero Agotados para aceptar, aceptar parcialmente o marcar sin stock cada ítem."}
      </p>
    </div>
  );
}

"use client";

import { cop, fechaHora, miles } from "@/lib/format";
import { valorizarOrden } from "@/lib/imprimible";
import type { Orden } from "@/lib/types";

/** Hoja imprimible del pedido: para llevar a bodega y verificar antes de
 *  aceptar/rechazar, y para cotejar 1:1 contra la factura definitiva
 *  (valorizada renglón por renglón, feedback de Edgar). Solo visible en la
 *  impresión (@media print). Se usa desde el detalle de la orden y
 *  directamente desde la bandeja de órdenes.
 *
 *  ---------------------------------------------------------------------------
 *  COMPACTADA (Tanda 6, 2026-09-11): "si es un pedido extenso, el imprimible no
 *  vaya a ser de muchas hojas".
 *
 *  El problema no era que sobraran datos, sino cuánto alto gastaba cada
 *  renglón. Con OCHO columnas (OK · Producto · Presentación · Laboratorio ·
 *  Cajas · Vr. unitario · Subtotal · Cajas en bodega), padding de 7px y fuente
 *  de 13px, las columnas de texto se estrechaban entre sí y se partían en
 *  varias líneas.
 *
 *  MEDIDO en el navegador con 30 productos reales de los que hoy se ofertan,
 *  sobre A4 con márgenes de 10mm (940px útiles para la tabla):
 *
 *    | maquetación                  | alto/renglón | filas/hoja | 30 ítems |
 *    |------------------------------|--------------|------------|----------|
 *    | la anterior                  |    61,8px    |     14     | 3 hojas  |
 *    | producto en dos líneas       |    37,4px    |     25     | 2 hojas  |
 *    | producto en UNA línea (esta) |    25,9px    |     36     | 1 hoja   |
 *
 *  Lo que lo consigue:
 *    1. Producto, presentación y laboratorio en UNA celda y UNA línea. De ocho
 *       columnas a seis. Es el cambio que más pesa, con diferencia.
 *    2. Fuente 10.5px, padding 2px, interlínea 1.2.
 *    3. `@page` con márgenes de 10mm en vez del padding de 28px del contenedor.
 *    4. Ningún renglón se parte entre hojas, y si hay segunda hoja el
 *       encabezado de la tabla se repite (si no, la página 2 es ilegible).
 *
 *  Lo que NO se abrevia: el nombre, la concentración y el laboratorio. En
 *  bodega, confundir 60 con 90 mg cuesta plata. Solo se abrevia la forma
 *  farmacéutica ("Tabletas" → "Tab."), en lib/producto. Y NADA se recorta: un
 *  producto largo envuelve a dos líneas, no se trunca — un papel que va a
 *  bodega no puede mentir sobre una dosis.
 *  ------------------------------------------------------------------------ */
export function OrdenImprimible({ orden }: { orden: Orden }) {
  // Pendiente → lo solicitado (a verificar en bodega); gestionada → lo
  // aceptado (lo que se factura). Regla en lib/imprimible (testeada).
  const { gestionada, filas, total } = valorizarOrden(orden);
  const cajas = filas.reduce((acc, f) => acc + f.cantidad, 0);
  return (
    <div className="orden-print" aria-hidden>
      <style>{`
        .orden-print { display: none; }
        @page { size: A4; margin: 10mm; }
        @media print {
          body * { visibility: hidden; }
          .orden-print, .orden-print * { visibility: visible; }
          .orden-print {
            display: block; position: absolute; left: 0; top: 0; width: 100%;
            color: #000; background: #fff;
            font-family: Arial, Helvetica, sans-serif; font-size: 10.5px;
            line-height: 1.2;
          }
          .orden-print h1 { font-size: 14px; margin: 0 0 2px; }
          .orden-print .cab { font-size: 10px; margin: 0; }
          .orden-print table {
            width: 100%; border-collapse: collapse; margin-top: 8px;
            table-layout: fixed;
          }
          .orden-print th, .orden-print td {
            border: 1px solid #999; padding: 2px 4px; text-align: left;
            vertical-align: top; overflow-wrap: anywhere;
          }
          .orden-print th { background: #eee; font-size: 9px; text-transform: uppercase; }
          .orden-print td.num, .orden-print th.num { text-align: right; }
          .orden-print .caja { display: inline-block; width: 10px; height: 10px; border: 1.2px solid #000; }
          .orden-print tfoot td { font-weight: bold; border-top: 2px solid #000; }
          /* Segunda línea del producto: presentación y laboratorio, más tenues
             pero legibles en papel (no gris claro, que se pierde al imprimir). */
          .orden-print .sub { font-size: 9px; color: #333; }
          /* Un renglón nunca se parte entre hojas... */
          .orden-print tr { page-break-inside: avoid; break-inside: avoid; }
          /* ...y si hay segunda hoja, repite el encabezado de la tabla. */
          .orden-print thead { display: table-header-group; }
          .orden-print tfoot { display: table-footer-group; }
        }
      `}</style>
      <h1>Pedido #{orden.codigo} — Cero Agotados</h1>
      <p className="cab">
        <b>{orden.farmacia?.razon_social ?? "—"}</b>
        {orden.farmacia?.ciudad ? ` · ${orden.farmacia.ciudad}` : ""}
        {orden.farmacia?.nit ? ` · NIT ${orden.farmacia.nit}` : ""}
        {orden.farmacia?.direccion ? ` · Entregar en: ${orden.farmacia.direccion}` : ""}
      </p>
      <p className="cab">
        Recibido: {fechaHora(orden.created_at)}
        {orden.factura_numero ? ` · Factura de venta: ${orden.factura_numero}` : ""}
        {` · ${filas.length} producto${filas.length !== 1 ? "s" : ""} · ${miles(cajas)} caja${cajas !== 1 ? "s" : ""}`}
      </p>
      <table>
        <thead>
          <tr>
            {!gestionada && <th style={{ width: "4%" }}>OK</th>}
            <th>Producto</th>
            <th className="num" style={{ width: "8%" }}>
              {gestionada ? "Cajas" : "Ped."}
            </th>
            <th className="num" style={{ width: "12%" }}>Vr. unit.</th>
            <th className="num" style={{ width: "14%" }}>Subtotal</th>
            {!gestionada && <th style={{ width: "11%" }}>Bodega</th>}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.itemId}>
              {!gestionada && <td><span className="caja" /></td>}
              {/* UNA sola línea, medido: el producto a dos renglones daba 25
                  filas por hoja (2 hojas para 30 productos); en una línea da 36
                  (1 hoja). Si un producto es muy largo, envuelve y ocupa dos
                  líneas — degrada solo, no se recorta nada. */}
              <td>
                {f.nombre}
                {(() => {
                  const detalle = [f.presentacion, f.laboratorio]
                    .filter((x) => x && x !== "—")
                    .join(" · ");
                  return detalle ? <span className="sub"> · {detalle}</span> : null;
                })()}
              </td>
              <td className="num">{miles(f.cantidad)}</td>
              <td className="num">{cop(f.precioUnitario)}</td>
              <td className="num">{cop(f.subtotal)}</td>
              {!gestionada && <td />}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={gestionada ? 3 : 4}>
              {gestionada ? "Total a facturar" : "Total solicitado (referencia)"}
            </td>
            <td className="num">{cop(total)}</td>
            {!gestionada && <td />}
          </tr>
        </tfoot>
      </table>
      <p className="cab" style={{ marginTop: 5 }}>
        {gestionada
          ? "Cantidades y valores confirmados por el proveedor: deben coincidir renglón por renglón con la factura de venta."
          : "Verifica las cantidades en bodega y vuelve a Cero Agotados para aceptar, aceptar parcialmente o marcar sin stock cada ítem."}
      </p>
    </div>
  );
}

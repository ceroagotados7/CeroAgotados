"use client";

import { Card } from "@/components/ui";
import { cop, fechaHora } from "@/lib/format";
import type { OrdenEvento } from "@/lib/types";

// Etiquetas neutras (la misma vista sirve a farmacia y proveedor).
const EVENTO_LABEL: Record<string, string> = {
  creada: "Pedido creado",
  aceptada_total: "Aceptado por completo",
  aceptada_parcial: "Aceptado parcialmente",
  rechazada: "Rechazado",
  despachada: "Despachado",
  completada: "Entrega confirmada",
  cancelada: "Cancelado",
  factura_corregida: "Factura corregida",
  // Tanda 5. Sin esta entrada el timeline pintaba el tipo crudo ("no_aceptada"):
  // cualquier evento nuevo hay que nombrarlo también aquí.
  no_aceptada: "Entrega rechazada",
};

/** Timeline de estados de una orden con timestamp por transición.
 *  `facturaNumero` anexa el número al hito de despacho y `valorNoAceptado` el
 *  importe al del rechazo: el historial es el sitio donde los dos roles miran
 *  qué pasó, y hasta ahora decía qué ocurrió pero nunca cuánto dinero movió. */
export function OrdenTimeline({
  eventos,
  facturaNumero,
  valorNoAceptado,
}: {
  eventos?: OrdenEvento[];
  facturaNumero?: string | null;
  valorNoAceptado?: number;
}) {
  if (!eventos || eventos.length === 0) return null;
  return (
    <>
      <p className="mb-2 px-1 text-[12px] font-semibold text-muted">SEGUIMIENTO</p>
      <Card className="mb-3 p-4">
        <ol>
          {eventos.map((e, idx) => {
            const ultimo = idx === eventos.length - 1;
            return (
              <li key={`${e.tipo}-${e.created_at}`} className="relative flex gap-3 pb-4 last:pb-0">
                {!ultimo && (
                  <span className="absolute left-[5px] top-[14px] h-full w-px bg-line" aria-hidden />
                )}
                <span
                  className={`mt-[3px] h-[11px] w-[11px] flex-none rounded-full ${
                    ultimo ? "bg-primary ring-4 ring-primary-50" : "bg-line"
                  }`}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className={`text-[13px] leading-tight ${ultimo ? "font-semibold" : "text-soft"}`}>
                    {EVENTO_LABEL[e.tipo] ?? e.tipo}
                    {e.tipo === "despachada" && facturaNumero && (
                      <span className="text-muted"> · Factura {facturaNumero}</span>
                    )}
                    {e.tipo === "no_aceptada" && !!valorNoAceptado && valorNoAceptado > 0 && (
                      <span className="text-muted"> · {cop(valorNoAceptado)} devueltos</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-muted">{fechaHora(e.created_at)}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>
    </>
  );
}

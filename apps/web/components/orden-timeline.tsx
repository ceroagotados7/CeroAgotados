"use client";

import { Card } from "@/components/ui";
import { fechaHora } from "@/lib/format";
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
};

/** Timeline de estados de una orden con timestamp por transición. */
export function OrdenTimeline({ eventos }: { eventos?: OrdenEvento[] }) {
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

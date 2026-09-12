"use client";

// Registro de "no acepté este pedido" (Tanda 5, petición del fundador).
//
// Se abre desde el detalle del pedido cuando está despachado. La farmacia elige
// si no aceptó NADA o solo una parte, y puede dejar un comentario — opcional a
// propósito: "no es obligatorio el comentario".
//
// Dos avisos que la pantalla deja claros antes de confirmar, porque son las
// reglas que el fundador fijó y sorprenderían si no se dijeran:
//   · queda EN FIRME (no se puede editar después, como la factura);
//   · el distribuidor lo va a ver.

import { AlertTriangle, Minus, Plus, X } from "lucide-react";
import { useState } from "react";

import { InputMiles } from "@/components/input-miles";
import { IdentidadProducto } from "@/components/producto-identidad";
import { Button, Card } from "@/components/ui";
import { cop, miles } from "@/lib/format";
import type { OrdenItem } from "@/lib/types";

const MAX_COMENTARIO = 500;

type Alcance = "no_aceptada_total" | "no_aceptada_parcial";

export function RecepcionNoAceptada({
  items,
  guardando,
  error,
  onCancelar,
  onConfirmar,
}: {
  items: OrdenItem[];
  guardando: boolean;
  error: string | null;
  onCancelar: () => void;
  onConfirmar: (payload: {
    alcance: Alcance;
    items: { item_id: string; cantidad: number }[];
    comentario: string | null;
  }) => void;
}) {
  // Solo se puede rechazar lo que el proveedor efectivamente despachó.
  const despachados = items.filter((i) => i.cantidad_aceptada > 0);
  const [alcance, setAlcance] = useState<Alcance>("no_aceptada_total");
  const [porItem, setPorItem] = useState<Record<string, number>>({});
  const [comentario, setComentario] = useState("");

  const seleccionados = despachados.filter((i) => (porItem[i.id] ?? 0) > 0);
  const cajas =
    alcance === "no_aceptada_total"
      ? despachados.reduce((a, i) => a + i.cantidad_aceptada, 0)
      : seleccionados.reduce((a, i) => a + (porItem[i.id] ?? 0), 0);
  const valor =
    alcance === "no_aceptada_total"
      ? despachados.reduce((a, i) => a + i.cantidad_aceptada * i.precio_unitario_snapshot, 0)
      : seleccionados.reduce((a, i) => a + (porItem[i.id] ?? 0) * i.precio_unitario_snapshot, 0);

  const listo = alcance === "no_aceptada_total" || seleccionados.length > 0;

  function confirmar() {
    if (!listo || guardando) return;
    onConfirmar({
      alcance,
      items:
        alcance === "no_aceptada_parcial"
          ? seleccionados.map((i) => ({ item_id: i.id, cantidad: porItem[i.id] }))
          : [],
      comentario: comentario.trim() || null,
    });
  }

  return (
    <Card className="border border-amber-300 bg-amber-50/40 p-4">
      <div className="mb-3 flex items-start gap-2.5">
        <AlertTriangle size={18} className="mt-0.5 flex-none text-amber-700" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-[15.5px] font-bold leading-tight">
            ¿Qué no aceptaste de este pedido?
          </p>
          <p className="mt-1 text-[12.5px] text-muted">
            Quedará <b>en firme</b> y el proveedor lo verá.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancelar}
          aria-label="Cerrar"
          className="flex-none text-muted transition hover:text-ink"
        >
          <X size={18} />
        </button>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setAlcance("no_aceptada_total")}
          className={`chip justify-center ${alcance === "no_aceptada_total" ? "chip-active" : ""}`}
        >
          No acepté nada
        </button>
        <button
          type="button"
          onClick={() => setAlcance("no_aceptada_parcial")}
          className={`chip justify-center ${alcance === "no_aceptada_parcial" ? "chip-active" : ""}`}
          disabled={despachados.length === 0}
        >
          Solo una parte
        </button>
      </div>

      {alcance === "no_aceptada_parcial" && (
        <div className="mb-3 space-y-2">
          {despachados.map((i) => {
            const n = porItem[i.id] ?? 0;
            return (
              <div key={i.id} className="rounded-xl border border-line bg-surface p-3">
                <IdentidadProducto producto={i.producto} size="sm" mostrarMolecula={false} />
                <p className="mt-1 text-[12px] text-muted">
                  Te despacharon {miles(i.cantidad_aceptada)} caja
                  {i.cantidad_aceptada !== 1 && "s"}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="flex-none text-[12px] text-muted">No acepté</span>
                  <button
                    type="button"
                    className="chip !px-2.5"
                    aria-label={`Una caja menos de ${i.producto?.nombre ?? "producto"}`}
                    disabled={n <= 0}
                    onClick={() => setPorItem((s) => ({ ...s, [i.id]: Math.max(0, n - 1) }))}
                  >
                    <Minus size={14} />
                  </button>
                  <InputMiles
                    value={n > 0 ? String(n) : ""}
                    onChange={(d) => setPorItem((s) => ({ ...s, [i.id]: Number(d) }))}
                    min={0}
                    max={i.cantidad_aceptada}
                    className="input w-[64px] flex-none py-2 text-center font-semibold"
                    aria-label={`Cajas no aceptadas de ${i.producto?.nombre ?? "producto"}`}
                  />
                  <button
                    type="button"
                    className="chip !px-2.5"
                    aria-label={`Una caja más de ${i.producto?.nombre ?? "producto"}`}
                    disabled={n >= i.cantidad_aceptada}
                    onClick={() =>
                      setPorItem((s) => ({ ...s, [i.id]: Math.min(i.cantidad_aceptada, n + 1) }))
                    }
                  >
                    <Plus size={14} />
                  </button>
                  <span className="min-w-0 text-[12px] text-muted">
                    de {miles(i.cantidad_aceptada)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <label className="label" htmlFor="comentario-no-aceptada">
        ¿Por qué? <span className="font-normal text-muted">(opcional)</span>
      </label>
      <textarea
        id="comentario-no-aceptada"
        value={comentario}
        onChange={(e) => setComentario(e.target.value.slice(0, MAX_COMENTARIO))}
        maxLength={MAX_COMENTARIO}
        rows={2}
        placeholder="Ej: llegaron 3 cajas con el empaque roto"
        className="input h-auto w-full resize-none py-2.5"
      />
      <p className="mt-1 text-right text-[11px] text-muted">
        {comentario.length}/{MAX_COMENTARIO}
      </p>

      {cajas > 0 && (
        <p className="mt-2 text-[12.5px] text-amber-800">
          Vas a marcar <b>{miles(cajas)} caja{cajas !== 1 && "s"}</b> como no aceptadas
          {valor > 0 && <> · {cop(valor)}</>}
        </p>
      )}

      {error && <p className="mt-2 text-center text-[12.5px] text-danger">{error}</p>}

      <div className="mt-3 flex gap-2">
        <Button variant="outline" size="md" className="flex-1" onClick={onCancelar} disabled={guardando}>
          Volver
        </Button>
        <Button
          variant="dark"
          size="md"
          className="flex-1"
          onClick={confirmar}
          disabled={!listo || guardando}
        >
          {guardando ? "Registrando…" : "Registrar"}
        </Button>
      </div>
    </Card>
  );
}

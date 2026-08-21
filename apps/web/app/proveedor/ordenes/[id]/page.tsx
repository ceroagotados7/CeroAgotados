"use client";

import { AlertTriangle, Check, CheckCheck, Info, MessageCircle, Minus, Pill, Plus, Printer, Truck, X } from "lucide-react";
import { use, useCallback, useEffect, useMemo, useState } from "react";

import { OrdenImprimible } from "@/components/orden-imprimible";
import { OrdenTimeline } from "@/components/orden-timeline";
import { BackBar } from "@/components/shell";
import { Avatar, Badge, Button, Card, IconButton, Spinner } from "@/components/ui";
import { api, ApiCallError } from "@/lib/api";
import { cop, ESTADO_ORDEN_LABEL, ESTADO_ORDEN_TONE, hace, iniciales } from "@/lib/format";
import type { ItemDecision, Oferta, Orden, OrdenItem } from "@/lib/types";

export default function OrdenDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [orden, setOrden] = useState<Orden | null>(null);
  const [stockPorProducto, setStockPorProducto] = useState<Record<string, number>>({});
  // Cantidad a aceptar por ítem (0 = sin stock). Permite aceptación PARCIAL
  // por cantidad, no solo todo-o-nada por ítem.
  const [acepta, setAcepta] = useState<Record<string, number>>({});
  // Paso de confirmación: resumen de consecuencias ANTES de aplicar (p6).
  const [confirmando, setConfirmando] = useState<null | "aceptar" | "rechazar">(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const o = await api.get<Orden>(`/ordenes/${id}`);
    setOrden(o);
    return o;
  }, [id]);

  useEffect(() => {
    let active = true;
    Promise.all([api.get<Orden>(`/ordenes/${id}`), api.get<Oferta[]>("/ofertas/")])
      .then(([o, ofertas]) => {
        if (!active) return;
        const stock: Record<string, number> = {};
        for (const of of ofertas) stock[of.producto_maestro_id] = of.stock_disponible;
        setStockPorProducto(stock);
        setOrden(o);
        // Por defecto se acepta TODO lo solicitado: el pedido ya reservó ese
        // stock al crearse (el stock en vivo que se muestra es lo que queda
        // FUERA de esta orden, solo informativo).
        setAcepta(Object.fromEntries(o.items.map((it) => [it.id, it.cantidad_solicitada])));
      })
      .catch(() => active && setError("No se pudo cargar la orden."));
    return () => {
      active = false;
    };
  }, [id]);

  // Se revisa una sola vez (mientras está pendiente); tras confirmar pasa a
  // preparación (aceptada_parcial/total) → vista de lectura + despachar.
  const editable = orden?.estado === "pendiente";

  const resumen = useMemo(() => {
    if (!orden) return { solicitado: 0, aDespachar: 0, disponibles: 0, completos: 0, parciales: 0, sinStock: 0 };
    let solicitado = 0;
    let aDespachar = 0;
    let disponibles = 0;
    let completos = 0;
    let parciales = 0;
    let sinStock = 0;
    for (const it of orden.items) {
      solicitado += it.cantidad_solicitada * it.precio_unitario_snapshot;
      const cant = acepta[it.id] ?? 0;
      if (cant > 0) {
        aDespachar += cant * it.precio_unitario_snapshot;
        disponibles += 1;
        if (cant >= it.cantidad_solicitada) completos += 1;
        else parciales += 1;
      } else {
        sinStock += 1;
      }
    }
    return { solicitado, aDespachar, disponibles, completos, parciales, sinStock };
  }, [orden, acepta]);

  if (error && !orden) return <p className="px-5 pt-4 text-danger">{error}</p>;
  if (!orden) return <Spinner />;

  async function confirmar(rechazarTodo: boolean) {
    setBusy(true);
    setError(null);
    try {
      const decisiones: ItemDecision[] = orden!.items.map((it) => {
        const cantidad = rechazarTodo ? 0 : (acepta[it.id] ?? 0);
        return {
          item_id: it.id,
          estado: cantidad > 0 ? "aceptado" : "rechazado",
          cantidad_aceptada: cantidad,
          // El chip "Sin stock" declara agotado REAL → la plataforma pone la
          // oferta en 0 (regla del fundador). Rechazar la orden completa es un
          // rechazo genérico: el stock reservado se devuelve.
          motivo: !rechazarTodo && cantidad === 0 ? "sin_stock" : null,
        };
      });
      await api.post(`/ordenes/${id}/aceptar`, { decisiones });
      setConfirmando(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiCallError ? e.message : "No se pudo confirmar la orden.");
    } finally {
      setBusy(false);
    }
  }

  /** Botón principal: si hay parciales o sin stock, primero muestra el resumen. */
  function intentarConfirmar() {
    if (resumen.parciales > 0 || resumen.sinStock > 0) setConfirmando("aceptar");
    else void confirmar(false);
  }

  async function despachar() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/ordenes/${id}/despachar`);
      await load();
    } catch (e) {
      setError(e instanceof ApiCallError ? e.message : "No se pudo despachar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <BackBar
        title="Revisar pedido"
        subtitle={`Orden #${orden.codigo} · ${hace(orden.created_at)}`}
        backHref="/proveedor/ordenes"
      />

      <div className="px-5 pb-56 pt-1">
        {/* Farmacia */}
        <Card className="mb-3 flex items-center gap-3 p-3.5">
          <Avatar className="h-10 w-10 bg-teal-600 text-[13px]">{iniciales(orden.farmacia?.razon_social ?? "F")}</Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold leading-none">{orden.farmacia?.razon_social ?? "Farmacia"}</p>
            <p className="mt-1 truncate text-[12px] text-muted">
              {[orden.farmacia?.ciudad, orden.farmacia?.nit && `NIT ${orden.farmacia.nit}`].filter(Boolean).join(" · ")}
            </p>
          </div>
          <IconButton aria-label="Mensaje" className="flex-none">
            <MessageCircle size={18} />
          </IconButton>
        </Card>

        {editable ? (
          <>
            {/* Imprimir ANTES de decidir: llevar el papel a bodega, verificar
                y volver con la información validada (flujo del fundador). */}
            <Button variant="outline" size="md" block className="mb-3" onClick={() => window.print()}>
              <Printer size={16} /> Imprimir pedido para revisar en bodega
            </Button>

            <div className="mb-2 flex items-center gap-1.5 px-1 text-[12px] text-muted">
              <Info size={14} /> Elige por ítem: todo, una parte, o márcalo sin stock.
            </div>
            <div className="space-y-2.5">
              {orden.items.map((it) => (
                <ItemEditable
                  key={it.id}
                  item={it}
                  stock={stockPorProducto[it.producto_maestro_id] ?? 0}
                  cantidad={acepta[it.id] ?? 0}
                  onChange={(v) => {
                    setConfirmando(null);
                    setAcepta((d) => ({ ...d, [it.id]: v }));
                  }}
                />
              ))}
            </div>

            {/* Resumen vivo */}
            <Card className="mt-3 p-4">
              <div className="mb-1.5 flex items-center justify-between text-[13px]">
                <span className="text-muted">Solicitado ({orden.items.length} ítems)</span>
                <span className={resumen.aDespachar < resumen.solicitado ? "text-muted line-through" : "text-muted"}>
                  {cop(resumen.solicitado)}
                </span>
              </div>
              <div className="mb-2 flex items-center justify-between text-[13px]">
                <span className="text-soft">A despachar ({resumen.disponibles} ítems)</span>
                <span className="font-semibold">{cop(resumen.aDespachar)}</span>
              </div>
              <div className="divider mb-2" />
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-semibold">Total a confirmar</span>
                <span className="font-display text-[20px] font-extrabold text-primary-800">{cop(resumen.aDespachar)}</span>
              </div>
            </Card>
          </>
        ) : (
          <ResumenLectura orden={orden} />
        )}

        {/* Seguimiento: cada estado con su fecha y hora. */}
        <div className="mt-3">
          <OrdenTimeline eventos={orden.eventos} />
        </div>

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </div>

      {/* Acciones sticky */}
      <div
        className="fixed bottom-20 left-1/2 z-20 w-full max-w-[430px] -translate-x-1/2 space-y-2.5 border-t border-line bg-surface px-5 py-3.5"
        style={{ boxShadow: "0 -6px 20px rgba(15,23,42,.05)" }}
      >
        {editable ? (
          confirmando ? (
            <ResumenConfirmacion
              modo={confirmando}
              resumen={resumen}
              busy={busy}
              onConfirmar={() => void confirmar(confirmando === "rechazar")}
              onVolver={() => setConfirmando(null)}
            />
          ) : (
            <>
              <Button size="lg" block disabled={busy || resumen.disponibles === 0} onClick={intentarConfirmar}>
                <CheckCheck size={18} /> {busy ? "Confirmando…" : `Confirmar ${resumen.disponibles} disponibles · ${cop(resumen.aDespachar)}`}
              </Button>
              <Button variant="outline" size="md" block className="text-danger" disabled={busy} onClick={() => setConfirmando("rechazar")}>
                Rechazar orden completa
              </Button>
            </>
          )
        ) : orden.estado === "aceptada_total" || orden.estado === "aceptada_parcial" ? (
          <Button variant="teal" size="lg" block disabled={busy} onClick={despachar}>
            <Truck size={18} /> {busy ? "Despachando…" : "Marcar como despachada"}
          </Button>
        ) : (
          <div className="flex items-center justify-center gap-2 py-1 text-[13px] text-muted">
            <Badge tone={ESTADO_ORDEN_TONE[orden.estado]}>{ESTADO_ORDEN_LABEL[orden.estado]}</Badge>
            <span>Total {cop(orden.total)}</span>
          </div>
        )}
      </div>

      {/* Versión imprimible (solo visible al imprimir). */}
      <OrdenImprimible orden={orden} />
    </>
  );
}

/** Resumen de consecuencias antes de aplicar la decisión (dos pasos, p6). */
function ResumenConfirmacion({
  modo,
  resumen,
  busy,
  onConfirmar,
  onVolver,
}: {
  modo: "aceptar" | "rechazar";
  resumen: { aDespachar: number; completos: number; parciales: number; sinStock: number };
  busy: boolean;
  onConfirmar: () => void;
  onVolver: () => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[13.5px] font-semibold">
        {modo === "rechazar" ? "¿Rechazar la orden completa?" : "Revisa tu decisión"}
      </p>
      {modo === "rechazar" ? (
        <p className="mb-2.5 text-[12.5px] text-muted">
          No se despachará ningún ítem y la farmacia podrá pedirlos a otro proveedor. Tu stock
          reservado se libera.
        </p>
      ) : (
        <ul className="mb-2.5 space-y-1 text-[12.5px]">
          {resumen.completos > 0 && (
            <li className="flex items-center gap-1.5 text-soft">
              <Check size={14} className="flex-none text-primary" />
              {resumen.completos} ítem{resumen.completos !== 1 && "s"} completo{resumen.completos !== 1 && "s"}
            </li>
          )}
          {resumen.parciales > 0 && (
            <li className="flex items-center gap-1.5 text-amber-700">
              <Minus size={14} className="flex-none" />
              {resumen.parciales} parcial{resumen.parciales !== 1 && "es"} (menos cajas de las pedidas)
            </li>
          )}
          {resumen.sinStock > 0 && (
            <li className="flex items-start gap-1.5 text-danger">
              <AlertTriangle size={14} className="mt-0.5 flex-none" />
              <span>
                {resumen.sinStock} sin stock: esa{resumen.sinStock !== 1 ? "s ofertas quedarán" : " oferta quedará"} en <b>stock 0</b> y
                dejará{resumen.sinStock !== 1 && "n"} de mostrarse a las farmacias.
              </span>
            </li>
          )}
        </ul>
      )}
      <div className="flex gap-2.5">
        <Button variant="outline" size="md" block className="flex-1" disabled={busy} onClick={onVolver}>
          Volver a revisar
        </Button>
        <Button
          size="md"
          block
          className={`flex-1 ${modo === "rechazar" ? "!bg-danger" : ""}`}
          disabled={busy}
          onClick={onConfirmar}
        >
          {busy ? "Aplicando…" : modo === "rechazar" ? "Rechazar orden" : `Confirmar · ${cop(resumen.aDespachar)}`}
        </Button>
      </div>
    </div>
  );
}

function ItemEditable({
  item,
  stock,
  cantidad,
  onChange,
}: {
  item: OrdenItem;
  stock: number;
  cantidad: number;
  onChange: (v: number) => void;
}) {
  const disponible = cantidad > 0;
  const parcial = disponible && cantidad < item.cantidad_solicitada;
  const maximo = item.cantidad_solicitada; // el proveedor decide hasta lo solicitado
  const subtotal = cantidad * item.precio_unitario_snapshot;
  return (
    <Card className={`p-3.5 ${!disponible ? "border border-danger-100 bg-danger-50/40" : ""}`}>
      <div className="flex items-start gap-3">
        <span
          className={`flex h-10 w-10 flex-none items-center justify-center rounded-lg ${
            disponible ? "bg-primary-50 text-primary-700" : "bg-danger-50 text-danger"
          }`}
        >
          <Pill size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold leading-tight">{item.producto?.nombre ?? "Producto"}</p>
          <p className={`mt-0.5 text-[12px] ${disponible ? "text-muted" : "text-danger/90"}`}>
            Pide {item.cantidad_solicitada} cajas × {cop(item.precio_unitario_snapshot)} · stock restante:{" "}
            <b className={disponible ? "text-primary-700" : ""}>{stock}</b>
          </p>
        </div>
        <p className={`font-display text-[14px] font-bold ${disponible ? "" : "text-muted line-through"}`}>
          {cop(disponible ? subtotal : item.cantidad_solicitada * item.precio_unitario_snapshot)}
        </p>
      </div>

      <div className={`mt-3 flex gap-2 border-t pt-3 ${disponible ? "border-line" : "border-danger-100"}`}>
        <button
          onClick={() => onChange(maximo)}
          className={`chip flex-1 justify-center ${disponible && !parcial ? "chip-active" : ""}`}
        >
          <Check size={14} /> Todo ({maximo})
        </button>
        <button
          onClick={() => onChange(Math.max(1, Math.min(cantidad || maximo, maximo - 1)))}
          className={`chip flex-1 justify-center ${parcial ? "chip-active" : ""}`}
          disabled={maximo <= 1}
        >
          <Minus size={14} /> Parcial
        </button>
        <button
          onClick={() => onChange(0)}
          className={`chip flex-1 justify-center ${!disponible ? "!border-danger !bg-danger !text-white" : ""}`}
        >
          {!disponible && <X size={14} />} Sin stock
        </button>
      </div>

      {/* Aceptación PARCIAL: stepper claro de cuántas cajas despacha. */}
      {disponible && (
        <div className="mt-2.5 flex items-center gap-2">
          <span className="flex-none text-[12px] text-muted">Cajas a despachar</span>
          <div className="flex flex-none items-center gap-1">
            <button
              type="button"
              className="chip !px-2.5"
              aria-label="Una caja menos"
              disabled={cantidad <= 1}
              onClick={() => onChange(Math.max(1, cantidad - 1))}
            >
              <Minus size={14} />
            </button>
            <input
              id={`cant-${item.id}`}
              type="number"
              min={1}
              max={maximo}
              value={cantidad}
              onChange={(e) => onChange(Math.max(1, Math.min(Number(e.target.value) || 1, maximo)))}
              className="input w-[64px] flex-none py-2 text-center font-semibold"
              aria-label={`Cajas a despachar de ${item.producto?.nombre ?? "producto"}`}
            />
            <button
              type="button"
              className="chip !px-2.5"
              aria-label="Una caja más"
              disabled={cantidad >= maximo}
              onClick={() => onChange(Math.min(maximo, cantidad + 1))}
            >
              <Plus size={14} />
            </button>
          </div>
          <span className={`min-w-0 text-[12px] ${parcial ? "font-semibold text-amber-600" : "text-muted"}`}>
            de {item.cantidad_solicitada}{parcial && " · parcial"}
          </span>
        </div>
      )}
      {!disponible && (
        <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-danger">
          <Info size={13} /> Tu oferta quedará en stock 0 y la farmacia podrá pedirlo a otro proveedor.
        </p>
      )}
    </Card>
  );
}

function ResumenLectura({ orden }: { orden: Orden }) {
  return (
    <div className="space-y-2.5">
      {orden.items.map((it) => {
        const aceptado = it.estado_item === "aceptado";
        return (
          <Card key={it.id} className="p-3.5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                <Pill size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold leading-tight">{it.producto?.nombre ?? "Producto"}</p>
                <p className="mt-0.5 text-[12px] text-muted">
                  {aceptado ? `${it.cantidad_aceptada} cajas` : "No despachado"} × {cop(it.precio_unitario_snapshot)}
                </p>
              </div>
              <Badge tone={it.estado_item === "rechazado" ? "red" : aceptado ? "green" : "gray"}>
                {it.estado_item === "rechazado" ? "Sin stock" : aceptado ? "Aceptado" : "—"}
              </Badge>
            </div>
          </Card>
        );
      })}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-[14px] font-semibold">Total confirmado</span>
          <span className="font-display text-[20px] font-extrabold text-primary-800">{cop(orden.total)}</span>
        </div>
      </Card>
    </div>
  );
}

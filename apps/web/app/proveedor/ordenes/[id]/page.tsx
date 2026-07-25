"use client";

import { Check, CheckCheck, Info, MessageCircle, Pill, Truck, X } from "lucide-react";
import { use, useCallback, useEffect, useMemo, useState } from "react";

import { BackBar } from "@/components/shell";
import { Avatar, Badge, Button, Card, IconButton, Spinner } from "@/components/ui";
import { api, ApiCallError } from "@/lib/api";
import { cop, ESTADO_ORDEN_LABEL, ESTADO_ORDEN_TONE, hace, iniciales } from "@/lib/format";
import type { ItemDecision, Oferta, Orden, OrdenItem } from "@/lib/types";

export default function OrdenDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [orden, setOrden] = useState<Orden | null>(null);
  const [stockPorProducto, setStockPorProducto] = useState<Record<string, number>>({});
  const [disp, setDisp] = useState<Record<string, boolean>>({});
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
        // Disponibilidad por defecto: hay stock suficiente para lo solicitado.
        setDisp(
          Object.fromEntries(
            o.items.map((it) => [it.id, (stock[it.producto_maestro_id] ?? 0) >= it.cantidad_solicitada]),
          ),
        );
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
    if (!orden) return { solicitado: 0, aDespachar: 0, disponibles: 0 };
    let solicitado = 0;
    let aDespachar = 0;
    let disponibles = 0;
    for (const it of orden.items) {
      const sub = it.cantidad_solicitada * it.precio_unitario_snapshot;
      solicitado += sub;
      if (disp[it.id]) {
        aDespachar += sub;
        disponibles += 1;
      }
    }
    return { solicitado, aDespachar, disponibles };
  }, [orden, disp]);

  if (error) return <p className="px-5 pt-4 text-danger">{error}</p>;
  if (!orden) return <Spinner />;

  async function confirmar(rechazarTodo = false) {
    setBusy(true);
    setError(null);
    try {
      const decisiones: ItemDecision[] = orden!.items.map((it) => {
        const disponible = !rechazarTodo && disp[it.id];
        return {
          item_id: it.id,
          estado: disponible ? "aceptado" : "rechazado",
          cantidad_aceptada: disponible ? it.cantidad_solicitada : 0,
        };
      });
      await api.post(`/ordenes/${id}/aceptar`, { decisiones });
      await load();
    } catch (e) {
      setError(e instanceof ApiCallError ? e.message : "No se pudo confirmar la orden.");
    } finally {
      setBusy(false);
    }
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

      <div className="px-5 pb-36 pt-1">
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
            <div className="mb-2 flex items-center gap-1.5 px-1 text-[12px] text-muted">
              <Info size={14} /> Confirma la disponibilidad de cada ítem.
            </div>
            <div className="space-y-2.5">
              {orden.items.map((it) => (
                <ItemEditable
                  key={it.id}
                  item={it}
                  stock={stockPorProducto[it.producto_maestro_id] ?? 0}
                  disponible={disp[it.id] ?? false}
                  onChange={(v) => setDisp((d) => ({ ...d, [it.id]: v }))}
                />
              ))}
            </div>

            {/* Resumen */}
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

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </div>

      {/* Acciones sticky */}
      <div
        className="fixed bottom-0 left-1/2 z-20 w-full max-w-[430px] -translate-x-1/2 space-y-2.5 border-t border-line bg-surface px-5 py-3.5"
        style={{ boxShadow: "0 -6px 20px rgba(15,23,42,.05)" }}
      >
        {editable ? (
          <>
            <Button size="lg" block disabled={busy || resumen.disponibles === 0} onClick={() => confirmar(false)}>
              <CheckCheck size={18} /> {busy ? "Confirmando…" : `Confirmar ${resumen.disponibles} disponibles · ${cop(resumen.aDespachar)}`}
            </Button>
            <Button variant="outline" size="md" block className="text-danger" disabled={busy} onClick={() => confirmar(true)}>
              Rechazar orden completa
            </Button>
          </>
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
    </>
  );
}

function ItemEditable({
  item,
  stock,
  disponible,
  onChange,
}: {
  item: OrdenItem;
  stock: number;
  disponible: boolean;
  onChange: (v: boolean) => void;
}) {
  const subtotal = item.cantidad_solicitada * item.precio_unitario_snapshot;
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
            {item.cantidad_solicitada} cajas × {cop(item.precio_unitario_snapshot)} · tu stock:{" "}
            <b className={disponible ? "text-primary-700" : ""}>{stock}</b>
          </p>
        </div>
        <p className={`font-display text-[14px] font-bold ${disponible ? "" : "text-muted line-through"}`}>{cop(subtotal)}</p>
      </div>
      <div className={`mt-3 flex gap-2 border-t pt-3 ${disponible ? "border-line" : "border-danger-100"}`}>
        <button
          onClick={() => onChange(true)}
          className={`chip flex-1 justify-center ${disponible ? "chip-active" : ""}`}
        >
          <Check size={14} /> Disponible
        </button>
        <button
          onClick={() => onChange(false)}
          className={`chip flex-1 justify-center ${!disponible ? "!border-danger !bg-danger !text-white" : ""}`}
        >
          {!disponible && <X size={14} />} Sin stock
        </button>
      </div>
      {!disponible && (
        <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-danger">
          <Info size={13} /> La farmacia podrá pedir este ítem a otro proveedor.
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

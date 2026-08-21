"use client";

import { CheckCheck, ClipboardList, Printer, Search, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { OrdenImprimible } from "@/components/orden-imprimible";
import { AppBar } from "@/components/shell";
import { Avatar, Badge, Button, Card, CardFlat, Chip, EmptyState, IconButton, Spinner } from "@/components/ui";
import { api, ApiCallError } from "@/lib/api";
import { cop, ESTADO_ORDEN_LABEL, ESTADO_ORDEN_TONE, hace, iniciales } from "@/lib/format";
import type { ItemDecision, Orden } from "@/lib/types";

type Filtro = "pendientes" | "preparacion" | "despachadas" | "todas";
const AVATAR_BG = ["bg-teal-600", "bg-primary-700", "bg-slate-500", "bg-slate-400"];
const EN_PREPARACION: string[] = ["aceptada_parcial", "aceptada_total"];

export default function OrdenesPage() {
  const [ordenes, setOrdenes] = useState<Orden[] | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("pendientes");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Orden montada en la hoja imprimible (impresión directa desde la bandeja).
  const [imprimir, setImprimir] = useState<Orden | null>(null);

  async function load() {
    setOrdenes(await api.get<Orden[]>("/ordenes/"));
  }
  useEffect(() => {
    let active = true;
    api
      .get<Orden[]>("/ordenes/")
      .then((d) => active && setOrdenes(d))
      .catch(() => active && setOrdenes([]));
    return () => {
      active = false;
    };
  }, []);

  // window.print() se dispara DESPUÉS de montar la hoja de la orden elegida.
  useEffect(() => {
    if (!imprimir) return;
    const raf = requestAnimationFrame(() => {
      window.print();
      setImprimir(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [imprimir]);

  const counts = useMemo(() => {
    const l = ordenes ?? [];
    return {
      pendientes: l.filter((o) => o.estado === "pendiente").length,
      preparacion: l.filter((o) => EN_PREPARACION.includes(o.estado)).length,
      despachadas: l.filter((o) => o.estado === "despachada").length,
      todas: l.length,
    };
  }, [ordenes]);

  const visibles = useMemo(() => {
    const l = ordenes ?? [];
    if (filtro === "pendientes") return l.filter((o) => o.estado === "pendiente");
    if (filtro === "preparacion") return l.filter((o) => EN_PREPARACION.includes(o.estado));
    if (filtro === "despachadas") return l.filter((o) => o.estado === "despachada");
    return l;
  }, [ordenes, filtro]);

  async function responder(orden: Orden, aceptar: boolean) {
    setBusyId(orden.id);
    setError(null);
    try {
      const decisiones: ItemDecision[] = orden.items.map((it) => ({
        item_id: it.id,
        estado: aceptar ? "aceptado" : "rechazado",
        cantidad_aceptada: aceptar ? it.cantidad_solicitada : 0,
      }));
      await api.post(`/ordenes/${orden.id}/aceptar`, { decisiones });
      await load();
    } catch (e) {
      setError(e instanceof ApiCallError ? e.message : "No se pudo procesar la orden.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <AppBar className="justify-between">
        <p className="font-display text-[20px] font-extrabold">Órdenes de pedido</p>
        <IconButton aria-label="Buscar" className="flex-none">
          <Search size={19} />
        </IconButton>
      </AppBar>

      <div className="px-5">
        <div className="no-scrollbar mb-1 flex gap-2 overflow-x-auto pb-1">
          <Chip active={filtro === "pendientes"} onClick={() => setFiltro("pendientes")}>
            Pendientes · {counts.pendientes}
          </Chip>
          <Chip active={filtro === "preparacion"} onClick={() => setFiltro("preparacion")}>
            En preparación · {counts.preparacion}
          </Chip>
          <Chip active={filtro === "despachadas"} onClick={() => setFiltro("despachadas")}>
            Despachadas · {counts.despachadas}
          </Chip>
          <Chip active={filtro === "todas"} onClick={() => setFiltro("todas")}>
            Todas · {counts.todas}
          </Chip>
        </div>
      </div>

      <div className="space-y-3 px-5 pb-24 pt-2">
        {!ordenes ? (
          <Spinner />
        ) : visibles.length === 0 ? (
          <EmptyState icon={<ClipboardList size={32} />} title="Sin órdenes" hint="Aquí verás los pedidos de las farmacias." />
        ) : (
          visibles.map((o, i) =>
            o.estado === "pendiente" ? (
              <OrdenPendiente
                key={o.id}
                orden={o}
                busy={busyId === o.id}
                onResponder={responder}
                onImprimir={() => setImprimir(o)}
              />
            ) : (
              <CompactOrden key={o.id} orden={o} index={i} />
            ),
          )
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>

      {imprimir && <OrdenImprimible orden={imprimir} />}
    </>
  );
}

/** Orden pendiente con las acciones A LA VISTA (feedback del fundador):
 *  aceptar todo, aceptar parcial (→ detalle) o rechazar, sin tener que
 *  descubrir que la tarjeta es clicable. El badge "Pendiente" (redundante en
 *  esta bandeja) cede su lugar al botón de imprimir para revisar en bodega. */
function OrdenPendiente({
  orden,
  busy,
  onResponder,
  onImprimir,
}: {
  orden: Orden;
  busy: boolean;
  onResponder: (o: Orden, aceptar: boolean) => void;
  onImprimir: () => void;
}) {
  const [confirmaRechazo, setConfirmaRechazo] = useState(false);
  const total = orden.items.reduce((s, it) => s + it.cantidad_solicitada * it.precio_unitario_snapshot, 0);
  return (
    <Card className="border-l-4 border-amber-500 p-4">
      <div className="mb-3 flex items-center justify-between">
        <Link href={`/proveedor/ordenes/${orden.id}`} className="flex min-w-0 items-center gap-2.5">
          <Avatar className="h-9 w-9 flex-none bg-teal-600 text-[12px]">{iniciales(orden.farmacia?.razon_social ?? "F")}</Avatar>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold leading-none">{orden.farmacia?.razon_social ?? "Farmacia"}</p>
            <p className="mt-1 text-[11.5px] text-muted">
              #{orden.codigo} · {hace(orden.created_at)}
            </p>
          </div>
        </Link>
        <button
          type="button"
          onClick={onImprimir}
          className="flex flex-none items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[12px] font-semibold text-soft transition hover:border-primary hover:text-primary-700"
          aria-label={`Imprimir el pedido ${orden.codigo} para revisar en bodega`}
          title="Imprimir pedido para revisar en bodega"
        >
          <Printer size={14} /> Imprimir
        </button>
      </div>
      <div className="divider mb-3" />
      <div className="mb-3 space-y-2">
        {orden.items.map((it) => (
          <div key={it.id} className="flex items-center justify-between text-[13.5px]">
            <span className="text-soft">
              {it.producto?.nombre ?? "Producto"} <span className="text-muted">× {it.cantidad_solicitada} cajas</span>
            </span>
            <span className="font-semibold">{cop(it.cantidad_solicitada * it.precio_unitario_snapshot)}</span>
          </div>
        ))}
      </div>
      <div className="mb-3 flex items-center justify-between rounded-xl bg-canvas px-3.5 py-2.5">
        <span className="text-[13px] text-muted">Total de la orden</span>
        <span className="font-display text-[18px] font-extrabold text-primary-800">{cop(total)}</span>
      </div>

      {confirmaRechazo ? (
        <div>
          <p className="mb-2 text-center text-[12.5px] text-muted">
            ¿Rechazar la orden completa? La farmacia podrá pedir a otro proveedor.
          </p>
          <div className="flex gap-2.5">
            <Button variant="outline" size="md" className="flex-1" disabled={busy} onClick={() => setConfirmaRechazo(false)}>
              No, volver
            </Button>
            <Button size="md" className="flex-1 !bg-danger" disabled={busy} onClick={() => onResponder(orden, false)}>
              {busy ? "Rechazando…" : "Sí, rechazar"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Button variant="primary" size="md" block disabled={busy} onClick={() => onResponder(orden, true)}>
            <CheckCheck size={17} /> {busy ? "Procesando…" : "Aceptar y preparar todo"}
          </Button>
          <div className="flex gap-2.5">
            <Button variant="outline" size="md" className="flex-1 text-danger" disabled={busy} onClick={() => setConfirmaRechazo(true)}>
              Rechazar
            </Button>
            <Link href={`/proveedor/ordenes/${orden.id}`} className="flex-1">
              <Button variant="outline" size="md" block disabled={busy}>
                <SlidersHorizontal size={15} /> Aceptar parcial
              </Button>
            </Link>
          </div>
        </div>
      )}
    </Card>
  );
}

function CompactOrden({ orden, index }: { orden: Orden; index: number }) {
  const cajas = orden.items.reduce((s, it) => s + it.cantidad_solicitada, 0);
  const totalMostrar = orden.estado === "pendiente"
    ? orden.items.reduce((s, it) => s + it.cantidad_solicitada * it.precio_unitario_snapshot, 0)
    : orden.total;
  return (
    <Link href={`/proveedor/ordenes/${orden.id}`}>
      <CardFlat className={`lift p-4 ${orden.estado === "despachada" ? "opacity-85" : ""}`}>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Avatar className={`h-9 w-9 text-[12px] ${AVATAR_BG[index % AVATAR_BG.length]}`}>
              {iniciales(orden.farmacia?.razon_social ?? "F")}
            </Avatar>
            <div>
              <p className="text-[14px] font-semibold leading-none">{orden.farmacia?.razon_social ?? "Farmacia"}</p>
              <p className="mt-1 text-[11.5px] text-muted">
                #{orden.codigo} · {hace(orden.created_at)}
              </p>
            </div>
          </div>
          <Badge tone={ESTADO_ORDEN_TONE[orden.estado]}>{ESTADO_ORDEN_LABEL[orden.estado]}</Badge>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
          <span className="text-[12.5px] text-muted">
            {orden.items.length} productos · {cajas} cajas
          </span>
          <span className="font-display text-[15px] font-bold">{cop(totalMostrar)}</span>
        </div>
      </CardFlat>
    </Link>
  );
}

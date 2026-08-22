"use client";

import { CheckCheck, PackageCheck, Search, XCircle } from "lucide-react";
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";

import { OrdenTimeline } from "@/components/orden-timeline";
import { BackBar } from "@/components/shell";
import { Avatar, Badge, Button, Card, Spinner } from "@/components/ui";
import { api, ApiCallError } from "@/lib/api";
import { cop, ESTADO_ORDEN_LABEL, ESTADO_ORDEN_TONE, hace } from "@/lib/format";
import type { PedidoFarmacia } from "@/lib/types";

const ESTADO_ITEM_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  aceptado: "Confirmado",
  rechazado: "Sin stock",
  sustituido: "Sustituido",
};

export default function PedidoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [pedido, setPedido] = useState<PedidoFarmacia | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () => api.get<PedidoFarmacia>(`/farmacia/pedidos/${id}`).then(setPedido),
    [id],
  );

  useEffect(() => {
    let active = true;
    api
      .get<PedidoFarmacia>(`/farmacia/pedidos/${id}`)
      .then((p) => active && setPedido(p))
      .catch(() => active && setError("No se pudo cargar el pedido."));
    return () => {
      active = false;
    };
  }, [id]);

  if (error && !pedido) return <p className="px-5 pt-4 text-danger">{error}</p>;
  if (!pedido) return <Spinner />;

  const gestionado = pedido.estado !== "pendiente";
  const noDisponible = pedido.items.filter((i) => i.estado_item === "rechazado");
  // Regla del fundador: una aceptación PARCIAL también significa que el
  // proveedor no tenía — el faltante se puede pedir a otro proveedor.
  const conFaltante = (i: (typeof pedido.items)[number]) =>
    i.estado_item === "rechazado" ||
    (i.estado_item === "aceptado" && i.cantidad_aceptada < i.cantidad_solicitada);
  const faltantes = pedido.estado === "cancelada" ? [] : pedido.items.filter(conFaltante);
  const descuento = noDisponible.reduce(
    (acc, i) => acc + i.cantidad_solicitada * i.precio_unitario_snapshot,
    0,
  );

  async function accion(path: "cancelar" | "recibir") {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/farmacia/pedidos/${id}/${path}`);
      await load();
    } catch (e) {
      setError(
        e instanceof ApiCallError && e.status === 409
          ? "El estado del pedido cambió. Recarga para ver lo último."
          : "No se pudo completar la acción.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <BackBar title={`Pedido #${pedido.codigo}`} subtitle="Detalle del pedido" backHref="/farmacia/pedidos" />

      <div className="px-5 pb-28">
        {/* Cabecera: proveedor anónimo + estado. */}
        <Card className="mb-3 flex items-center gap-3 p-3.5">
          <Avatar className="h-11 w-11 bg-teal-600 text-[13px]">
            {pedido.proveedor_alias.replace("Proveedor ", "").slice(0, 2)}
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-semibold leading-tight">{pedido.proveedor_alias}</p>
            <p className="mt-0.5 text-[12px] text-muted">Creado {hace(pedido.created_at)}</p>
          </div>
          <Badge tone={ESTADO_ORDEN_TONE[pedido.estado] ?? "gray"} className="flex-none">
            {ESTADO_ORDEN_LABEL[pedido.estado] ?? pedido.estado}
          </Badge>
        </Card>

        {/* Aviso de novedades (f6): faltantes (sin stock O parciales), con acción. */}
        {faltantes.length > 0 && (
          <Card className="mb-3 border border-amber-200 bg-amber-50/60 p-3.5">
            <p className="text-[13px] font-semibold text-amber-800">
              {faltantes.length} producto{faltantes.length !== 1 && "s"} con faltante
            </p>
            <p className="mt-0.5 text-[12.5px] text-amber-700">
              El proveedor no tenía{" "}
              {faltantes
                .map((i) =>
                  i.estado_item === "rechazado"
                    ? (i.producto?.nombre ?? "un producto")
                    : `${i.cantidad_solicitada - i.cantidad_aceptada} de las ${i.cantidad_solicitada} cajas de ${i.producto?.nombre ?? "un producto"}`,
                )
                .join("; ")}
              . Pide el faltante a otro proveedor — este pedido no se modifica.
            </p>
          </Card>
        )}

        {/* Ítems */}
        <p className="mb-2 px-1 text-[12px] font-semibold text-muted">PRODUCTOS DEL PEDIDO</p>
        <Card className="mb-3 divide-y divide-line">
          {pedido.items.map((i) => {
            const rechazado = i.estado_item === "rechazado";
            // En una orden cancelada los ítems quedan "pendientes" con aceptada=0:
            // se muestra lo solicitado (mostrar "0 cajas" confunde).
            const cantidad =
              gestionado && !rechazado && pedido.estado !== "cancelada"
                ? i.cantidad_aceptada
                : i.cantidad_solicitada;
            return (
              <div key={i.id} className="p-3.5">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className={`text-[13.5px] font-semibold leading-tight ${rechazado ? "text-muted line-through" : ""}`}>
                      {i.producto?.nombre ?? "Producto"}
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted">
                      {cantidad} caja{cantidad !== 1 && "s"} × {cop(i.precio_unitario_snapshot)}
                      {gestionado && i.estado_item === "aceptado" && i.cantidad_aceptada < i.cantidad_solicitada && (
                        <span className="text-amber-600"> · de {i.cantidad_solicitada} pedidas</span>
                      )}
                    </p>
                  </div>
                  <div className="flex-none text-right">
                    <p className={`font-display text-[14px] font-bold ${rechazado ? "text-muted" : ""}`}>
                      {cop(cantidad * i.precio_unitario_snapshot)}
                    </p>
                    <Badge
                      tone={rechazado ? "red" : i.estado_item === "aceptado" ? "green" : i.estado_item === "sustituido" ? "teal" : "amber"}
                      className="mt-1"
                    >
                      {ESTADO_ITEM_LABEL[i.estado_item] ?? i.estado_item}
                    </Badge>
                  </div>
                </div>
                {/* Acción directa: comprar el faltante (rechazo O parcial) a otro proveedor. */}
                {conFaltante(i) && (
                  <Link
                    href={`/farmacia/comparar/${i.producto_maestro_id}`}
                    className="mt-2.5 flex items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 py-2 text-[12.5px] font-semibold text-amber-800 transition hover:border-amber-400"
                  >
                    <Search size={14} />
                    {rechazado
                      ? `Buscar otras opciones de ${i.producto?.nombre ?? "este producto"}`
                      : `Pedir ${i.cantidad_solicitada - i.cantidad_aceptada} caja${i.cantidad_solicitada - i.cantidad_aceptada !== 1 ? "s" : ""} faltante${i.cantidad_solicitada - i.cantidad_aceptada !== 1 ? "s" : ""} a otro proveedor`}
                  </Link>
                )}
              </div>
            );
          })}
        </Card>

        {/* Totales */}
        <Card className="mb-4 p-3.5">
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-muted">Solicitado</span>
            <span className="font-semibold">{cop(pedido.total_solicitado)}</span>
          </div>
          {gestionado && descuento > 0 && (
            <div className="mt-1.5 flex items-center justify-between text-[13px]">
              <span className="text-muted">No disponible</span>
              <span className="font-semibold text-danger">−{cop(descuento)}</span>
            </div>
          )}
          <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
            <span className="text-[13.5px] font-semibold">Total a pagar</span>
            <span className="font-display text-[17px] font-extrabold text-primary-800">
              {cop(gestionado ? pedido.total : pedido.total_solicitado)}
            </span>
          </div>
        </Card>

        {/* Seguimiento: cada estado con su fecha y hora. */}
        <OrdenTimeline eventos={pedido.eventos} />

        {error && <p className="mb-3 text-center text-[12.5px] text-danger">{error}</p>}

        {/* Acciones según estado. */}
        {pedido.estado === "pendiente" && (
          <Button variant="outline" size="md" block className="text-danger" disabled={busy} onClick={() => accion("cancelar")}>
            <XCircle size={16} /> {busy ? "Cancelando…" : "Cancelar pedido"}
          </Button>
        )}
        {pedido.estado === "despachada" && (
          <Button size="lg" block disabled={busy} onClick={() => accion("recibir")}>
            <PackageCheck size={18} /> {busy ? "Confirmando…" : "Confirmar recepción"}
          </Button>
        )}
        {pedido.estado === "completada" && (
          <p className="flex items-center justify-center gap-1.5 text-[13px] font-semibold text-primary">
            <CheckCheck size={16} /> Pedido recibido. ¡Gracias!
          </p>
        )}
      </div>
    </>
  );
}

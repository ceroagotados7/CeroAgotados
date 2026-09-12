"use client";

import { AlertTriangle, CheckCheck, PackageCheck, ReceiptText, Search, XCircle } from "lucide-react";
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";

import { OrdenTimeline } from "@/components/orden-timeline";
import { RecepcionNoAceptada } from "@/components/recepcion-no-aceptada";
import { IdentidadProducto } from "@/components/producto-identidad";
import { BackBar } from "@/components/shell";
import { Avatar, Badge, Button, Card, Spinner } from "@/components/ui";
import { api, ApiCallError } from "@/lib/api";
import { cajas, faltantesDeOrden } from "@/lib/faltantes";
import { cop, ESTADO_ORDEN_LABEL, ESTADO_ORDEN_TONE, hace, iniciales, miles } from "@/lib/format";
import { tituloProducto } from "@/lib/producto";
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
  const [abierto, setAbierto] = useState(false);
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
  // Faltantes (rechazos y parciales) con lógica pura testeable (lib/faltantes).
  const faltantes = faltantesDeOrden(pedido.items, pedido.estado);
  const faltantePorItem = new Map(faltantes.map((f) => [f.itemId, f]));
  const descuento = noDisponible.reduce(
    (acc, i) => acc + i.cantidad_solicitada * i.precio_unitario_snapshot,
    0,
  );

  async function noAceptar(payload: {
    alcance: string;
    items: { item_id: string; cantidad: number }[];
    comentario: string | null;
  }) {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/farmacia/pedidos/${id}/no-aceptar`, payload);
      setAbierto(false);
      await load();
    } catch (e) {
      setError(
        e instanceof ApiCallError && e.status === 409
          ? "Este pedido ya tiene registrada su recepción."
          : "No se pudo registrar. Revisa las cantidades e inténtalo de nuevo.",
      );
    } finally {
      setBusy(false);
    }
  }

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
        {/* Cabecera: pedido enviado → proveedor con nombre real (transparencia
            para reclamos, 2026-09-04). El alias queda como referencia. */}
        <Card className="mb-3 flex items-center gap-3 p-3.5">
          <Avatar className="h-11 w-11 bg-teal-600 text-[13px]">
            {pedido.proveedor_nombre
              ? iniciales(pedido.proveedor_nombre)
              : pedido.proveedor_alias.replace("Proveedor ", "").slice(0, 2)}
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14.5px] font-semibold leading-tight">
              {pedido.proveedor_nombre ?? pedido.proveedor_alias}
            </p>
            <p className="mt-0.5 text-[12px] text-muted">
              {pedido.proveedor_nombre && `${pedido.proveedor_alias} · `}Creado {hace(pedido.created_at)}
            </p>
          </div>
          <Badge tone={ESTADO_ORDEN_TONE[pedido.estado] ?? "gray"} className="flex-none">
            {ESTADO_ORDEN_LABEL[pedido.estado] ?? pedido.estado}
          </Badge>
        </Card>

        {/* Aviso de novedades (f6), rediseñado (feedback del fundador): titular
            "Proveedor X no aceptó:" + una viñeta por producto, legible de un
            vistazo, con lo que falta en negrilla. */}
        {faltantes.length > 0 && (
          <Card className="mb-3 border-2 border-amber-300 bg-amber-50 p-4">
            <p className="flex items-center gap-2 text-[14.5px] font-bold leading-tight text-amber-900">
              <AlertTriangle size={17} className="flex-none" />
              {pedido.proveedor_nombre ?? pedido.proveedor_alias} no aceptó:
            </p>
            <ul className="mt-2.5 space-y-2">
              {faltantes.map((f) => (
                <li key={f.itemId} className="flex gap-2.5 text-[13px] leading-snug text-amber-900">
                  <span className="mt-[6px] h-1.5 w-1.5 flex-none rounded-full bg-amber-500" aria-hidden />
                  <span className="min-w-0">
                    <b>{f.nombre}</b>
                    {f.tipo === "sin_stock" ? (
                      <> — sin stock: no despachó {f.pedidas === 1 ? "la caja pedida" : <>ninguna de las <b>{cajas(f.pedidas)}</b> pedidas</>}</>
                    ) : (
                      <>
                        {" — solo despachó "}{cajas(f.aceptadas)} de {cajas(f.pedidas)}:{" "}
                        <b>{f.faltan === 1 ? "falta" : "faltan"} {cajas(f.faltan)}</b>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-amber-200 pt-2.5 text-[12.5px] font-medium text-amber-800">
              Puedes pedir {faltantes.length === 1 ? "el faltante" : "los faltantes"} a otro
              proveedor desde el botón de cada producto — este pedido no se modifica.
            </p>
          </Card>
        )}

        {/* Factura del despacho (Grupo 4): la farmacia la coteja contra la
            física que llega con la mercancía. No revela al proveedor. */}
        {pedido.factura_numero && (
          <Card className="mb-3 flex items-center gap-3 p-3.5">
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <ReceiptText size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                Factura del proveedor
              </p>
              <p className="font-display text-[16px] font-extrabold leading-tight">
                {pedido.factura_numero}
              </p>
              <p className="mt-0.5 text-[11.5px] text-muted">
                Compárala con la factura física que llega con la mercancía.
              </p>
            </div>
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
                    {/* Con concentración: si el proveedor no aceptó el de 90 mg,
                        la farmacia tiene que ver cuál fue exactamente. */}
                    <IdentidadProducto
                      producto={i.producto}
                      size="sm"
                      mostrarMolecula={false}
                      tituloClassName={rechazado ? "text-muted line-through" : undefined}
                    />
                    <p className="mt-0.5 text-[12px] text-muted">
                      {miles(cantidad)} caja{cantidad !== 1 && "s"} × {cop(i.precio_unitario_snapshot)}
                      {gestionado && i.estado_item === "aceptado" && i.cantidad_aceptada < i.cantidad_solicitada && (
                        <span className="font-semibold text-amber-700"> · de {miles(i.cantidad_solicitada)} pedidas</span>
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
                {faltantePorItem.has(i.id) && (
                  <Link
                    href={`/farmacia/comparar/${i.producto_maestro_id}`}
                    className="mt-2.5 flex items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 py-2 text-[12.5px] font-semibold text-amber-800 transition hover:border-amber-400"
                  >
                    <Search size={14} />
                    {rechazado
                      ? `Buscar otras opciones de ${tituloProducto(i.producto ?? {}, "este producto")}`
                      : `Pedir ${cajas(faltantePorItem.get(i.id)!.faltan)} faltante${faltantePorItem.get(i.id)!.faltan !== 1 ? "s" : ""} a otro proveedor`}
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
        <OrdenTimeline eventos={pedido.eventos} facturaNumero={pedido.factura_numero} />

        {error && <p className="mb-3 text-center text-[12.5px] text-danger">{error}</p>}

        {/* Acciones según estado. */}
        {pedido.estado === "pendiente" && (
          <Button variant="outline" size="md" block className="text-danger" disabled={busy} onClick={() => accion("cancelar")}>
            <XCircle size={16} /> {busy ? "Cancelando…" : "Cancelar pedido"}
          </Button>
        )}
        {pedido.estado === "despachada" && !abierto && (
          <div className="space-y-2">
            <Button size="lg" block disabled={busy} onClick={() => accion("recibir")}>
              <PackageCheck size={18} /> {busy ? "Confirmando…" : "Confirmar recepción"}
            </Button>
            {/* Salida honesta cuando la entrega llegó mal. Va debajo y en tono
                discreto: lo normal es que el pedido llegue bien. */}
            {/* py-3, no py-1.5: con el padding anterior el objetivo táctil medía
                unos 32 px de alto, por debajo de los 44 px que necesita un dedo.
                Se notó probando en producción — costaba acertarle. */}
            <button
              type="button"
              onClick={() => setAbierto(true)}
              className="flex min-h-[44px] w-full items-center justify-center gap-1.5 py-3 text-[13px] font-semibold text-amber-700"
            >
              <AlertTriangle size={15} /> No acepté este pedido
            </button>
          </div>
        )}
        {pedido.estado === "despachada" && abierto && (
          <RecepcionNoAceptada
            items={pedido.items}
            guardando={busy}
            error={error}
            onCancelar={() => {
              setAbierto(false);
              setError(null);
            }}
            onConfirmar={noAceptar}
          />
        )}
        {pedido.estado === "completada" && pedido.recepcion === "aceptada" && (
          <p className="flex items-center justify-center gap-1.5 text-[13px] font-semibold text-primary">
            <CheckCheck size={16} /> Pedido recibido. ¡Gracias!
          </p>
        )}
        {/* Lo registrado queda a la vista: es el reclamo de la farmacia. */}
        {pedido.recepcion && pedido.recepcion !== "aceptada" && (
          <Card className="border border-amber-300 bg-amber-50/50 p-3.5">
            <p className="flex items-center gap-1.5 text-[13.5px] font-semibold text-amber-800">
              <AlertTriangle size={15} />
              {pedido.recepcion === "no_aceptada_total"
                ? "No aceptaste este pedido"
                : "No aceptaste parte de este pedido"}
            </p>
            {pedido.recepcion_comentario && (
              <p className="mt-1.5 text-[12.5px] text-muted">“{pedido.recepcion_comentario}”</p>
            )}
            <p className="mt-1.5 text-[11.5px] text-muted">
              El proveedor ya lo ve. Queda en firme.
            </p>
          </Card>
        )}
      </div>
    </>
  );
}

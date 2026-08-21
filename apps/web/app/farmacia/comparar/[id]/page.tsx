"use client";

import { Boxes, Check, ShoppingCart, Tag } from "lucide-react";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useState } from "react";

import { BackBar } from "@/components/shell";
import { Avatar, Badge, Button, Card, EmptyState, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { addToCart, useCart } from "@/lib/cart";
import { cop } from "@/lib/format";
import type { CompararResult } from "@/lib/types";

export default function CompararPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const cart = useCart();

  const [data, setData] = useState<CompararResult | null>(null);
  const [error, setError] = useState(false);
  // Selección MÚLTIPLE (regla del fundador): la farmacia puede pedir el mismo
  // producto a varios proveedores a la vez. oferta_id → cantidad.
  const [sel, setSel] = useState<Record<string, number>>({});

  useEffect(() => {
    let active = true;
    api
      .get<CompararResult>(`/farmacia/comparar/${id}`)
      .then((d) => active && setData(d))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [id]);

  const seleccion = useMemo(
    () => (data ? data.opciones.filter((o) => sel[o.oferta_id] != null) : []),
    [data, sel],
  );
  const totalSel = seleccion.reduce((acc, o) => acc + o.precio * (sel[o.oferta_id] ?? 0), 0);
  const selValida = seleccion.every(
    (o) => (sel[o.oferta_id] ?? 0) >= 1 && (sel[o.oferta_id] ?? 0) <= o.stock_disponible,
  );

  if (error) return <p className="px-5 pt-4 text-danger">No se pudo cargar el producto.</p>;
  if (!data) return <Spinner />;

  const presentacion = [data.producto.forma_farmaceutica, data.producto.presentacion]
    .filter(Boolean)
    .join(" · ");
  const enCarrito = new Set(cart.map((i) => i.oferta_id));

  function toggle(ofertaId: string, stock: number) {
    setSel((s) => {
      if (s[ofertaId] != null) {
        const resto = { ...s };
        delete resto[ofertaId];
        return resto;
      }
      return { ...s, [ofertaId]: Math.min(10, stock) };
    });
  }

  function agregarSeleccion() {
    if (!data || seleccion.length === 0 || !selValida) return;
    for (const o of seleccion) {
      addToCart({
        oferta_id: o.oferta_id,
        producto_id: data.producto.id,
        nombre: data.producto.nombre,
        presentacion,
        proveedor_alias: o.proveedor_alias,
        precio: o.precio,
        stock: o.stock_disponible,
        cantidad: Math.min(sel[o.oferta_id] ?? 1, o.stock_disponible),
      });
    }
    router.push("/farmacia/pedido");
  }

  return (
    <>
      <BackBar title={data.producto.nombre} subtitle="Comparar opciones" backHref="/farmacia" />

      <div className="px-5 pb-44">
        {presentacion && <p className="mb-3 px-1 text-[12.5px] text-muted">{presentacion}</p>}

        {/* Stats (f2): opciones · más bajo · promedio. Sin identidad de proveedor. */}
        {data.opciones_total > 0 && (
          <Card className="mb-3 grid grid-cols-3 divide-x divide-line p-0 text-center">
            <Stat label="Opciones" value={String(data.opciones_total)} />
            <Stat label="Más bajo" value={data.precio_min != null ? cop(data.precio_min) : "—"} accent />
            <Stat label="Promedio" value={data.precio_promedio != null ? cop(data.precio_promedio) : "—"} />
          </Card>
        )}

        <p className="mb-2 px-1 text-[12px] text-muted">
          Ordenado por precio. Los proveedores participan de forma <b>anónima</b>: puedes
          seleccionar <b>varias opciones</b> y pedir el mismo producto a más de un proveedor.
        </p>

        {data.opciones.length === 0 ? (
          <EmptyState
            icon={<Tag size={32} />}
            title="Sin opciones disponibles"
            hint="Ningún proveedor oferta este medicamento con stock ahora."
          />
        ) : (
          <div className="space-y-2.5">
            {data.opciones.map((o) => {
              const activa = sel[o.oferta_id] != null;
              const cantidad = sel[o.oferta_id] ?? 0;
              const yaEnPedido = enCarrito.has(o.oferta_id);
              return (
                <Card
                  key={o.oferta_id}
                  className={`p-3.5 ${activa ? "border-2 border-primary" : ""} ${
                    o.es_mejor_precio ? "bg-primary-50/40" : ""
                  }`}
                >
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 text-left"
                    aria-pressed={activa}
                    onClick={() => toggle(o.oferta_id, o.stock_disponible)}
                  >
                    <span
                      className={`flex h-5 w-5 flex-none items-center justify-center rounded-md border ${
                        activa ? "border-primary bg-primary text-white" : "border-line bg-surface"
                      }`}
                      aria-hidden
                    >
                      {activa && <Check size={13} />}
                    </span>
                    <Avatar className={`h-10 w-10 text-[13px] ${o.es_mejor_precio ? "bg-primary" : "bg-slate-400"}`}>
                      {o.proveedor_alias.replace("Proveedor ", "").slice(0, 2)}
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[14px] font-semibold leading-tight">{o.proveedor_alias}</p>
                        {o.es_mejor_precio && <Badge tone="best">Mejor precio</Badge>}
                        {yaEnPedido && <Badge tone="teal">En tu pedido</Badge>}
                      </div>
                      <p className="mt-0.5 flex items-center gap-1 text-[12px] text-muted">
                        <Boxes size={12} /> stock {o.stock_disponible} cajas
                      </p>
                    </div>
                    <div className="flex-none text-right">
                      <p className={`font-display text-[16px] font-bold ${o.es_mejor_precio ? "text-primary-800" : ""}`}>
                        {cop(o.precio)}
                      </p>
                      {!o.es_mejor_precio && o.diferencia_vs_mejor > 0 && (
                        <p className="text-[11px] text-amber-600">+{cop(o.diferencia_vs_mejor)}</p>
                      )}
                    </div>
                  </button>

                  {/* Cantidad (f3) inline al seleccionar. */}
                  {activa && (
                    <div className="mt-3 border-t border-line pt-3">
                      <label className="label" htmlFor={`cant-${o.oferta_id}`}>
                        Cantidad (cajas)
                      </label>
                      <div className="mb-2 flex items-center gap-2">
                        <input
                          id={`cant-${o.oferta_id}`}
                          type="number"
                          min={1}
                          max={o.stock_disponible}
                          value={cantidad}
                          onChange={(e) =>
                            setSel((s) => ({ ...s, [o.oferta_id]: Number(e.target.value) }))
                          }
                          className="input flex-1 font-semibold"
                        />
                        {[10, 50, 100].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() =>
                              setSel((s) => ({
                                ...s,
                                [o.oferta_id]: Math.min(cantidad + n, o.stock_disponible),
                              }))
                            }
                            className="chip flex-none"
                          >
                            +{n}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="text-muted">
                          {cantidad} caja{cantidad !== 1 && "s"} × {cop(o.precio)}
                        </span>
                        <span className="font-display text-[15px] font-bold text-primary-800">
                          {cop(o.precio * cantidad)}
                        </span>
                      </div>
                      {cantidad > o.stock_disponible && (
                        <p className="mt-1.5 text-[12px] text-danger">
                          Máximo {o.stock_disponible} cajas disponibles.
                        </p>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Botón ÚNICO abajo (no por proveedor): agrega toda la selección. */}
      {seleccion.length > 0 && (
        <div
          className="fixed bottom-20 left-1/2 z-20 w-full max-w-[430px] -translate-x-1/2 border-t border-line bg-surface px-5 py-3.5"
          style={{ boxShadow: "0 -6px 20px rgba(15,23,42,.05)" }}
        >
          <div className="mb-2 flex items-center justify-between text-[13px]">
            <span className="text-muted">
              {seleccion.length} proveedor{seleccion.length !== 1 && "es"} seleccionado
              {seleccion.length !== 1 && "s"}
            </span>
            <span className="font-display text-[15px] font-bold">{cop(totalSel)}</span>
          </div>
          <Button size="lg" block disabled={!selValida} onClick={agregarSeleccion}>
            <ShoppingCart size={17} /> Agregar al pedido · {cop(totalSel)}
          </Button>
        </div>
      )}
    </>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="p-3">
      <p className="text-[10.5px] leading-none text-muted">{label}</p>
      <p className={`mt-1.5 font-display text-[14.5px] font-bold ${accent ? "text-primary-800" : ""}`}>{value}</p>
    </div>
  );
}

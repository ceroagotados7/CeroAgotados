"use client";

import { ArrowRight, History, Layers, Pill, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AppBar } from "@/components/shell";
import { Card, Chip, EmptyState, SearchBar, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { cartTotal, useCart } from "@/lib/cart";
import { cop } from "@/lib/format";
import { useMe } from "@/lib/me";
import type { PedidoFarmacia, ProductoBusqueda } from "@/lib/types";

type Recompra = { producto_id: string; nombre: string; veces: number };

export default function BuscarPage() {
  const me = useMe();
  const cart = useCart();
  const [q, setQ] = useState("");
  const [categoria, setCategoria] = useState<string | null>(null);
  const [productos, setProductos] = useState<ProductoBusqueda[] | null>(null);
  const [recompra, setRecompra] = useState<Recompra[]>([]);

  useEffect(() => {
    let active = true;
    const t = setTimeout(async () => {
      try {
        const data = await api.get<ProductoBusqueda[]>(
          `/farmacia/buscar?q=${encodeURIComponent(q)}`,
        );
        if (active) setProductos(data);
      } catch {
        if (active) setProductos([]);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [q]);

  // "Vuelve a pedir" (f1): lo que esta farmacia ya pidió antes, 1 toque para recomprar.
  useEffect(() => {
    let active = true;
    api
      .get<PedidoFarmacia[]>("/farmacia/pedidos")
      .then((pedidos) => {
        if (!active) return;
        const conteo = new Map<string, Recompra>();
        for (const p of pedidos) {
          if (p.estado === "cancelada" || p.estado === "rechazada") continue;
          for (const it of p.items) {
            if (!it.producto) continue;
            const prev = conteo.get(it.producto.id);
            conteo.set(it.producto.id, {
              producto_id: it.producto.id,
              nombre: it.producto.nombre,
              veces: (prev?.veces ?? 0) + 1,
            });
          }
        }
        setRecompra([...conteo.values()].sort((a, b) => b.veces - a.veces).slice(0, 4));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Chips de categorías, derivadas de lo realmente ofertado (nunca dummy).
  const categorias = useMemo(() => {
    const set = new Set<string>();
    for (const p of productos ?? []) if (p.categoria) set.add(p.categoria);
    return [...set].sort();
  }, [productos]);

  const visibles = (productos ?? []).filter(
    (p) => !categoria || p.categoria === categoria,
  );
  const proveedores = new Set(cart.map((i) => i.proveedor_alias)).size;
  const buscando = q.trim().length > 0;

  return (
    <>
      <AppBar>
        <div className="min-w-0">
          <p className="mb-1 truncate text-[12px] leading-none text-muted">
            Comprando como {me?.organizacion?.razon_social ?? "…"}
          </p>
          <p className="font-display text-[20px] font-extrabold leading-none">
            ¿Qué necesitas surtir hoy?
          </p>
        </div>
      </AppBar>

      <div className="px-5">
        <SearchBar value={q} onChange={setQ} placeholder="Buscar medicamento…" className="mb-3" />

        {/* Pedido en curso (f1): atajo al carrito. */}
        {cart.length > 0 && (
          <Link href="/farmacia/pedido">
            <Card className="mb-3 flex items-center gap-3 border border-primary-100 bg-primary-50/50 p-3.5">
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-primary text-white">
                <ShoppingCart size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold leading-tight">Tienes un pedido en curso</p>
                <p className="mt-0.5 text-[12px] text-muted">
                  {cart.length} producto{cart.length !== 1 && "s"} · {proveedores} proveedor
                  {proveedores !== 1 && "es"} · {cop(cartTotal(cart))}
                </p>
              </div>
              <span className="flex items-center gap-1 text-[13px] font-semibold text-primary">
                Ver <ArrowRight size={15} />
              </span>
            </Card>
          </Link>
        )}

        {/* Categorías (f1). Solo las que tienen oferta real. */}
        {categorias.length > 1 && (
          <div className="no-scrollbar mb-1 flex gap-2 overflow-x-auto pb-1">
            <Chip active={categoria === null} onClick={() => setCategoria(null)}>
              Todas
            </Chip>
            {categorias.map((c) => (
              <Chip key={c} active={categoria === c} onClick={() => setCategoria(c)}>
                {c}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <div className="px-5 pb-28 pt-2">
        {/* Vuelve a pedir (f1): historial de compra, 1 toque. */}
        {!buscando && recompra.length > 0 && (
          <>
            <p className="mb-2 flex items-center gap-1.5 px-1 text-[12px] font-semibold text-muted">
              <History size={13} /> VUELVE A PEDIR
            </p>
            <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto pb-1">
              {recompra.map((r) => (
                <Link key={r.producto_id} href={`/farmacia/comparar/${r.producto_id}`} className="flex-none">
                  <span className="chip whitespace-nowrap">
                    {r.nombre}
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}

        {!buscando && (productos?.length ?? 0) > 0 && (
          <p className="mb-2 px-1 text-[12px] font-semibold text-muted">CATÁLOGO DISPONIBLE</p>
        )}

        {!productos ? (
          <Spinner />
        ) : visibles.length === 0 ? (
          <EmptyState
            icon={<Pill size={32} />}
            title={
              buscando || categoria
                ? "Sin resultados"
                : "Aún no hay medicamentos disponibles"
            }
            hint={
              buscando || categoria
                ? "Prueba con otro nombre, principio activo o categoría."
                : "Los proveedores aprobados están cargando sus catálogos. Vuelve pronto."
            }
          />
        ) : (
          <div className="space-y-2.5">
            {visibles.map((p) => {
              const detalle = [p.forma_farmaceutica, p.presentacion, p.laboratorio]
                .filter(Boolean)
                .join(" · ");
              return (
                <Link key={p.id} href={`/farmacia/comparar/${p.id}`} className="block">
                  <Card className="p-3.5">
                    <div className="flex items-start gap-3">
                      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                        <Pill size={20} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[14.5px] font-semibold leading-tight">{p.nombre}</p>
                        {detalle && <p className="mt-0.5 truncate text-[12px] text-muted">{detalle}</p>}
                      </div>
                      {p.categoria && (
                        <span className="flex-none rounded-md bg-canvas px-2 py-1 text-[10.5px] font-medium text-muted">
                          {p.categoria}
                        </span>
                      )}
                    </div>
                    <div className="mt-2.5 flex items-center justify-between border-t border-line pt-2.5">
                      <p className="flex items-center gap-1 text-[12px] text-muted">
                        <Layers size={12} /> {p.opciones} opcion{p.opciones !== 1 ? "es" : ""} anónima
                        {p.opciones !== 1 ? "s" : ""}
                      </p>
                      <p className="text-[12.5px] text-muted">
                        desde{" "}
                        <span className="font-display text-[16px] font-bold text-primary-800">
                          {cop(p.precio_desde)}
                        </span>
                      </p>
                      <span className="rounded-xl bg-primary px-3.5 py-2 text-[12.5px] font-semibold text-white">
                        Comparar
                      </span>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

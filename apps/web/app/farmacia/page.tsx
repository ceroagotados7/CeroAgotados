"use client";

import { ArrowRight, History, Layers, Pill, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { BannerVerificacion } from "@/components/banner-verificacion";
import { IdentidadProducto } from "@/components/producto-identidad";
import { ScrollInfinito } from "@/components/scroll-infinito";
import { AppBar } from "@/components/shell";
import { Card, Chip, EmptyState, SearchBar, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { cartTotal, useCart } from "@/lib/cart";
import { cop } from "@/lib/format";
import { tituloProducto } from "@/lib/producto";
import { useMe } from "@/lib/me";
import type { PedidoFarmacia, ProductoBusqueda } from "@/lib/types";

type Recompra = { producto_id: string; nombre: string; veces: number };

const PAGINA = 30;

export default function BuscarPage() {
  const me = useMe();
  const cart = useCart();
  const [q, setQ] = useState("");
  const [categoria, setCategoria] = useState<string | null>(null);
  const [productos, setProductos] = useState<ProductoBusqueda[] | null>(null);
  const [pagina, setPagina] = useState(0);
  const [hayMas, setHayMas] = useState(false);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [recompra, setRecompra] = useState<Recompra[]>([]);

  // Cambiar la búsqueda reinicia la paginación del scroll infinito.
  useEffect(() => {
    setPagina(0);
    setCargandoMas(false);
  }, [q]);

  useEffect(() => {
    let active = true;
    const t = setTimeout(async () => {
      try {
        const data = await api.get<ProductoBusqueda[]>(
          `/farmacia/buscar?q=${encodeURIComponent(q)}&limit=${PAGINA}&offset=${pagina * PAGINA}`,
        );
        if (!active) return;
        // Una página llena sugiere que hay más (el backend no da el total).
        setHayMas(data.length === PAGINA);
        setProductos((prev) => (pagina === 0 || !prev ? data : [...prev, ...data]));
      } catch {
        if (active) setProductos([]);
      } finally {
        if (active) setCargandoMas(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [q, pagina]);

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
              // Con concentración: el chip "Torrox" a secas no dice si es el de
              // 60, 90 o 120 mg, y recomprar el equivocado cuesta plata.
              nombre: tituloProducto(it.producto),
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
        {/* Estado de verificación: sin aprobación no se puede comprar. */}
        <BannerVerificacion rol="farmacia" />

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
              return (
                <Link key={p.id} href={`/farmacia/comparar/${p.id}`} className="block">
                  <Card className="p-3.5">
                    <div className="flex items-start gap-3">
                      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                        <Pill size={20} />
                      </span>
                      {/* Con molécula: la farmacia busca equivalentes, no solo marcas.
                          La categoría YA NO comparte esta fila: era un chip
                          flex-none sin truncar y, como el 49% del maestro tiene
                          categorías de más de 30 caracteres (hasta 67), aplastaba
                          el nombre hasta dejarlo en una letra por línea. Es el
                          caso Basilox que reportó el equipo. */}
                      <IdentidadProducto producto={p} className="flex-1" />
                    </div>
                    {p.categoria && (
                      <p className="mt-1.5 truncate text-[11px] text-muted">{p.categoria}</p>
                    )}
                    {/* Opciones y precio en una columna, el botón aparte: a 360 px
                        los tres en una fila con justify-between se apiñaban y el
                        precio quedaba pegado al botón (visible en la foto del
                        equipo). Ahora el botón nunca invade el precio. */}
                    <div className="mt-2.5 flex items-center gap-3 border-t border-line pt-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1 text-[12px] text-muted">
                          <Layers size={12} /> {p.opciones} opcion{p.opciones !== 1 ? "es" : ""} anónima
                          {p.opciones !== 1 ? "s" : ""}
                        </p>
                        <p className="mt-0.5 text-[12.5px] text-muted">
                          desde{" "}
                          <span className="font-display text-[16px] font-bold text-primary-800">
                            {cop(p.precio_desde)}
                          </span>
                        </p>
                      </div>
                      <span className="flex-none rounded-xl bg-primary px-4 py-2.5 text-[12.5px] font-semibold text-white">
                        Comprar
                      </span>
                    </div>
                  </Card>
                </Link>
              );
            })}

            {/* Scroll infinito (feedback del equipo): la página siguiente
                llega sola, sin "ver más". */}
            {hayMas && (
              <ScrollInfinito
                cargando={cargandoMas}
                onMore={() => {
                  if (cargandoMas) return;
                  setCargandoMas(true);
                  setPagina((n) => n + 1);
                }}
              />
            )}
          </div>
        )}
      </div>
    </>
  );
}

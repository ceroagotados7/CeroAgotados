"use client";

import { ArrowRight, Layers, Pill, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { AppBar } from "@/components/shell";
import { Card, EmptyState, SearchBar, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { cartTotal, useCart } from "@/lib/cart";
import { cop } from "@/lib/format";
import { useMe } from "@/lib/me";
import type { ProductoBusqueda } from "@/lib/types";

export default function BuscarPage() {
  const me = useMe();
  const cart = useCart();
  const [q, setQ] = useState("");
  const [productos, setProductos] = useState<ProductoBusqueda[] | null>(null);

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

  const proveedores = new Set(cart.map((i) => i.proveedor_alias)).size;

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
      </div>

      <div className="px-5 pb-28 pt-1">
        {!productos ? (
          <Spinner />
        ) : productos.length === 0 ? (
          <EmptyState
            icon={<Pill size={32} />}
            title={q ? "Sin resultados" : "Aún no hay medicamentos ofertados"}
            hint={q ? "Prueba con otro nombre o principio activo." : "Vuelve pronto: los proveedores están cargando sus catálogos."}
          />
        ) : (
          <div className="space-y-2.5">
            {productos.map((p) => (
              <Link key={p.id} href={`/farmacia/comparar/${p.id}`} className="block">
                <Card className="flex items-center gap-3 p-3.5">
                  <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                    <Pill size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] font-semibold leading-tight">{p.nombre}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-[12px] text-muted">
                      <Layers size={12} /> {p.opciones} opcion{p.opciones !== 1 ? "es" : ""} · desde{" "}
                      <b className="text-primary-800">{cop(p.precio_desde)}</b>
                    </p>
                  </div>
                  <span className="flex-none rounded-xl bg-primary-50 px-3 py-2 text-[12.5px] font-semibold text-primary-800">
                    Comparar
                  </span>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

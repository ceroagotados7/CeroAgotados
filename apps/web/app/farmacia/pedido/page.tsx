"use client";

import { ArrowRight, CheckCircle2, Plus, ShoppingCart, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { AppBar } from "@/components/shell";
import { Avatar, Button, Card, EmptyState } from "@/components/ui";
import { api, ApiCallError } from "@/lib/api";
import { cartTotal, clearCart, removeFromCart, setCantidad, useCart, type CartItem } from "@/lib/cart";
import { cop } from "@/lib/format";
import { useMe } from "@/lib/me";
import type { PedidoCreadoResult } from "@/lib/types";

export default function PedidoPage() {
  const cart = useCart();
  const me = useMe();
  // Regla dura: una farmacia sin aprobar navega y compara, pero NO compra.
  const aprobada = !me || me.organizacion?.estado_verificacion === "aprobado";
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creado, setCreado] = useState<PedidoCreadoResult | null>(null);

  // Una orden por proveedor (f4): agrupamos por el alias anónimo.
  const grupos = useMemo(() => {
    const g = new Map<string, CartItem[]>();
    for (const item of cart) {
      g.set(item.proveedor_alias, [...(g.get(item.proveedor_alias) ?? []), item]);
    }
    return [...g.entries()];
  }, [cart]);

  async function confirmar() {
    setEnviando(true);
    setError(null);
    try {
      const res = await api.post<PedidoCreadoResult>("/farmacia/pedido", {
        items: cart.map((i) => ({ oferta_id: i.oferta_id, cantidad: i.cantidad })),
      });
      clearCart();
      setCreado(res);
    } catch (e) {
      const msg =
        e instanceof ApiCallError && e.message.includes("stock_insuficiente")
          ? "El stock de alguna opción cambió. Revisa las cantidades e inténtalo de nuevo."
          : e instanceof ApiCallError && e.message.includes("oferta_no_disponible")
            ? "Alguna opción ya no está disponible. Quítala y vuelve a compararla."
            : e instanceof ApiCallError && e.message.includes("farmacia_no_aprobada")
              ? "Tu cuenta aún no está aprobada: podrás confirmar pedidos cuando el equipo la verifique."
              : "No se pudo confirmar el pedido. Inténtalo de nuevo.";
      setError(msg);
      setEnviando(false);
    }
  }

  // Pantalla de éxito: las órdenes creadas (una por proveedor).
  if (creado) {
    return (
      <>
        <AppBar>
          <p className="font-display text-[20px] font-extrabold">Pedido confirmado</p>
        </AppBar>
        <div className="px-5 pb-28 pt-2">
          <div className="mb-4 flex flex-col items-center gap-2 py-6 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-50 text-primary">
              <CheckCircle2 size={34} />
            </span>
            <p className="font-display text-[18px] font-bold">¡Listo! Tu pedido va en camino a los proveedores</p>
            <p className="text-[13px] text-muted">
              Se generó {creado.ordenes.length} orden{creado.ordenes.length !== 1 && "es"} — una por proveedor.
            </p>
          </div>
          <div className="space-y-2.5">
            {creado.ordenes.map((o) => (
              <Link key={o.orden_id} href={`/farmacia/pedidos/${o.orden_id}`} className="block">
                <Card className="flex items-center gap-3 p-3.5">
                  <Avatar className="h-10 w-10 bg-teal-600 text-[12px]">
                    {o.proveedor_alias.replace("Proveedor ", "").slice(0, 2)}
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold">#{o.codigo}</p>
                    <p className="text-[12px] text-muted">
                      {o.proveedor_alias} · {o.n_items} producto{o.n_items !== 1 && "s"}
                    </p>
                  </div>
                  <p className="font-display text-[15px] font-bold">{cop(o.subtotal)}</p>
                </Card>
              </Link>
            ))}
          </div>
          <Link href="/farmacia/pedidos" className="mt-4 block">
            <Button variant="outline" size="md" block>
              Ver mis pedidos <ArrowRight size={16} />
            </Button>
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <AppBar className="justify-between">
        <p className="font-display text-[20px] font-extrabold">Tu pedido</p>
        {cart.length > 0 && (
          <p className="text-[12.5px] text-muted">
            {cart.length} producto{cart.length !== 1 && "s"}
          </p>
        )}
      </AppBar>

      <div className="px-5 pb-40 pt-1">
        {cart.length === 0 ? (
          <EmptyState
            icon={<ShoppingCart size={32} />}
            title="Tu pedido está vacío"
            hint="Busca un medicamento y elige la mejor opción de precio."
          />
        ) : (
          <>
            <p className="mb-3 px-1 text-[12.5px] text-muted">
              Se generará <b>una orden por proveedor</b>. Los proveedores son anónimos.
            </p>
            <div className="space-y-3">
              {grupos.map(([alias, items]) => (
                <Card key={alias} className="p-3.5">
                  <div className="mb-2 flex items-center gap-2.5 border-b border-line pb-2.5">
                    <Avatar className="h-8 w-8 bg-teal-600 text-[11px]">
                      {alias.replace("Proveedor ", "").slice(0, 2)}
                    </Avatar>
                    <p className="text-[13.5px] font-semibold">{alias}</p>
                  </div>
                  <div className="divide-y divide-line">
                    {items.map((i) => (
                      <div key={i.oferta_id} className="flex items-center gap-2.5 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-[13.5px] font-semibold leading-tight">{i.nombre}</p>
                          <p className="mt-0.5 text-[12px] text-muted">
                            {cop(i.precio)} / caja · stock {i.stock}
                          </p>
                        </div>
                        <input
                          type="number"
                          min={1}
                          max={i.stock}
                          value={i.cantidad}
                          onChange={(e) =>
                            setCantidad(i.oferta_id, Math.max(1, Math.min(Number(e.target.value), i.stock)))
                          }
                          className="input w-[74px] flex-none py-2 text-center font-semibold"
                          aria-label={`Cantidad de ${i.nombre}`}
                        />
                        <p className="w-[86px] flex-none text-right font-display text-[14px] font-bold">
                          {cop(i.precio * i.cantidad)}
                        </p>
                        <button
                          type="button"
                          onClick={() => removeFromCart(i.oferta_id)}
                          className="flex-none text-muted transition hover:text-danger"
                          aria-label={`Quitar ${i.nombre}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between border-t border-line pt-2.5">
                    <p className="text-[12.5px] text-muted">Subtotal proveedor</p>
                    <p className="font-display text-[14.5px] font-bold">{cop(cartTotal(items))}</p>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>

      {cart.length > 0 && (
        <div
          className="fixed bottom-20 left-1/2 z-20 w-full max-w-[430px] -translate-x-1/2 border-t border-line bg-surface px-5 py-3.5"
          style={{ boxShadow: "0 -6px 20px rgba(15,23,42,.05)" }}
        >
          {error && <p className="mb-2 text-center text-[12.5px] text-danger">{error}</p>}
          <div className="mb-2.5 flex items-center justify-between">
            <p className="text-[13px] text-muted">
              Total ({grupos.length} orden{grupos.length !== 1 && "es"}) · IVA $0
            </p>
            <p className="font-display text-[18px] font-extrabold">{cop(cartTotal(cart))}</p>
          </div>
          {/* "Continuar pedido": volver a buscar SIN perder el carrito. */}
          <div className="flex gap-2.5">
            <Link href="/farmacia" className="flex-1">
              <Button variant="outline" size="lg" block disabled={enviando}>
                <Plus size={17} /> Continuar pedido
              </Button>
            </Link>
            <Button size="lg" block className="flex-1" disabled={enviando || !aprobada} onClick={confirmar}>
              {enviando ? "Confirmando…" : "Confirmar pedido"}
            </Button>
          </div>
          {!aprobada && (
            <p className="mt-2 text-center text-[12px] text-amber-700">
              Tu cuenta está en verificación: podrás confirmar el pedido cuando el equipo la
              apruebe. Tu carrito se conserva.
            </p>
          )}
        </div>
      )}
    </>
  );
}

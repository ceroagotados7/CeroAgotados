"use client";

import { ArrowRight, Boxes, Check, Tag } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { BackBar } from "@/components/shell";
import { Button, SearchBar, Spinner } from "@/components/ui";
import { api, ApiCallError } from "@/lib/api";
import { cop } from "@/lib/format";
import type { ProductoMaestro } from "@/lib/types";

type Seleccion = Record<string, { precio: string; stock: string }>;

export default function AgregarPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<ProductoMaestro[] | null>(null);
  const [sel, setSel] = useState<Seleccion>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const t = setTimeout(async () => {
      try {
        const data = await api.get<ProductoMaestro[]>(`/catalogo/?q=${encodeURIComponent(q)}`);
        if (active) setResultados(data);
      } catch {
        if (active) setResultados([]);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [q]);

  function toggle(p: ProductoMaestro) {
    setSel((prev) => {
      const next = { ...prev };
      if (next[p.id]) {
        delete next[p.id];
      } else {
        next[p.id] = {
          precio: p.precio_min_mercado ? String(p.precio_min_mercado) : "",
          stock: "",
        };
      }
      return next;
    });
  }

  function setCampo(id: string, campo: "precio" | "stock", valor: string) {
    setSel((prev) => ({ ...prev, [id]: { ...prev[id], [campo]: valor } }));
  }

  const seleccionados = Object.keys(sel);
  const listo = seleccionados.length > 0 && seleccionados.every((id) => Number(sel[id].precio) > 0);

  async function agregar() {
    setSaving(true);
    setError(null);
    try {
      const items = seleccionados.map((id) => ({
        producto_maestro_id: id,
        precio: Number(sel[id].precio),
        stock_disponible: Number(sel[id].stock || 0),
      }));
      await api.post("/ofertas/bulk", { items });
      router.push("/proveedor/catalogo");
    } catch (e) {
      setError(e instanceof ApiCallError ? e.message : "No se pudieron agregar los productos.");
      setSaving(false);
    }
  }

  return (
    <>
      <BackBar title="Agregar medicamentos" subtitle="Catálogo maestro INVIMA" backHref="/proveedor/catalogo" />

      <div className="px-5">
        <SearchBar
          value={q}
          onChange={setQ}
          placeholder="Buscar por nombre o principio activo…"
          className="mb-2"
          autoFocus
        />
        <p className="mb-2 px-1 text-[12px] text-muted">
          Marca lo que vas a ofertar y define <b>precio y stock</b>.
        </p>
      </div>

      <div className="px-5 pb-28 pt-1">
        {!resultados ? (
          <Spinner />
        ) : resultados.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            {q ? "Sin resultados en el catálogo maestro." : "No hay más productos por agregar."}
          </p>
        ) : (
          <div className="space-y-2.5">
            {resultados.map((p) => {
              const elegido = sel[p.id];
              const presentacion = [p.forma_farmaceutica, p.presentacion].filter(Boolean).join(" · ");
              if (elegido) {
                return (
                  <div key={p.id} className="card-flat border-primary bg-primary-50/40 p-3.5">
                    <button className="flex w-full items-start gap-3 text-left" onClick={() => toggle(p)}>
                      <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-md bg-primary text-white">
                        <Check size={15} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[14.5px] font-semibold leading-tight">{p.nombre}</p>
                        {p.precio_min_mercado != null && (
                          <div className="mt-2 flex w-fit items-center gap-1.5 rounded-lg bg-teal-50 px-2 py-1 text-[12px] text-teal-700">
                            <Tag size={13} /> Más bajo del mercado: <b>{cop(p.precio_min_mercado)}</b>
                          </div>
                        )}
                      </div>
                    </button>
                    <div className="mt-3 space-y-3 border-t border-primary-100 pt-3">
                      {presentacion && <p className="text-[12px] text-muted">{presentacion}</p>}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="label">Precio (caja)</label>
                          <div className="relative">
                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-semibold text-muted">$</span>
                            <input
                              type="number"
                              value={elegido.precio}
                              onChange={(e) => setCampo(p.id, "precio", e.target.value)}
                              className="input pl-8 font-semibold"
                              placeholder="0"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="label">Stock (cajas)</label>
                          <div className="relative">
                            <Boxes size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                            <input
                              type="number"
                              value={elegido.stock}
                              onChange={(e) => setCampo(p.id, "stock", e.target.value)}
                              className="input pl-9 font-semibold"
                              placeholder="0"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <button
                  key={p.id}
                  onClick={() => toggle(p)}
                  className="card-flat flex w-full items-start gap-3 p-3.5 text-left"
                >
                  <span className="mt-0.5 h-6 w-6 flex-none rounded-md border-2 border-slate-300" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] font-semibold leading-tight">{p.nombre}</p>
                    <p className="mt-0.5 text-[12px] text-muted">
                      {[presentacion, p.laboratorio].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {p.precio_min_mercado != null && (
                    <span className="mt-0.5 whitespace-nowrap text-[12px] text-muted">desde {cop(p.precio_min_mercado)}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer sticky: contador + CTA */}
      <div
        className="fixed bottom-0 left-1/2 z-20 flex w-full max-w-[430px] -translate-x-1/2 items-center gap-3 border-t border-line bg-surface px-5 py-3.5"
        style={{ boxShadow: "0 -6px 20px rgba(15,23,42,.05)" }}
      >
        <div className="flex-none">
          <p className="mb-1 text-[11px] leading-none text-muted">Seleccionados</p>
          <p className="font-display text-[16px] font-bold leading-none">{seleccionados.length}</p>
        </div>
        <Button size="lg" className="flex-1" disabled={!listo || saving} onClick={agregar}>
          {saving ? "Agregando…" : "Agregar a mi catálogo"} <ArrowRight size={18} />
        </Button>
      </div>
      {error && (
        <p className="fixed bottom-20 left-1/2 z-20 -translate-x-1/2 text-sm text-danger">{error}</p>
      )}
    </>
  );
}

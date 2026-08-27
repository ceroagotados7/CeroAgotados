"use client";

import { ArrowRight, Boxes, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { BackBar } from "@/components/shell";
import { Button, SearchBar, Spinner } from "@/components/ui";
import { api, ApiCallError } from "@/lib/api";
import type { CatalogoFacetas, ProductoMaestro } from "@/lib/types";

type Seleccion = Record<string, { precio: string; stock: string }>;

const PAGINA = 30;

export default function AgregarPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [forma, setForma] = useState("");
  const [laboratorio, setLaboratorio] = useState("");
  const [tipo, setTipo] = useState("");
  const [facetas, setFacetas] = useState<CatalogoFacetas | null>(null);
  const [resultados, setResultados] = useState<ProductoMaestro[] | null>(null);
  const [pagina, setPagina] = useState(0);
  const [hayMas, setHayMas] = useState(false);
  const [sel, setSel] = useState<Seleccion>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // El maestro tiene >24k productos: sin filtros la barra de búsqueda sola no basta.
  useEffect(() => {
    api
      .get<CatalogoFacetas>("/catalogo/facetas")
      .then(setFacetas)
      .catch(() => setFacetas(null));
  }, []);

  // Cambiar de búsqueda o de filtro reinicia la paginación.
  useEffect(() => {
    setPagina(0);
  }, [q, forma, laboratorio, tipo]);

  useEffect(() => {
    let active = true;
    const t = setTimeout(async () => {
      const params = new URLSearchParams({
        limit: String(PAGINA),
        offset: String(pagina * PAGINA),
      });
      if (q) params.set("q", q);
      if (forma) params.set("forma_farmaceutica", forma);
      if (laboratorio) params.set("laboratorio", laboratorio);
      if (tipo) params.set("tipo", tipo);
      try {
        const data = await api.get<ProductoMaestro[]>(`/catalogo/?${params}`);
        if (!active) return;
        // Una página llena sugiere que hay más; el backend no devuelve el total.
        setHayMas(data.length === PAGINA);
        setResultados((prev) => (pagina === 0 || !prev ? data : [...prev, ...data]));
      } catch {
        if (active) setResultados([]);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [q, forma, laboratorio, tipo, pagina]);

  const filtrosActivos = [forma, laboratorio, tipo].filter(Boolean).length;

  function limpiarFiltros() {
    setForma("");
    setLaboratorio("");
    setTipo("");
  }

  function toggle(p: ProductoMaestro) {
    setSel((prev) => {
      const next = { ...prev };
      if (next[p.id]) {
        delete next[p.id];
      } else {
        // Precio siempre vacío: el proveedor lo fija con total libertad, sin
        // ver ni heredar precios de la competencia (decisión del fundador).
        next[p.id] = { precio: "", stock: "" };
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
          placeholder="Marca, principio activo o laboratorio…"
          className="mb-2"
          autoFocus
        />

        {/* Filtros: con miles de medicamentos el proveedor piensa por forma
            farmacéutica, laboratorio y marca/genérico, no solo por nombre. */}
        {facetas && (
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="input h-9 w-auto flex-none py-0 text-[13px]"
            >
              <option value="">Marca y genérico</option>
              {facetas.tipos.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              value={forma}
              onChange={(e) => setForma(e.target.value)}
              className="input h-9 w-auto flex-none py-0 text-[13px]"
            >
              <option value="">Toda forma</option>
              {facetas.formas_farmaceuticas.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <select
              value={laboratorio}
              onChange={(e) => setLaboratorio(e.target.value)}
              className="input h-9 w-auto flex-none py-0 text-[13px]"
            >
              <option value="">Todo laboratorio</option>
              {facetas.laboratorios.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            {filtrosActivos > 0 && (
              <button
                onClick={limpiarFiltros}
                className="h-9 flex-none rounded-lg px-3 text-[13px] font-semibold text-primary"
              >
                Limpiar ({filtrosActivos})
              </button>
            )}
          </div>
        )}

        <p className="mb-2 px-1 text-[12px] text-muted">
          Marca lo que vas a ofertar y define <b>precio y stock</b>.
        </p>
      </div>

      <div className="px-5 pb-44 pt-1">
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
                        {/* Presentación y LABORATORIO se conservan al seleccionar
                            (feedback del fundador: antes desaparecían). */}
                        <p className="mt-0.5 text-[12px] text-muted">
                          {[presentacion, p.laboratorio].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                    </button>
                    <div className="mt-3 space-y-3 border-t border-primary-100 pt-3">
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
                    {/* El principio activo distingue marcas homónimas: con el maestro
                        real hay decenas de "Funzal"-como-marca por molécula. */}
                    {p.principio_activo && (
                      <p className="mt-0.5 text-[12px] font-medium text-slate-600">
                        {[p.principio_activo, p.concentracion].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    <p className="mt-0.5 text-[12px] text-muted">
                      {[presentacion, p.laboratorio].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </button>
              );
            })}

            {hayMas && (
              <button
                onClick={() => setPagina((n) => n + 1)}
                className="card-flat w-full py-3 text-center text-[13px] font-semibold text-primary"
              >
                Ver más resultados
              </button>
            )}
          </div>
        )}
      </div>

      {/* Footer sticky: contador + CTA */}
      <div
        className="fixed bottom-20 left-1/2 z-20 flex w-full max-w-[430px] -translate-x-1/2 items-center gap-3 border-t border-line bg-surface px-5 py-3.5"
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
        <p className="fixed bottom-40 left-1/2 z-20 -translate-x-1/2 text-sm text-danger">{error}</p>
      )}
    </>
  );
}

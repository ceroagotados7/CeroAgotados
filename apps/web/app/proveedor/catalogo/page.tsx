"use client";

import { AlertTriangle, Package, PauseCircle, Pencil, Pill, Plus, SlidersHorizontal, Trash2, UploadCloud, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AppBar } from "@/components/shell";
import { Badge, Button, Card, Chip, EmptyState, IconButton, Input, SearchBar, Spinner, Toggle } from "@/components/ui";
import { api, ApiCallError } from "@/lib/api";
import { cop } from "@/lib/format";
import { useMe } from "@/lib/me";
import type { Oferta } from "@/lib/types";

type Filtro = "todos" | "activos" | "agotados" | "pausados";
const STOCK_BAJO = 50;

// Prioridad de orden: activos (0) arriba, agotados (1) en medio, pausados (2) al fondo.
function rankEstado(o: Oferta): number {
  if (!o.activo) return 2;
  if (o.stock_disponible === 0) return 1;
  return 0;
}

export default function CatalogoPage() {
  const me = useMe();
  const [ofertas, setOfertas] = useState<Oferta[] | null>(null);
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");

  async function load() {
    setOfertas(await api.get<Oferta[]>("/ofertas/"));
  }
  useEffect(() => {
    let active = true;
    api
      .get<Oferta[]>("/ofertas/")
      .then((d) => active && setOfertas(d))
      .catch(() => active && setOfertas([]));
    return () => {
      active = false;
    };
  }, []);

  const counts = useMemo(() => {
    const list = ofertas ?? [];
    return {
      todos: list.length,
      activos: list.filter((o) => o.activo && o.stock_disponible > 0).length,
      agotados: list.filter((o) => o.stock_disponible === 0).length,
      pausados: list.filter((o) => !o.activo).length,
    };
  }, [ofertas]);

  const visibles = useMemo(() => {
    const list = ofertas ?? [];
    const term = q.trim().toLowerCase();
    const filtrados = list.filter((o) => {
      const matchQ = !term || (o.producto?.nombre ?? "").toLowerCase().includes(term);
      const matchF =
        filtro === "todos" ||
        (filtro === "activos" && o.activo && o.stock_disponible > 0) ||
        (filtro === "agotados" && o.stock_disponible === 0) ||
        (filtro === "pausados" && !o.activo);
      return matchQ && matchF;
    });
    // Orden por estado: activos arriba, agotados en medio, pausados al fondo (feedback fundador).
    return filtrados.sort((a, b) => rankEstado(a) - rankEstado(b));
  }, [ofertas, q, filtro]);

  return (
    <>
      <AppBar className="justify-between">
        <div className="min-w-0">
          <p className="mb-1 truncate text-[12px] leading-none text-muted">{me?.organizacion?.razon_social ?? " "}</p>
          <p className="font-display text-[20px] font-extrabold leading-none">Mi catálogo</p>
        </div>
        <IconButton aria-label="Filtros" className="flex-none">
          <SlidersHorizontal size={19} />
        </IconButton>
      </AppBar>

      <div className="px-5">
        <SearchBar value={q} onChange={setQ} placeholder="Buscar en mis medicamentos…" className="mb-3" />

        <div className="mb-3 grid grid-cols-2 gap-2.5">
          <Link href="/proveedor/carga-masiva">
            <Button variant="ghost" size="md" block>
              <UploadCloud size={17} /> Cargar archivo
            </Button>
          </Link>
          <Link href="/proveedor/agregar">
            <Button variant="outline" size="md" block>
              <Plus size={17} /> Agregar manual
            </Button>
          </Link>
        </div>

        <div className="no-scrollbar mb-1 flex gap-2 overflow-x-auto pb-1">
          <Chip active={filtro === "todos"} onClick={() => setFiltro("todos")}>
            Todos · {counts.todos}
          </Chip>
          <Chip active={filtro === "activos"} onClick={() => setFiltro("activos")}>
            Activos · {counts.activos}
          </Chip>
          <Chip active={filtro === "agotados"} onClick={() => setFiltro("agotados")}>
            Agotados · {counts.agotados}
          </Chip>
          <Chip active={filtro === "pausados"} onClick={() => setFiltro("pausados")}>
            Pausados · {counts.pausados}
          </Chip>
        </div>
      </div>

      <div className="px-5 pb-28 pt-2">
        {!ofertas ? (
          <Spinner />
        ) : ofertas.length === 0 ? (
          // Onboarding: proveedor nuevo, catálogo vacío.
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
              <Package size={30} />
            </span>
            <div>
              <p className="font-display text-[17px] font-bold leading-tight">Empieza tu catálogo</p>
              <p className="mx-auto mt-1 max-w-[16rem] text-[13px] text-muted">
                Elige medicamentos del catálogo maestro y fíjales precio y stock. En segundos apareces en la
                comparación de las farmacias.
              </p>
            </div>
            <div className="mt-1 grid w-full max-w-xs grid-cols-1 gap-2.5">
              <Link href="/proveedor/agregar">
                <Button variant="primary" size="lg" block>
                  <Plus size={18} /> Agregar mi primer medicamento
                </Button>
              </Link>
              <Link href="/proveedor/carga-masiva">
                <Button variant="ghost" size="md" block>
                  <UploadCloud size={17} /> Cargar por archivo
                </Button>
              </Link>
            </div>
          </div>
        ) : visibles.length === 0 ? (
          <EmptyState
            icon={<Package size={32} />}
            title="Sin resultados"
            hint="Prueba con otro filtro o búsqueda."
          />
        ) : (
          <div className="space-y-2.5">
            {visibles.map((o) => (
              <OfertaCard key={o.id} oferta={o} onReload={load} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function OfertaCard({ oferta, onReload }: { oferta: Oferta; onReload: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const agotado = oferta.stock_disponible === 0;
  const pausado = !oferta.activo;
  const bajo = oferta.stock_disponible > 0 && oferta.stock_disponible < STOCK_BAJO;

  if (editing) {
    return (
      <EditCard
        oferta={oferta}
        onDone={async () => {
          setEditing(false);
          await onReload();
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <Card className={`p-3.5 ${agotado ? "border border-danger-100" : ""} ${pausado ? "opacity-75" : ""}`}>
      <div className="flex items-start gap-3">
        <span
          className={`flex h-11 w-11 flex-none items-center justify-center rounded-xl ${
            agotado ? "bg-danger-50 text-danger" : pausado ? "bg-slate-100 text-muted" : "bg-primary-50 text-primary-700"
          }`}
        >
          <Pill size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold leading-tight">{oferta.producto?.nombre ?? "Producto"}</p>
          <p className="mt-0.5 text-[12px] text-muted">
            {[oferta.producto?.forma_farmaceutica, oferta.producto?.presentacion].filter(Boolean).join(" · ")}
          </p>
        </div>
        {/* El estado ya no se cambia aquí (era un toggle): se muestra como badge y se edita en "Editar". */}
        {pausado ? (
          <Badge tone="gray" className="flex-none">
            <PauseCircle size={12} /> Pausado
          </Badge>
        ) : agotado ? (
          <Badge tone="red" className="flex-none">
            <XCircle size={12} /> Agotado
          </Badge>
        ) : (
          <Badge tone="green" className="flex-none">
            Activo
          </Badge>
        )}
      </div>

      <div className="mt-3 flex items-center gap-4 border-t border-line pt-3">
        <div>
          <p className="mb-1 text-[10.5px] leading-none text-muted">Precio</p>
          <p className={`font-display text-[15px] font-bold ${agotado ? "" : "text-primary-800"}`}>{cop(oferta.precio)}</p>
        </div>
        <div>
          <p className="mb-1 text-[10.5px] leading-none text-muted">Stock</p>
          <p
            className={`flex items-center gap-1 font-display text-[15px] font-bold ${
              agotado ? "text-danger" : bajo ? "text-amber-600" : ""
            }`}
          >
            {oferta.stock_disponible}
            {bajo && <AlertTriangle size={13} />}
            {!agotado && !bajo && <span className="text-[10.5px] font-medium text-muted">cajas</span>}
          </p>
        </div>
        {agotado ? (
          <Button variant="primary" size="sm" className="ml-auto" onClick={() => setEditing(true)}>
            <Plus size={14} /> Reponer stock
          </Button>
        ) : (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setEditing(true)}>
            <Pencil size={14} /> Editar
          </Button>
        )}
      </div>
    </Card>
  );
}

function EditCard({
  oferta,
  onDone,
  onCancel,
}: {
  oferta: Oferta;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [precio, setPrecio] = useState(String(oferta.precio));
  const [stock, setStock] = useState(String(oferta.stock_disponible));
  const [activo, setActivo] = useState(oferta.activo);
  const [saving, setSaving] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [sacando, setSacando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/ofertas/${oferta.id}`, {
        precio: Number(precio),
        stock_disponible: Number(stock),
        activo,
      });
      onDone();
    } catch (e) {
      setError(e instanceof ApiCallError ? e.message : "No se pudo guardar.");
      setSaving(false);
    }
  }

  async function sacar() {
    setSacando(true);
    setError(null);
    try {
      await api.del(`/ofertas/${oferta.id}`);
      onDone();
    } catch (e) {
      // Una oferta con historial de órdenes no se puede borrar: solo pausar.
      const msg =
        e instanceof ApiCallError && e.code === "oferta_en_orden"
          ? "Tiene órdenes asociadas: no se puede sacar, solo pausar (desactiva la oferta arriba)."
          : e instanceof ApiCallError
            ? e.message
            : "No se pudo sacar del catálogo.";
      setError(msg);
      setSacando(false);
      setConfirmar(false);
    }
  }

  return (
    <Card className="p-3.5">
      <p className="mb-3 text-[14.5px] font-semibold leading-tight">{oferta.producto?.nombre ?? "Producto"}</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Precio (caja)</label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-semibold text-muted">$</span>
            <Input type="number" value={precio} onChange={(e) => setPrecio(e.target.value)} className="pl-8 font-semibold" />
          </div>
        </div>
        <div>
          <label className="label">Stock (cajas)</label>
          <Input type="number" value={stock} onChange={(e) => setStock(e.target.value)} className="font-semibold" />
        </div>
      </div>

      {/* Activar / pausar la oferta (antes era un toggle en la card). */}
      <div className="mt-3 flex items-center justify-between rounded-xl bg-canvas px-3.5 py-2.5">
        <div>
          <p className="text-[13.5px] font-semibold leading-tight">Oferta activa</p>
          <p className="text-[11.5px] text-muted">{activo ? "Visible para las farmacias" : "Pausada, no aparece en la comparación"}</p>
        </div>
        <Toggle checked={activo} onChange={setActivo} label="Oferta activa" />
      </div>

      <div className="mt-3 flex gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} className="flex-1">
          Cancelar
        </Button>
        <Button variant="primary" size="sm" onClick={save} disabled={saving || !precio} className="flex-1">
          {saving ? "Guardando…" : "Guardar"}
        </Button>
      </div>

      {/* Sacar del catálogo (DELETE) con confirmación inline, sin diálogos nativos. */}
      <div className="mt-3 border-t border-line pt-3">
        {!confirmar ? (
          <button
            type="button"
            onClick={() => setConfirmar(true)}
            className="flex w-full items-center justify-center gap-1.5 text-[13px] font-semibold text-danger"
          >
            <Trash2 size={15} /> Sacar del catálogo
          </button>
        ) : (
          <div className="rounded-xl bg-danger-50 p-3 text-center">
            <p className="mb-2 text-[13px] font-medium text-danger">¿Sacar este medicamento de tu catálogo?</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmar(false)} className="flex-1" disabled={sacando}>
                No
              </Button>
              <Button variant="dark" size="sm" onClick={sacar} className="flex-1" disabled={sacando}>
                {sacando ? "Sacando…" : "Sí, sacar"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {error && <p className="mt-2 text-center text-[12.5px] text-danger">{error}</p>}
    </Card>
  );
}

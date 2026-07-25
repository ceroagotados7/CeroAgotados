"use client";

import { AlertTriangle, Package, Pencil, Pill, Plus, SlidersHorizontal, UploadCloud, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AppBar } from "@/components/shell";
import { Badge, Button, Card, Chip, EmptyState, IconButton, Input, SearchBar, Spinner, Toggle } from "@/components/ui";
import { api } from "@/lib/api";
import { cop } from "@/lib/format";
import { useMe } from "@/lib/me";
import type { Oferta } from "@/lib/types";

type Filtro = "todos" | "activos" | "agotados" | "pausados";
const STOCK_BAJO = 50;

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
    return list.filter((o) => {
      const matchQ = !term || (o.producto?.nombre ?? "").toLowerCase().includes(term);
      const matchF =
        filtro === "todos" ||
        (filtro === "activos" && o.activo && o.stock_disponible > 0) ||
        (filtro === "agotados" && o.stock_disponible === 0) ||
        (filtro === "pausados" && !o.activo);
      return matchQ && matchF;
    });
  }, [ofertas, q, filtro]);

  // Actualiza una oferta en memoria tras un cambio (toggle/edición).
  function patchLocal(id: string, cambios: Partial<Oferta>) {
    setOfertas((prev) => prev?.map((o) => (o.id === id ? { ...o, ...cambios } : o)) ?? prev);
  }

  return (
    <>
      <AppBar className="justify-between">
        <div className="min-w-0">
          <p className="mb-1 truncate text-[12px] leading-none text-muted">{me?.organizacion.razon_social ?? " "}</p>
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
        ) : visibles.length === 0 ? (
          <EmptyState
            icon={<Package size={32} />}
            title={ofertas.length === 0 ? "Aún no ofreces productos" : "Sin resultados"}
            hint={
              ofertas.length === 0
                ? "Agrega un medicamento del catálogo y fija su precio."
                : "Prueba con otro filtro o búsqueda."
            }
          />
        ) : (
          <div className="space-y-2.5">
            {visibles.map((o) => (
              <OfertaCard key={o.id} oferta={o} onPatch={patchLocal} onReload={load} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function OfertaCard({
  oferta,
  onPatch,
  onReload,
}: {
  oferta: Oferta;
  onPatch: (id: string, cambios: Partial<Oferta>) => void;
  onReload: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const agotado = oferta.stock_disponible === 0;
  const bajo = oferta.stock_disponible > 0 && oferta.stock_disponible < STOCK_BAJO;

  async function toggleActivo(next: boolean) {
    setToggling(true);
    onPatch(oferta.id, { activo: next }); // optimista
    try {
      await api.patch(`/ofertas/${oferta.id}`, { activo: next });
    } catch {
      onPatch(oferta.id, { activo: !next }); // revertir
    } finally {
      setToggling(false);
    }
  }

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
    <Card className={`p-3.5 ${agotado ? "border border-danger-100" : ""}`}>
      <div className="flex items-start gap-3">
        <span
          className={`flex h-11 w-11 flex-none items-center justify-center rounded-xl ${
            agotado ? "bg-danger-50 text-danger" : "bg-primary-50 text-primary-700"
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
        {agotado ? (
          <Badge tone="red" className="flex-none">
            <XCircle size={12} /> Agotado
          </Badge>
        ) : (
          <div className={toggling ? "pointer-events-none opacity-60" : ""}>
            <Toggle checked={oferta.activo} onChange={toggleActivo} label="Activo" />
          </div>
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
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.patch(`/ofertas/${oferta.id}`, {
        precio: Number(precio),
        stock_disponible: Number(stock),
      });
      onDone();
    } finally {
      setSaving(false);
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
      <div className="mt-3 flex gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} className="flex-1">
          Cancelar
        </Button>
        <Button variant="primary" size="sm" onClick={save} disabled={saving || !precio} className="flex-1">
          {saving ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </Card>
  );
}

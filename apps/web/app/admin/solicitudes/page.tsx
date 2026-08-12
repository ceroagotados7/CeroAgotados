"use client";

import { CheckCircle2, FlaskConical, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { BackBar } from "@/components/shell";
import { Badge, Button, Card, Chip, EmptyState, Input, Spinner } from "@/components/ui";
import { api, ApiCallError } from "@/lib/api";
import { hace } from "@/lib/format";
import type { SolicitudesAdminResult, SolicitudMaestroAdmin } from "@/lib/types";

type Filtro = "pendiente" | "agregada" | "descartada" | "todas";

export default function SolicitudesAdminPage() {
  const [data, setData] = useState<SolicitudesAdminResult | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("pendiente");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setData(await api.get<SolicitudesAdminResult>("/admin/solicitudes"));
  }
  useEffect(() => {
    let active = true;
    api
      .get<SolicitudesAdminResult>("/admin/solicitudes")
      .then((d) => active && setData(d))
      .catch(() => active && setError("No se pudo cargar la bandeja."));
    return () => {
      active = false;
    };
  }, []);

  if (error) return <p className="px-5 pt-4 text-danger">{error}</p>;
  if (!data) return <Spinner />;

  const visibles = data.solicitudes.filter((s) => filtro === "todas" || s.estado === filtro);

  return (
    <>
      <BackBar title="Solicitudes de medicamentos" subtitle="Catálogo maestro" backHref="/admin" />

      <div className="px-5">
        <div className="no-scrollbar mb-1 flex gap-2 overflow-x-auto pb-1">
          <Chip active={filtro === "pendiente"} onClick={() => setFiltro("pendiente")}>
            Pendientes · {data.conteos.pendiente ?? 0}
          </Chip>
          <Chip active={filtro === "agregada"} onClick={() => setFiltro("agregada")}>
            Agregadas · {data.conteos.agregada ?? 0}
          </Chip>
          <Chip active={filtro === "descartada"} onClick={() => setFiltro("descartada")}>
            Descartadas · {data.conteos.descartada ?? 0}
          </Chip>
          <Chip active={filtro === "todas"} onClick={() => setFiltro("todas")}>
            Todas
          </Chip>
        </div>
      </div>

      <div className="px-5 pb-28 pt-2">
        {visibles.length === 0 ? (
          <EmptyState
            icon={<FlaskConical size={32} />}
            title={filtro === "pendiente" ? "Nada por curar" : "Sin solicitudes aquí"}
            hint="Cuando un proveedor cargue medicamentos fuera del maestro, aparecerán acá."
          />
        ) : (
          <div className="space-y-2.5">
            {visibles.map((s) => (
              <SolicitudCard key={s.id} solicitud={s} onReload={load} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function SolicitudCard({
  solicitud,
  onReload,
}: {
  solicitud: SolicitudMaestroAdmin;
  onReload: () => Promise<void>;
}) {
  const [modo, setModo] = useState<"agregar" | "descartar" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Formulario de curaduría, prellenado con lo que escribió el proveedor.
  const [form, setForm] = useState({
    nombre: solicitud.nombre,
    principio_activo: "",
    concentracion: "",
    forma_farmaceutica: "",
    presentacion: solicitud.presentacion ?? "",
    laboratorio: "",
    categoria: "",
  });
  const [motivo, setMotivo] = useState("");

  async function decidir(accion: "agregada" | "descartada") {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/admin/solicitudes/${solicitud.id}/decision`, {
        accion,
        motivo: motivo.trim() || null,
        ...(accion === "agregada" ? form : {}),
      });
      await onReload();
    } catch (e) {
      setError(e instanceof ApiCallError ? e.message : "No se pudo aplicar la decisión.");
      setBusy(false);
    }
  }

  const campo = (k: keyof typeof form, label: string, placeholder = "") => (
    <div>
      <label className="label">{label}</label>
      <Input
        value={form[k]}
        onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
        placeholder={placeholder}
      />
    </div>
  );

  return (
    <Card className="p-3.5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold leading-tight">{solicitud.nombre}</p>
          <p className="mt-0.5 text-[12px] text-muted">
            {[solicitud.presentacion, solicitud.unidades && `${solicitud.unidades} und`]
              .filter(Boolean)
              .join(" · ") || "Sin detalle"}
          </p>
          <p className="mt-0.5 text-[11.5px] text-muted">
            Pedido por <b>{solicitud.proveedor}</b> · {hace(solicitud.created_at)}
          </p>
        </div>
        <Badge
          tone={solicitud.estado === "pendiente" ? "amber" : solicitud.estado === "agregada" ? "green" : "gray"}
          className="flex-none"
        >
          {solicitud.estado === "pendiente" ? "Pendiente" : solicitud.estado === "agregada" ? "Agregada" : "Descartada"}
        </Badge>
      </div>

      {solicitud.motivo_decision && (
        <p className="mt-2 rounded-lg bg-canvas px-3 py-2 text-[12px] text-muted">
          Motivo: {solicitud.motivo_decision}
        </p>
      )}

      {solicitud.estado === "pendiente" && (
        <>
          {modo === null && (
            <div className="mt-3 flex gap-2 border-t border-line pt-3">
              <Button size="sm" className="flex-1" onClick={() => setModo("agregar")}>
                <CheckCircle2 size={14} /> Agregar al maestro
              </Button>
              <Button variant="outline" size="sm" className="flex-1 text-danger" onClick={() => setModo("descartar")}>
                <XCircle size={14} /> Descartar
              </Button>
            </div>
          )}

          {modo === "agregar" && (
            <div className="mt-3 space-y-2.5 border-t border-line pt-3">
              {campo("nombre", "Nombre canónico *")}
              <div className="grid grid-cols-2 gap-2">
                {campo("principio_activo", "Principio activo", "Ej: Metamizol")}
                {campo("concentracion", "Concentración", "Ej: 500mg")}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {campo("forma_farmaceutica", "Forma", "Ej: Tableta")}
                {campo("presentacion", "Presentación", "Ej: Caja x 10")}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {campo("laboratorio", "Laboratorio", "Ej: Genfar")}
                {campo("categoria", "Categoría", "Ej: Analgésico")}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" disabled={busy} onClick={() => setModo(null)}>
                  Cancelar
                </Button>
                <Button size="sm" className="flex-1" disabled={busy || !form.nombre.trim()} onClick={() => decidir("agregada")}>
                  {busy ? "Agregando…" : "Confirmar y agregar"}
                </Button>
              </div>
            </div>
          )}

          {modo === "descartar" && (
            <div className="mt-3 border-t border-line pt-3">
              <label className="label">Motivo del descarte (lo verá el proveedor)</label>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className="input min-h-[64px] w-full py-2.5"
                placeholder="Ej: ya existe en el maestro como Dipirona 500mg."
              />
              <div className="mt-2 flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" disabled={busy} onClick={() => setModo(null)}>
                  Cancelar
                </Button>
                <Button variant="dark" size="sm" className="flex-1" disabled={busy || !motivo.trim()} onClick={() => decidir("descartada")}>
                  {busy ? "Descartando…" : "Confirmar descarte"}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {error && <p className="mt-2 text-center text-[12.5px] text-danger">{error}</p>}
    </Card>
  );
}

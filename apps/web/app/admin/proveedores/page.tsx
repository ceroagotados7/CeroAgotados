"use client";

import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  Clock,
  ExternalLink,
  Factory,
  FileText,
  PauseCircle,
  Store,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { AppBar } from "@/components/shell";
import { Avatar, Badge, Button, Card, Chip, EmptyState, Spinner } from "@/components/ui";
import { api, ApiCallError } from "@/lib/api";
import { hace, iniciales } from "@/lib/format";
import type {
  AdminDocumento,
  AdminDocumentosResult,
  EstadoVerificacion,
  FarmaciaAdminItem,
  FarmaciasAdminResult,
  ProveedorAdminItem,
  ProveedoresAdminResult,
} from "@/lib/types";

type Filtro = "en_revision" | "aprobado" | "rechazado" | "suspendido" | "todos";
type Pestana = "proveedores" | "farmacias";

const ESTADO_LABEL: Record<EstadoVerificacion, string> = {
  en_revision: "En revisión",
  aprobado: "Al aire",
  rechazado: "Rechazado",
  suspendido: "Suspendido",
};

const ESTADO_TONE: Record<EstadoVerificacion, "amber" | "green" | "red" | "gray"> = {
  en_revision: "amber",
  aprobado: "green",
  rechazado: "red",
  suspendido: "gray",
};

const DOC_LABEL: Record<string, string> = {
  camara_comercio: "Cámara de comercio",
  nit_rut: "NIT / RUT",
  cedula_representante: "Cédula representante",
};

export default function OrganizacionesAdminPage() {
  const [pestana, setPestana] = useState<Pestana>("proveedores");
  const [proveedores, setProveedores] = useState<ProveedoresAdminResult | null>(null);
  const [farmacias, setFarmacias] = useState<FarmaciasAdminResult | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("en_revision");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [p, f] = await Promise.all([
      api.get<ProveedoresAdminResult>("/admin/proveedores"),
      api.get<FarmaciasAdminResult>("/admin/farmacias"),
    ]);
    setProveedores(p);
    setFarmacias(f);
  }
  useEffect(() => {
    let active = true;
    Promise.all([
      api.get<ProveedoresAdminResult>("/admin/proveedores"),
      api.get<FarmaciasAdminResult>("/admin/farmacias"),
    ])
      .then(([p, f]) => {
        if (!active) return;
        setProveedores(p);
        setFarmacias(f);
      })
      .catch(() => active && setError("No se pudo cargar la bandeja."));
    return () => {
      active = false;
    };
  }, []);

  if (error) return <p className="px-5 pt-4 text-danger">{error}</p>;
  if (!proveedores || !farmacias) return <Spinner />;

  const conteos = pestana === "proveedores" ? proveedores.conteos : farmacias.conteos;
  const visiblesP = proveedores.proveedores.filter(
    (p) => filtro === "todos" || p.estado_verificacion === filtro,
  );
  const visiblesF = farmacias.farmacias.filter(
    (f) => filtro === "todos" || f.estado_verificacion === filtro,
  );
  const vacio = pestana === "proveedores" ? visiblesP.length === 0 : visiblesF.length === 0;

  return (
    <>
      <AppBar>
        <div className="min-w-0">
          <p className="mb-1 text-[12px] leading-none text-muted">Panel administrador</p>
          <p className="font-display text-[20px] font-extrabold leading-none">Verificación</p>
        </div>
      </AppBar>

      <div className="px-5">
        {/* Pestañas por tipo de organización (el gate aplica a AMBOS lados). */}
        <div className="mb-2 flex rounded-xl border border-line bg-canvas p-1">
          {(
            [
              { id: "proveedores", label: "Proveedores", icon: Factory, n: proveedores.conteos.en_revision ?? 0 },
              { id: "farmacias", label: "Farmacias", icon: Store, n: farmacias.conteos.en_revision ?? 0 },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setPestana(t.id)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-semibold transition ${
                pestana === t.id ? "bg-surface shadow-sm" : "text-muted"
              }`}
            >
              <t.icon size={15} /> {t.label}
              {t.n > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9.5px] font-bold leading-none text-white">
                  {t.n}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="no-scrollbar mb-1 flex gap-2 overflow-x-auto pb-1">
          <Chip active={filtro === "en_revision"} onClick={() => setFiltro("en_revision")}>
            En revisión · {conteos.en_revision ?? 0}
          </Chip>
          <Chip active={filtro === "aprobado"} onClick={() => setFiltro("aprobado")}>
            Al aire · {conteos.aprobado ?? 0}
          </Chip>
          <Chip active={filtro === "rechazado"} onClick={() => setFiltro("rechazado")}>
            Rechazados · {conteos.rechazado ?? 0}
          </Chip>
          <Chip active={filtro === "suspendido"} onClick={() => setFiltro("suspendido")}>
            Suspendidos · {conteos.suspendido ?? 0}
          </Chip>
          <Chip active={filtro === "todos"} onClick={() => setFiltro("todos")}>
            Todos
          </Chip>
        </div>
      </div>

      <div className="px-5 pb-28 pt-2">
        {vacio ? (
          <EmptyState
            icon={pestana === "proveedores" ? <Factory size={32} /> : <Store size={32} />}
            title={filtro === "en_revision" ? "Nada por revisar" : "Sin organizaciones aquí"}
            hint={
              filtro === "en_revision"
                ? "Cuando alguien se registre aparecerá en esta bandeja."
                : "Prueba con otro filtro."
            }
          />
        ) : (
          <div className="space-y-2.5">
            {pestana === "proveedores"
              ? visiblesP.map((p) => <OrgCard key={p.id} org={p} tipo="proveedores" onReload={load} />)
              : visiblesF.map((f) => <OrgCard key={f.id} org={f} tipo="farmacias" onReload={load} />)}
          </div>
        )}
      </div>
    </>
  );
}

function OrgCard({
  org,
  tipo,
  onReload,
}: {
  org: ProveedorAdminItem | FarmaciaAdminItem;
  tipo: Pestana;
  onReload: () => Promise<void>;
}) {
  const [accionando, setAccionando] = useState(false);
  const [pidiendoMotivo, setPidiendoMotivo] = useState<"rechazado" | "suspendido" | null>(null);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const estado = org.estado_verificacion;
  const actividad =
    "medicamentos" in org ? `${org.medicamentos} medicamentos` : `${org.pedidos} pedidos`;

  async function decidir(accion: EstadoVerificacion, conMotivo?: string) {
    setAccionando(true);
    setError(null);
    try {
      await api.post(`/admin/${tipo}/${org.id}/decision`, { accion, motivo: conMotivo ?? null });
      setPidiendoMotivo(null);
      setMotivo("");
      await onReload();
    } catch (e) {
      setError(e instanceof ApiCallError ? e.message : "No se pudo aplicar la decisión.");
    } finally {
      setAccionando(false);
    }
  }

  return (
    <Card className="p-3.5">
      <div className="flex items-start gap-3">
        <Avatar className={`h-11 w-11 text-[14px] ${tipo === "proveedores" ? "bg-primary" : "bg-teal-600"}`}>
          {iniciales(org.razon_social)}
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold leading-tight">{org.razon_social}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
            {org.nit && (
              <span className="flex items-center gap-1">
                <Building2 size={11} /> NIT {org.nit}
              </span>
            )}
            {org.ciudad && <span>{org.ciudad}</span>}
            <span>· {actividad} · {hace(org.created_at)}</span>
          </p>
        </div>
        <Badge tone={ESTADO_TONE[estado]} className="flex-none">
          {estado === "en_revision" && <Clock size={12} />}
          {estado === "aprobado" && <BadgeCheck size={12} />}
          {(estado === "rechazado" || estado === "suspendido") && <XCircle size={12} />}
          {ESTADO_LABEL[estado]}
        </Badge>
      </div>

      {org.motivo_decision && estado !== "aprobado" && (
        <p className="mt-2 rounded-lg bg-canvas px-3 py-2 text-[12px] text-muted">
          Motivo: {org.motivo_decision}
        </p>
      )}

      {/* Documentación legal: se revisa aquí mismo, junto a la decisión. */}
      <DocumentosAdmin orgId={org.id} />

      {/* Acciones según estado */}
      {pidiendoMotivo ? (
        <div className="mt-3 border-t border-line pt-3">
          <label className="label">
            Motivo de {pidiendoMotivo === "rechazado" ? "rechazo" : "suspensión"} (lo verá la organización)
          </label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className="input min-h-[70px] w-full py-2.5"
            placeholder="Ej: no fue posible verificar el NIT ante la DIAN."
          />
          <div className="mt-2 flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" disabled={accionando} onClick={() => setPidiendoMotivo(null)}>
              Cancelar
            </Button>
            <Button
              variant="dark"
              size="sm"
              className="flex-1"
              disabled={accionando || !motivo.trim()}
              onClick={() => decidir(pidiendoMotivo, motivo.trim())}
            >
              {accionando ? "Aplicando…" : `Confirmar ${pidiendoMotivo === "rechazado" ? "rechazo" : "suspensión"}`}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-2 border-t border-line pt-3">
          {estado !== "aprobado" && (
            <Button size="sm" className="flex-1" disabled={accionando} onClick={() => decidir("aprobado")}>
              <CheckCircle2 size={14} /> {estado === "en_revision" ? "Aprobar" : "Reactivar"}
            </Button>
          )}
          {estado === "en_revision" && (
            <Button variant="outline" size="sm" className="flex-1 text-danger" disabled={accionando} onClick={() => setPidiendoMotivo("rechazado")}>
              <XCircle size={14} /> Rechazar
            </Button>
          )}
          {estado === "aprobado" && (
            <>
              {tipo === "proveedores" && (
                <Link href={`/admin/proveedores/${org.id}`} className="flex-1">
                  <Button variant="ghost" size="sm" block>
                    Ver métricas
                  </Button>
                </Link>
              )}
              <Button variant="outline" size="sm" className="flex-1 text-danger" disabled={accionando} onClick={() => setPidiendoMotivo("suspendido")}>
                <PauseCircle size={14} /> Suspender
              </Button>
            </>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-center text-[12.5px] text-danger">{error}</p>}
    </Card>
  );
}

/** Documentos de la organización, colapsados hasta que el admin los abre. */
function DocumentosAdmin({ orgId }: { orgId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [data, setData] = useState<AdminDocumentosResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setData(await api.get<AdminDocumentosResult>(`/admin/organizaciones/${orgId}/documentos`));
    } catch {
      setError("No se pudieron cargar los documentos.");
    }
  }

  async function abrir() {
    setAbierto((v) => !v);
    if (!data) await load();
  }

  return (
    <div className="mt-2.5">
      <button
        type="button"
        onClick={abrir}
        className="flex items-center gap-1.5 text-[12.5px] font-semibold text-teal-700 underline"
      >
        <FileText size={13} /> {abierto ? "Ocultar documentación" : "Revisar documentación legal"}
      </button>

      {abierto && (
        <div className="mt-2 space-y-1.5">
          {error && <p className="text-[12px] text-danger">{error}</p>}
          {!data && !error && <p className="text-[12px] text-muted">Cargando…</p>}
          {data && data.documentos.length === 0 && (
            <p className="rounded-lg bg-canvas px-3 py-2 text-[12px] text-muted">
              Aún no ha subido ningún documento (se requieren {data.tipos_requeridos.length}).
            </p>
          )}
          {data?.documentos.map((d) => (
            <DocumentoAdminFila key={d.id} doc={d} onCambio={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function DocumentoAdminFila({ doc, onCambio }: { doc: AdminDocumento; onCambio: () => Promise<void> }) {
  const [accionando, setAccionando] = useState(false);
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false);
  const [motivo, setMotivo] = useState("");

  async function decidir(accion: "aprobado" | "rechazado", conMotivo?: string) {
    setAccionando(true);
    try {
      await api.post(`/admin/documentos/${doc.id}/decision`, { accion, motivo: conMotivo ?? null });
      setPidiendoMotivo(false);
      setMotivo("");
      await onCambio();
    } finally {
      setAccionando(false);
    }
  }

  return (
    <div className="rounded-lg border border-line px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold leading-tight">{DOC_LABEL[doc.tipo] ?? doc.tipo}</p>
          <p className="truncate text-[11.5px] text-muted">{doc.nombre_archivo}</p>
        </div>
        <Badge
          tone={doc.estado === "aprobado" ? "green" : doc.estado === "rechazado" ? "red" : "amber"}
          className="flex-none"
        >
          {doc.estado === "aprobado" ? "OK" : doc.estado === "rechazado" ? "Rechazado" : "Por revisar"}
        </Badge>
        {doc.url && (
          <a
            href={doc.url}
            target="_blank"
            rel="noreferrer"
            className="flex flex-none items-center gap-1 text-[12px] font-semibold text-teal-700 underline"
          >
            Ver <ExternalLink size={12} />
          </a>
        )}
      </div>

      {pidiendoMotivo ? (
        <div className="mt-2">
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className="input w-full py-2 text-[12.5px]"
            placeholder="Motivo del rechazo (lo verá la organización)"
          />
          <div className="mt-1.5 flex gap-1.5">
            <Button variant="outline" size="sm" className="flex-1" disabled={accionando} onClick={() => setPidiendoMotivo(false)}>
              Cancelar
            </Button>
            <Button variant="dark" size="sm" className="flex-1" disabled={accionando || !motivo.trim()} onClick={() => decidir("rechazado", motivo.trim())}>
              Rechazar doc.
            </Button>
          </div>
        </div>
      ) : (
        doc.estado === "subido" && (
          <div className="mt-1.5 flex gap-1.5">
            <Button size="sm" className="flex-1" disabled={accionando} onClick={() => decidir("aprobado")}>
              <CheckCircle2 size={13} /> Aprobar doc.
            </Button>
            <Button variant="outline" size="sm" className="flex-1 text-danger" disabled={accionando} onClick={() => setPidiendoMotivo(true)}>
              Rechazar
            </Button>
          </div>
        )
      )}
    </div>
  );
}

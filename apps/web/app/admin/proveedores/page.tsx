"use client";

import { BadgeCheck, Building2, CheckCircle2, Clock, Factory, PauseCircle, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { AppBar } from "@/components/shell";
import { Avatar, Badge, Button, Card, Chip, EmptyState, Spinner } from "@/components/ui";
import { api, ApiCallError } from "@/lib/api";
import { hace, iniciales } from "@/lib/format";
import type { EstadoVerificacion, ProveedorAdminItem, ProveedoresAdminResult } from "@/lib/types";

type Filtro = "en_revision" | "aprobado" | "rechazado" | "suspendido" | "todos";

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

export default function ProveedoresAdminPage() {
  const [data, setData] = useState<ProveedoresAdminResult | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("en_revision");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setData(await api.get<ProveedoresAdminResult>("/admin/proveedores"));
  }
  useEffect(() => {
    let active = true;
    api
      .get<ProveedoresAdminResult>("/admin/proveedores")
      .then((d) => active && setData(d))
      .catch(() => active && setError("No se pudo cargar la bandeja."));
    return () => {
      active = false;
    };
  }, []);

  if (error) return <p className="px-5 pt-4 text-danger">{error}</p>;
  if (!data) return <Spinner />;

  const visibles = data.proveedores.filter(
    (p) => filtro === "todos" || p.estado_verificacion === filtro,
  );

  return (
    <>
      <AppBar>
        <div className="min-w-0">
          <p className="mb-1 text-[12px] leading-none text-muted">Panel administrador</p>
          <p className="font-display text-[20px] font-extrabold leading-none">Proveedores</p>
        </div>
      </AppBar>

      <div className="px-5">
        <div className="no-scrollbar mb-1 flex gap-2 overflow-x-auto pb-1">
          <Chip active={filtro === "en_revision"} onClick={() => setFiltro("en_revision")}>
            En revisión · {data.conteos.en_revision ?? 0}
          </Chip>
          <Chip active={filtro === "aprobado"} onClick={() => setFiltro("aprobado")}>
            Al aire · {data.conteos.aprobado ?? 0}
          </Chip>
          <Chip active={filtro === "rechazado"} onClick={() => setFiltro("rechazado")}>
            Rechazados · {data.conteos.rechazado ?? 0}
          </Chip>
          <Chip active={filtro === "suspendido"} onClick={() => setFiltro("suspendido")}>
            Suspendidos · {data.conteos.suspendido ?? 0}
          </Chip>
          <Chip active={filtro === "todos"} onClick={() => setFiltro("todos")}>
            Todos
          </Chip>
        </div>
      </div>

      <div className="px-5 pb-28 pt-2">
        {visibles.length === 0 ? (
          <EmptyState
            icon={<Factory size={32} />}
            title={filtro === "en_revision" ? "Nada por revisar" : "Sin proveedores aquí"}
            hint={
              filtro === "en_revision"
                ? "Cuando un proveedor se registre aparecerá en esta bandeja."
                : "Prueba con otro filtro."
            }
          />
        ) : (
          <div className="space-y-2.5">
            {visibles.map((p) => (
              <ProveedorCard key={p.id} proveedor={p} onReload={load} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function ProveedorCard({
  proveedor,
  onReload,
}: {
  proveedor: ProveedorAdminItem;
  onReload: () => Promise<void>;
}) {
  const [accionando, setAccionando] = useState(false);
  const [pidiendoMotivo, setPidiendoMotivo] = useState<"rechazado" | "suspendido" | null>(null);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const estado = proveedor.estado_verificacion;

  async function decidir(accion: EstadoVerificacion, conMotivo?: string) {
    setAccionando(true);
    setError(null);
    try {
      await api.post(`/admin/proveedores/${proveedor.id}/decision`, {
        accion,
        motivo: conMotivo ?? null,
      });
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
        <Avatar className="h-11 w-11 bg-primary text-[14px]">{iniciales(proveedor.razon_social)}</Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold leading-tight">{proveedor.razon_social}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
            {proveedor.nit && (
              <span className="flex items-center gap-1">
                <Building2 size={11} /> NIT {proveedor.nit}
              </span>
            )}
            {proveedor.ciudad && <span>{proveedor.ciudad}</span>}
            <span>· {proveedor.medicamentos} medicamentos · {hace(proveedor.created_at)}</span>
          </p>
        </div>
        <Badge tone={ESTADO_TONE[estado]} className="flex-none">
          {estado === "en_revision" && <Clock size={12} />}
          {estado === "aprobado" && <BadgeCheck size={12} />}
          {(estado === "rechazado" || estado === "suspendido") && <XCircle size={12} />}
          {ESTADO_LABEL[estado]}
        </Badge>
      </div>

      {proveedor.motivo_decision && estado !== "aprobado" && (
        <p className="mt-2 rounded-lg bg-canvas px-3 py-2 text-[12px] text-muted">
          Motivo: {proveedor.motivo_decision}
        </p>
      )}

      {/* Acciones según estado */}
      {pidiendoMotivo ? (
        <div className="mt-3 border-t border-line pt-3">
          <label className="label">
            Motivo de {pidiendoMotivo === "rechazado" ? "rechazo" : "suspensión"} (lo verá el proveedor)
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
              <Link href={`/admin/proveedores/${proveedor.id}`} className="flex-1">
                <Button variant="ghost" size="sm" block>
                  Ver métricas
                </Button>
              </Link>
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

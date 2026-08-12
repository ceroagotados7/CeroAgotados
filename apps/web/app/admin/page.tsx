"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, FlaskConical, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { AppBar } from "@/components/shell";
import { Avatar, Card, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { cop, iniciales } from "@/lib/format";
import type { AdminDashboard, AdminResumen } from "@/lib/types";

const AVATAR_BG = ["bg-primary-700", "bg-teal-600", "bg-slate-500", "bg-amber-600", "bg-primary"];

export default function AdminHome() {
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [resumen, setResumen] = useState<AdminResumen | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .get<AdminDashboard>("/admin/dashboard")
      .then((d) => active && setData(d))
      .catch(() => active && setError("No se pudo cargar el panel."));
    api
      .get<AdminResumen>("/admin/resumen")
      .then((r) => active && setResumen(r))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (error) return <p className="px-5 pt-4 text-danger">{error}</p>;
  if (!data) return <Spinner />;

  const sube = (data.variacion_pct ?? 0) >= 0;

  return (
    <>
      <AppBar>
        <div className="min-w-0">
          <p className="mb-1 text-[12px] leading-none text-muted">Panel administrador</p>
          <p className="font-display text-[20px] font-extrabold leading-none">Métricas · {data.mes}</p>
        </div>
      </AppBar>

      <div className="px-5 pb-28">
        {/* GMV del mes */}
        <div className="gradient-brand relative mb-3 overflow-hidden rounded-card p-5 text-white">
          <div className="absolute -bottom-10 -right-8 h-40 w-40 rounded-full bg-white/10" />
          <p className="flex items-center gap-1.5 text-[13px] text-white/85">
            <TrendingUp size={16} /> Volumen transado (GMV)
          </p>
          <p className="mt-1 font-display text-[30px] font-extrabold">{cop(data.gmv_mes)}</p>
          {data.variacion_pct != null && (
            <span className="badge mt-1.5 bg-white/20 text-white">
              {sube ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
              {Math.abs(data.variacion_pct)}% vs. mes anterior
            </span>
          )}
        </div>

        {/* KPIs */}
        <div className="mb-3 grid grid-cols-2 gap-2.5">
          <Kpi valor={String(data.ordenes_mes)} label="Órdenes del mes" />
          <Kpi valor={cop(data.ticket_promedio)} label="Ticket promedio" />
          <Kpi valor={String(data.proveedores_activos)} label="Proveedores" />
          <Kpi valor={String(data.farmacias_activas)} label="Farmacias" />
        </div>

        {/* Bandeja de curaduría del catálogo maestro */}
        <Link href="/admin/solicitudes">
          <Card className="mb-3 flex items-center gap-3 p-3.5">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <FlaskConical size={19} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold leading-tight">Solicitudes de medicamentos</p>
              <p className="mt-0.5 text-[12px] text-muted">
                {resumen && resumen.solicitudes_pendientes > 0
                  ? `${resumen.solicitudes_pendientes} pendiente${resumen.solicitudes_pendientes !== 1 ? "s" : ""} de curar`
                  : "Nada pendiente por curar"}
              </p>
            </div>
            {resumen && resumen.solicitudes_pendientes > 0 && (
              <span className="flex h-6 min-w-6 flex-none items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">
                {resumen.solicitudes_pendientes}
              </span>
            )}
            <ArrowRight size={16} className="flex-none text-muted" />
          </Card>
        </Link>

        {/* Ventas por proveedor */}
        <p className="mb-2 px-1 text-[12px] font-semibold text-muted">VENTAS POR PROVEEDOR</p>
        {data.ventas_por_proveedor.length === 0 ? (
          <Card className="mb-3 p-4 text-center text-[13px] text-muted">Sin ventas este mes.</Card>
        ) : (
          <Card className="mb-3 divide-y divide-line">
            {data.ventas_por_proveedor.map((v, i) => (
              <Link key={v.id} href={`/admin/proveedores/${v.id}`} className="flex items-center gap-3 p-3.5">
                <Avatar className={`h-9 w-9 text-[12px] ${AVATAR_BG[i % AVATAR_BG.length]}`}>
                  {iniciales(v.nombre)}
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold">{v.nombre}</p>
                  <p className="text-[11.5px] text-muted">{v.ordenes} órdenes</p>
                </div>
                <p className="font-display text-[14px] font-bold">{cop(v.total)}</p>
              </Link>
            ))}
          </Card>
        )}

        {/* Top farmacias */}
        <p className="mb-2 px-1 text-[12px] font-semibold text-muted">TOP FARMACIAS COMPRADORAS</p>
        {data.top_farmacias.length === 0 ? (
          <Card className="p-4 text-center text-[13px] text-muted">Sin compras este mes.</Card>
        ) : (
          <Card className="divide-y divide-line">
            {data.top_farmacias.map((f, i) => (
              <div key={f.id} className="flex items-center gap-3 p-3.5">
                <span className="w-4 flex-none text-center font-display text-[13px] font-bold text-muted">{i + 1}</span>
                <Avatar className={`h-9 w-9 text-[12px] ${AVATAR_BG[(i + 1) % AVATAR_BG.length]}`}>
                  {iniciales(f.nombre)}
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold">{f.nombre}</p>
                  <p className="text-[11.5px] text-muted">{f.ordenes} órdenes</p>
                </div>
                <p className="font-display text-[14px] font-bold">{cop(f.total)}</p>
              </div>
            ))}
          </Card>
        )}

        <p className="mt-4 flex items-center justify-center gap-1.5 text-[11.5px] text-muted">
          <BarChart3 size={13} /> Métricas del mes en curso · Cero Agotados
        </p>
      </div>
    </>
  );
}

function Kpi({ valor, label }: { valor: string; label: string }) {
  return (
    <Card className="p-4">
      <p className="font-display text-[20px] font-extrabold leading-tight">{valor}</p>
      <p className="mt-0.5 text-[12px] text-muted">{label}</p>
    </Card>
  );
}

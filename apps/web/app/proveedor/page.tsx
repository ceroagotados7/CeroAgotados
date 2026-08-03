"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Inbox,
  Pill,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { AppBar } from "@/components/shell";
import { Avatar, Badge, Card, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { cop, ESTADO_ORDEN_LABEL, ESTADO_ORDEN_TONE, iniciales, mesActual, mesAnterior } from "@/lib/format";
import type { ProveedorDashboard } from "@/lib/types";

const AVATAR_BG = ["bg-teal-600", "bg-primary-700", "bg-slate-500"];

export default function DashboardPage() {
  const [data, setData] = useState<ProveedorDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .get<ProveedorDashboard>("/dashboard/")
      .then((d) => active && setData(d))
      .catch(() => active && setError("No se pudo cargar el dashboard."));
    return () => {
      active = false;
    };
  }, []);

  if (error) return <p className="px-5 pt-4 text-danger">{error}</p>;
  if (!data) return <Spinner />;

  const maxDia = Math.max(...data.serie_7_dias.map((d) => d.total), 0);
  const subeMes = (data.variacion_pct ?? 0) >= 0;
  const subeSemana = (data.variacion_semana_pct ?? 0) >= 0;

  return (
    <>
      {/* App bar */}
      <AppBar className="justify-between">
        <div className="flex items-center gap-3">
          <Avatar className="h-11 w-11 bg-primary text-[15px]">{iniciales(data.organizacion)}</Avatar>
          <div className="min-w-0">
            <p className="mb-1 text-[12px] leading-none text-muted">Proveedor</p>
            <p className="truncate font-display text-[16px] font-bold leading-none">{data.organizacion}</p>
          </div>
        </div>
        <Link href="/proveedor/ordenes" className="icon-btn relative flex-none" aria-label="Órdenes pendientes">
          <Bell size={19} />
          {data.ordenes_pendientes > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[9px] font-bold text-white">
              {data.ordenes_pendientes}
            </span>
          )}
        </Link>
      </AppBar>

      <div className="px-5">
        {/* KPI principal: ventas del mes */}
        <div className="gradient-brand relative mb-3 overflow-hidden rounded-card p-5 text-white">
          <div className="absolute -bottom-10 -right-8 h-40 w-40 rounded-full bg-white/10" />
          <p className="flex items-center gap-1.5 text-[13px] text-white/85">
            <TrendingUp size={16} /> Ventas de {mesActual()}
          </p>
          <p className="mt-1 font-display text-[32px] font-extrabold">{cop(data.ventas_mes)}</p>
          <div className="mt-1.5 flex items-center gap-2">
            {data.variacion_pct !== null ? (
              <>
                <span className="badge bg-white/20 text-white">
                  {subeMes ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                  {Math.abs(data.variacion_pct)}%
                </span>
                <span className="text-[12.5px] text-white/80">vs. {mesAnterior()}</span>
              </>
            ) : (
              <span className="text-[12.5px] text-white/80">Primer mes con ventas</span>
            )}
          </div>
        </div>

        {/* KPIs secundarios */}
        <div className="mb-5 grid grid-cols-2 gap-3">
          <Card className="p-4">
            <span className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <Inbox size={18} />
            </span>
            <p className="font-display text-[22px] font-extrabold leading-none">{data.ordenes_pendientes}</p>
            <p className="mt-1 text-[12.5px] text-muted">Órdenes pendientes</p>
          </Card>
          <Card className="p-4">
            <span className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <Pill size={18} />
            </span>
            <p className="font-display text-[22px] font-extrabold leading-none">{data.medicamentos_activos}</p>
            <p className="mt-1 text-[12.5px] text-muted">Medicamentos activos</p>
          </Card>
        </div>

        {/* Mini chart: ventas últimos 7 días */}
        <Card className="mb-5 p-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="font-display text-[15px] font-bold">Ventas últimos 7 días</p>
            {data.variacion_semana_pct !== null && (
              <Badge tone={subeSemana ? "green" : "red"}>
                {subeSemana ? "+" : ""}
                {data.variacion_semana_pct}%
              </Badge>
            )}
          </div>
          <div className="flex h-28 items-end justify-between gap-2">
            {data.serie_7_dias.map((d, i) => {
              const alto = maxDia > 0 ? Math.max((d.total / maxDia) * 100, 4) : 4;
              const pico = maxDia > 0 && d.total === maxDia;
              return (
                <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                  <div
                    className={`w-full rounded-t-lg ${pico ? "bg-primary" : "bg-primary-100"}`}
                    style={{ height: `${alto}%` }}
                  />
                  <span className={`text-[10px] ${pico ? "font-semibold text-primary" : "text-muted"}`}>{d.dia}</span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Órdenes recientes */}
        <div className="mb-3 flex items-center justify-between">
          <p className="font-display text-[16px] font-bold">Órdenes recientes</p>
          <Link href="/proveedor/ordenes" className="text-[13px] font-semibold text-primary">
            Ver todas
          </Link>
        </div>
        <div className="space-y-2.5">
          {data.ordenes_recientes.length === 0 ? (
            <p className="text-sm text-muted">Aún no hay órdenes.</p>
          ) : (
            data.ordenes_recientes.map((o, i) => (
              <Link key={o.id} href={`/proveedor/ordenes/${o.id}`}>
                <div className="card-flat lift flex items-center gap-3 p-3.5">
                  <Avatar className={`h-10 w-10 text-[13px] ${AVATAR_BG[i % AVATAR_BG.length]}`}>
                    {iniciales(o.farmacia)}
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold">{o.farmacia}</p>
                    <p className="text-[12px] text-muted">
                      {o.items} productos · #{o.codigo}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-[14px] font-bold">{cop(o.total)}</p>
                    <Badge tone={ESTADO_ORDEN_TONE[o.estado]} className="mt-1">
                      {ESTADO_ORDEN_LABEL[o.estado]}
                    </Badge>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </>
  );
}

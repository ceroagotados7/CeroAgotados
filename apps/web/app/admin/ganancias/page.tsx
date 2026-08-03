"use client";

import { PiggyBank } from "lucide-react";
import { useEffect, useState } from "react";

import { AppBar } from "@/components/shell";
import { Card, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { cop } from "@/lib/format";
import type { AdminGanancias } from "@/lib/types";

export default function GananciasPage() {
  const [data, setData] = useState<AdminGanancias | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .get<AdminGanancias>("/admin/ganancias")
      .then((d) => active && setData(d))
      .catch(() => active && setError("No se pudieron cargar las ganancias."));
    return () => {
      active = false;
    };
  }, []);

  if (error) return <p className="px-5 pt-4 text-danger">{error}</p>;
  if (!data) return <Spinner />;

  const pct = Math.round(data.comision_pct * 1000) / 10; // 0.06 → 6

  return (
    <>
      <AppBar>
        <div className="min-w-0">
          <p className="mb-1 text-[12px] leading-none text-muted">Panel administrador</p>
          <p className="font-display text-[20px] font-extrabold leading-none">Ganancias · {data.mes}</p>
        </div>
      </AppBar>

      <div className="px-5 pb-28">
        {/* Ganancia neta */}
        <div className="gradient-brand relative mb-3 overflow-hidden rounded-card p-5 text-white">
          <div className="absolute -bottom-10 -right-8 h-40 w-40 rounded-full bg-white/10" />
          <p className="flex items-center gap-1.5 text-[13px] text-white/85">
            <PiggyBank size={16} /> Ganancia de la plataforma
          </p>
          <p className="mt-1 font-display text-[30px] font-extrabold">{cop(data.ganancia_mes)}</p>
          <p className="mt-1 text-[12.5px] text-white/85">comisión {pct}% · simulada mientras se define el modelo</p>
        </div>

        <div className="mb-3 grid grid-cols-3 gap-2.5">
          <Card className="p-3 text-center">
            <p className="font-display text-[14px] font-extrabold leading-tight">{cop(data.gmv_mes)}</p>
            <p className="mt-0.5 text-[11px] text-muted">GMV</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="font-display text-[14px] font-extrabold leading-tight">{pct}%</p>
            <p className="mt-0.5 text-[11px] text-muted">Comisión</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="font-display text-[14px] font-extrabold leading-tight">{cop(data.margen_por_orden)}</p>
            <p className="mt-0.5 text-[11px] text-muted">Margen/orden</p>
          </Card>
        </div>

        <p className="mb-2 px-1 text-[12px] font-semibold text-muted">MARGEN POR PRODUCTO</p>
        {data.margen_por_producto.length === 0 ? (
          <Card className="mb-3 p-4 text-center text-[13px] text-muted">Sin ventas este mes.</Card>
        ) : (
          <Card className="mb-3 divide-y divide-line">
            {data.margen_por_producto.map((m) => (
              <div key={m.nombre} className="flex items-center gap-3 p-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold">{m.nombre}</p>
                  <p className="text-[11.5px] text-muted">
                    GMV {cop(m.gmv)} · {m.cajas} cajas
                  </p>
                </div>
                <p className="font-display text-[14px] font-bold text-primary-800">+{cop(m.comision)}</p>
              </div>
            ))}
          </Card>
        )}

        <p className="mb-2 px-1 text-[12px] font-semibold text-muted">ÚLTIMAS TRANSACCIONES</p>
        {data.ultimas_transacciones.length === 0 ? (
          <Card className="p-4 text-center text-[13px] text-muted">Aún no hay transacciones.</Card>
        ) : (
          <Card className="divide-y divide-line">
            {data.ultimas_transacciones.map((t) => (
              <div key={t.codigo} className="flex items-center gap-3 p-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold">
                    #{t.codigo} <span className="font-normal text-muted">· {t.farmacia} ← {t.proveedor}</span>
                  </p>
                  <p className="text-[11.5px] text-muted">{cop(t.total)} · comisión {pct}%</p>
                </div>
                <p className="font-display text-[13.5px] font-bold text-primary-800">+{cop(t.comision)}</p>
              </div>
            ))}
          </Card>
        )}
      </div>
    </>
  );
}

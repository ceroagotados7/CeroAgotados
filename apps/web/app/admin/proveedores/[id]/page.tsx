"use client";

import { BadgeCheck, Pill } from "lucide-react";
import { use, useEffect, useState } from "react";

import { BackBar } from "@/components/shell";
import { Avatar, Badge, Card, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { cop, iniciales } from "@/lib/format";
import type { AdminProveedorDetalle } from "@/lib/types";

export default function ProveedorDetalleAdmin({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<AdminProveedorDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .get<AdminProveedorDetalle>(`/admin/proveedores/${id}`)
      .then((d) => active && setData(d))
      .catch(() => active && setError("No se pudo cargar el proveedor."));
    return () => {
      active = false;
    };
  }, [id]);

  if (error) return <p className="px-5 pt-4 text-danger">{error}</p>;
  if (!data) return <Spinner />;

  return (
    <>
      <BackBar title="Detalle de proveedor" backHref="/admin" />

      <div className="px-5 pb-28">
        <Card className="mb-3 flex items-center gap-3.5 p-4">
          <Avatar className="h-14 w-14 bg-primary text-[18px]">{iniciales(data.razon_social)}</Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[16px] font-bold leading-tight">{data.razon_social}</p>
            <div className="mt-1 flex items-center gap-1.5 text-[12px] text-muted">
              {data.verificado && (
                <Badge tone="green">
                  <BadgeCheck size={12} /> Verificado
                </Badge>
              )}
              <span className="flex items-center gap-1">
                <Pill size={12} /> {data.medicamentos} medicamentos
              </span>
            </div>
          </div>
        </Card>

        <div className="mb-3 grid grid-cols-3 gap-2.5">
          <Card className="p-3 text-center">
            <p className="font-display text-[15px] font-extrabold leading-tight">{cop(data.vendido_mes)}</p>
            <p className="mt-0.5 text-[11px] text-muted">Vendido (mes)</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="font-display text-[15px] font-extrabold leading-tight">{data.ordenes_mes}</p>
            <p className="mt-0.5 text-[11px] text-muted">Órdenes</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="font-display text-[15px] font-extrabold leading-tight">{data.farmacias}</p>
            <p className="mt-0.5 text-[11px] text-muted">Farmacias</p>
          </Card>
        </div>

        <p className="mb-2 px-1 text-[12px] font-semibold text-muted">VENTAS POR FARMACIA (MES)</p>
        {data.ventas_por_farmacia.length === 0 ? (
          <Card className="p-4 text-center text-[13px] text-muted">Sin ventas este mes.</Card>
        ) : (
          <Card className="divide-y divide-line">
            {data.ventas_por_farmacia.map((f) => (
              <div key={f.nombre} className="flex items-center gap-3 p-3.5">
                <Avatar className="h-9 w-9 bg-teal-600 text-[12px]">{iniciales(f.nombre)}</Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold">{f.nombre}</p>
                  <p className="text-[11.5px] text-muted">
                    {f.ordenes} órdenes · {f.pct_del_proveedor}% del proveedor
                  </p>
                </div>
                <p className="font-display text-[14px] font-bold">{cop(f.total)}</p>
              </div>
            ))}
          </Card>
        )}
      </div>
    </>
  );
}

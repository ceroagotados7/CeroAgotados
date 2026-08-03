"use client";

import { ClipboardList } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AppBar } from "@/components/shell";
import { Avatar, Badge, Card, Chip, EmptyState, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { cop, ESTADO_ORDEN_LABEL, ESTADO_ORDEN_TONE, hace } from "@/lib/format";
import type { PedidoFarmacia } from "@/lib/types";

type Filtro = "activos" | "entregados" | "todos";

const ACTIVOS = new Set(["pendiente", "aceptada_parcial", "aceptada_total", "despachada"]);

export default function MisPedidosPage() {
  const [pedidos, setPedidos] = useState<PedidoFarmacia[] | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("activos");

  useEffect(() => {
    let active = true;
    api
      .get<PedidoFarmacia[]>("/farmacia/pedidos")
      .then((d) => active && setPedidos(d))
      .catch(() => active && setPedidos([]));
    return () => {
      active = false;
    };
  }, []);

  const counts = useMemo(() => {
    const list = pedidos ?? [];
    return {
      activos: list.filter((p) => ACTIVOS.has(p.estado)).length,
      entregados: list.filter((p) => p.estado === "completada").length,
      todos: list.length,
    };
  }, [pedidos]);

  const visibles = (pedidos ?? []).filter((p) =>
    filtro === "todos" ? true : filtro === "activos" ? ACTIVOS.has(p.estado) : p.estado === "completada",
  );

  return (
    <>
      <AppBar>
        <p className="font-display text-[20px] font-extrabold">Mis pedidos</p>
      </AppBar>

      <div className="px-5">
        <div className="no-scrollbar mb-1 flex gap-2 overflow-x-auto pb-1">
          <Chip active={filtro === "activos"} onClick={() => setFiltro("activos")}>
            Activos · {counts.activos}
          </Chip>
          <Chip active={filtro === "entregados"} onClick={() => setFiltro("entregados")}>
            Entregados · {counts.entregados}
          </Chip>
          <Chip active={filtro === "todos"} onClick={() => setFiltro("todos")}>
            Todos · {counts.todos}
          </Chip>
        </div>
      </div>

      <div className="px-5 pb-28 pt-2">
        {!pedidos ? (
          <Spinner />
        ) : visibles.length === 0 ? (
          <EmptyState
            icon={<ClipboardList size={32} />}
            title={pedidos.length === 0 ? "Aún no has hecho pedidos" : "Nada por aquí"}
            hint={
              pedidos.length === 0
                ? "Busca un medicamento, compara precios y haz tu primer pedido."
                : "Prueba con otro filtro."
            }
          />
        ) : (
          <div className="space-y-2.5">
            {visibles.map((p) => {
              const nItems = p.items.length;
              const cajas = p.items.reduce((acc, i) => acc + i.cantidad_solicitada, 0);
              return (
                <Link key={p.id} href={`/farmacia/pedidos/${p.id}`} className="block">
                  <Card className="p-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10 bg-teal-600 text-[12px]">
                        {p.proveedor_alias.replace("Proveedor ", "").slice(0, 2)}
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold leading-tight">
                          {p.proveedor_alias} <span className="font-normal text-muted">· #{p.codigo}</span>
                        </p>
                        <p className="mt-0.5 text-[12px] text-muted">{hace(p.created_at)}</p>
                      </div>
                      <Badge tone={ESTADO_ORDEN_TONE[p.estado] ?? "gray"} className="flex-none">
                        {ESTADO_ORDEN_LABEL[p.estado] ?? p.estado}
                      </Badge>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between border-t border-line pt-2.5">
                      <p className="text-[12.5px] text-muted">
                        {nItems} producto{nItems !== 1 && "s"} · {cajas} cajas
                      </p>
                      <p className="font-display text-[15px] font-bold">
                        {cop(p.total > 0 ? p.total : p.total_solicitado)}
                      </p>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

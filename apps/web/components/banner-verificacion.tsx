"use client";

import { ArrowRight, Clock, XCircle } from "lucide-react";
import Link from "next/link";

import { useMe } from "@/lib/me";

/** Banner persistente de estado de verificación (gate del admin), compartido
 *  por proveedor y farmacia. Regla dura: sin aprobación no se vende ni compra.
 *  Enlaza a la pantalla de documentos del rol. */
export function BannerVerificacion({ rol }: { rol: "proveedor" | "farmacia" }) {
  const me = useMe();
  const estado = me?.organizacion?.estado_verificacion;
  if (!estado || estado === "aprobado") return null;

  const docsHref = `/${rol}/cuenta/documentos`;
  const config = {
    en_revision: {
      icono: <Clock size={18} />,
      css: "border-amber-200 bg-amber-50 text-amber-800",
      titulo: "Tu cuenta está en revisión",
      detalle:
        rol === "proveedor"
          ? "Puedes ir armando tu catálogo: será visible para las farmacias apenas te aprobemos."
          : "Puedes explorar y comparar precios; podrás hacer pedidos apenas te aprobemos.",
    },
    rechazado: {
      icono: <XCircle size={18} />,
      css: "border-danger-100 bg-danger-50 text-danger",
      titulo: "Tu cuenta fue rechazada",
      detalle: me?.organizacion?.motivo_decision
        ? `Motivo: ${me.organizacion.motivo_decision}`
        : "Contacta al equipo de Cero Agotados para más información.",
    },
    suspendido: {
      icono: <XCircle size={18} />,
      css: "border-danger-100 bg-danger-50 text-danger",
      titulo: "Tu cuenta está suspendida",
      detalle: me?.organizacion?.motivo_decision
        ? `Motivo: ${me.organizacion.motivo_decision}`
        : "Contacta al equipo de Cero Agotados para más información.",
    },
  }[estado];
  if (!config) return null;

  return (
    <div className={`mb-3 rounded-card border p-3.5 ${config.css}`}>
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex-none">{config.icono}</span>
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold leading-tight">{config.titulo}</p>
          <p className="mt-0.5 text-[12.5px] opacity-90">{config.detalle}</p>
          <Link
            href={docsHref}
            className="mt-1.5 inline-flex items-center gap-1 text-[12.5px] font-bold underline"
          >
            Sube tu documentación legal <ArrowRight size={13} />
          </Link>
        </div>
      </div>
    </div>
  );
}

"use client";

import { DocumentosVerificacion } from "@/components/documentos-verificacion";
import { BackBar } from "@/components/shell";

export default function DocumentosFarmaciaPage() {
  return (
    <>
      <BackBar title="Documentación legal" subtitle="Verificación de tu farmacia" backHref="/farmacia/cuenta" />
      <div className="px-5 pb-28">
        <DocumentosVerificacion />
      </div>
    </>
  );
}

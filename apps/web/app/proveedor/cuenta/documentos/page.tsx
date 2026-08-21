"use client";

import { DocumentosVerificacion } from "@/components/documentos-verificacion";
import { BackBar } from "@/components/shell";

export default function DocumentosProveedorPage() {
  return (
    <>
      <BackBar title="Documentación legal" subtitle="Verificación de tu empresa" backHref="/proveedor/cuenta" />
      <div className="px-5 pb-28">
        <DocumentosVerificacion />
      </div>
    </>
  );
}

"use client";

import { CheckCircle2, Clock, FileText, Upload, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Badge, Card, Spinner } from "@/components/ui";
import { api, ApiCallError } from "@/lib/api";
import type { DocumentosResult, DocumentoVerificacion, TipoDocumento } from "@/lib/types";

const DOC_LABEL: Record<TipoDocumento, { titulo: string; detalle: string; accept: string }> = {
  camara_comercio: {
    titulo: "Cámara de comercio",
    detalle: "Actualizada (máx. 3 meses) · solo PDF",
    accept: "application/pdf",
  },
  nit_rut: {
    titulo: "NIT / RUT",
    detalle: "Persona natural o jurídica · PDF o imagen",
    accept: "application/pdf,image/jpeg,image/png",
  },
  cedula_representante: {
    titulo: "Cédula del representante legal",
    detalle: "Documento de identidad · PDF o imagen",
    accept: "application/pdf,image/jpeg,image/png",
  },
};

const ERROR_LABEL: Record<string, string> = {
  camara_comercio_debe_ser_pdf: "La Cámara de comercio debe subirse en PDF.",
  formato_no_permitido: "Formato no permitido: usa PDF, JPG o PNG.",
  archivo_demasiado_grande: "El archivo supera los 10 MB.",
  archivo_vacio: "El archivo está vacío.",
};

/** Subida y estado de los 3 documentos de verificación de la organización.
 *  Compartido por farmacia y proveedor (misma exigencia documental). */
export function DocumentosVerificacion() {
  const [data, setData] = useState<DocumentosResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      api
        .get<DocumentosResult>("/verificacion/documentos")
        .then(setData)
        .catch(() => setError("No se pudieron cargar tus documentos.")),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);

  if (error && !data) return <p className="px-1 pt-2 text-[13px] text-danger">{error}</p>;
  if (!data) return <Spinner />;

  const porTipo = new Map(data.documentos.map((d) => [d.tipo, d]));

  return (
    <div className="space-y-2.5">
      <p className="px-1 text-[12.5px] text-muted">
        Nuestro equipo revisa estos documentos para aprobar tu cuenta. Sin la aprobación no es
        posible {""}
        <b>comprar ni vender</b> en Cero Agotados.
      </p>
      {data.tipos_requeridos.map((tipo) => (
        <DocumentoFila key={tipo} tipo={tipo} doc={porTipo.get(tipo) ?? null} onSubido={load} />
      ))}
      {data.completo && (
        <p className="flex items-center gap-1.5 px-1 text-[12.5px] font-semibold text-primary">
          <CheckCircle2 size={15} /> Documentación completa. Te avisaremos al aprobarla.
        </p>
      )}
    </div>
  );
}

function DocumentoFila({
  tipo,
  doc,
  onSubido,
}: {
  tipo: TipoDocumento;
  doc: DocumentoVerificacion | null;
  onSubido: () => Promise<unknown>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const info = DOC_LABEL[tipo];

  async function subir(archivo: File) {
    setSubiendo(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("archivo", archivo);
      await api.upload(`/verificacion/documentos/${tipo}`, form);
      await onSubido();
    } catch (e) {
      setError(
        e instanceof ApiCallError
          ? (ERROR_LABEL[e.code] ?? "No se pudo subir el archivo.")
          : "No se pudo subir el archivo.",
      );
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <Card className="p-3.5">
      <div className="flex items-start gap-3">
        <span
          className={`flex h-10 w-10 flex-none items-center justify-center rounded-lg ${
            doc ? "bg-primary-50 text-primary-700" : "bg-canvas text-muted"
          }`}
        >
          <FileText size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold leading-tight">{info.titulo}</p>
          <p className="mt-0.5 text-[12px] text-muted">{info.detalle}</p>
          {doc && (
            <p className="mt-1 truncate text-[12px] text-soft">
              {doc.nombre_archivo} · {(doc.tamano_bytes / 1024).toFixed(0)} KB
            </p>
          )}
          {doc?.estado === "rechazado" && doc.motivo_rechazo && (
            <p className="mt-1 text-[12px] text-danger">Motivo: {doc.motivo_rechazo}</p>
          )}
        </div>
        {doc ? (
          <Badge
            tone={doc.estado === "aprobado" ? "green" : doc.estado === "rechazado" ? "red" : "amber"}
            className="flex-none"
          >
            {doc.estado === "aprobado" && <CheckCircle2 size={12} />}
            {doc.estado === "rechazado" && <XCircle size={12} />}
            {doc.estado === "subido" && <Clock size={12} />}
            {doc.estado === "aprobado" ? "Aprobado" : doc.estado === "rechazado" ? "Rechazado" : "En revisión"}
          </Badge>
        ) : (
          <Badge tone="gray" className="flex-none">
            Falta
          </Badge>
        )}
      </div>

      <input
        ref={input}
        type="file"
        accept={info.accept}
        className="hidden"
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          if (archivo) void subir(archivo);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={subiendo}
        onClick={() => input.current?.click()}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-line py-2.5 text-[13px] font-semibold text-soft transition hover:border-primary hover:text-primary-700 disabled:opacity-60"
      >
        <Upload size={15} /> {subiendo ? "Subiendo…" : doc ? "Reemplazar documento" : "Subir documento"}
      </button>
      {error && <p className="mt-2 text-center text-[12.5px] text-danger">{error}</p>}
    </Card>
  );
}

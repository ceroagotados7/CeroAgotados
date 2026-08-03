"use client";

import { ArrowRight, Check, Download, FileDown, FileSpreadsheet, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { BackBar } from "@/components/shell";
import { Badge, Bar, Button, Card, Spinner } from "@/components/ui";
import { api, ApiCallError } from "@/lib/api";
import { descargarErrores, descargarPlantilla, normNombre, parseArchivo, type FilaCruda } from "@/lib/bulk";
import { cop } from "@/lib/format";
import { useMe } from "@/lib/me";
import type { Oferta, ProductoMaestro } from "@/lib/types";

type Estado = "nuevo" | "actualizado" | "error";
type FilaAnalizada = FilaCruda & { estado: Estado; error?: string; producto_maestro_id?: string; precioNum: number };

const COLUMNAS = ["Nombre", "Presentación", "Unidades", "Precio", "Stock"];

export default function CargaMasivaPage() {
  const router = useRouter();
  const me = useMe();
  const inputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [analizando, setAnalizando] = useState(false);
  const [filas, setFilas] = useState<FilaAnalizada[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setFileSize(file.size);
    setAnalizando(true);
    setError(null);
    setFilas(null);
    try {
      const [crudas, maestro, ofertas] = await Promise.all([
        parseArchivo(file),
        api.get<ProductoMaestro[]>("/catalogo/?incluir_ofertados=true&limit=500"),
        api.get<Oferta[]>("/ofertas/"),
      ]);
      const porNombre = new Map(maestro.map((p) => [normNombre(p.nombre), p]));
      const yaOfertados = new Set(ofertas.map((o) => o.producto_maestro_id));

      const analizadas: FilaAnalizada[] = crudas.map((f) => {
        const precioNum = Number(String(f.precio).replace(/[^0-9.,]/g, "").replace(",", "."));
        if (!f.nombre) return { ...f, estado: "error", error: "Nombre vacío", precioNum: 0 };
        if (!(precioNum > 0)) return { ...f, estado: "error", error: "Precio vacío o no numérico", precioNum: 0 };
        const match = porNombre.get(normNombre(f.nombre));
        if (!match) return { ...f, estado: "error", error: "No está en el catálogo maestro", precioNum };
        return {
          ...f,
          precioNum,
          producto_maestro_id: match.id,
          estado: yaOfertados.has(match.id) ? "actualizado" : "nuevo",
        };
      });
      setFilas(analizadas);
    } catch {
      setError("No se pudo leer el archivo. Usa la plantilla .xlsx o un .csv válido.");
    } finally {
      setAnalizando(false);
    }
  }

  const resumen = {
    nuevos: filas?.filter((f) => f.estado === "nuevo").length ?? 0,
    actualizados: filas?.filter((f) => f.estado === "actualizado").length ?? 0,
    errores: filas?.filter((f) => f.estado === "error").length ?? 0,
  };
  const importables = (filas ?? []).filter((f) => f.estado !== "error");

  async function importar() {
    if (importables.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      const items = importables.map((f) => ({
        producto_maestro_id: f.producto_maestro_id!,
        precio: f.precioNum,
        stock_disponible: Number(String(f.stock).replace(/[^0-9]/g, "")) || 0,
      }));
      await api.post("/ofertas/bulk", { items });
      router.push("/proveedor/catalogo");
    } catch (e) {
      setError(e instanceof ApiCallError ? e.message : "No se pudo importar.");
      setImporting(false);
    }
  }

  return (
    <>
      <BackBar title="Carga masiva" subtitle={me?.organizacion?.razon_social ?? " "} backHref="/proveedor/catalogo" />

      <div className="px-5 pb-28 pt-1">
        {/* Plantilla */}
        <Card className="mb-3 flex items-center gap-3 p-3.5">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-teal-50 text-teal-700">
            <FileDown size={19} />
          </span>
          <div className="flex-1">
            <p className="text-[13.5px] font-semibold leading-none">Descarga la plantilla</p>
            <p className="mt-1 text-[12px] text-muted">Excel/CSV con las columnas correctas</p>
          </div>
          <Button variant="outline" size="sm" onClick={descargarPlantilla}>
            .xlsx
          </Button>
        </Card>

        {/* Columnas requeridas */}
        <p className="mb-2 px-1 text-[12px] text-muted">Columnas requeridas por medicamento:</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {COLUMNAS.map((c) => (
            <span key={c} className="chip !h-8 !text-[12px]">
              {c}
            </span>
          ))}
        </div>

        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFile} className="hidden" />

        {analizando ? (
          <Spinner />
        ) : !filas ? (
          /* Dropzone */
          <button
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-card border-2 border-dashed border-line bg-surface py-10 text-center"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
              <UploadCloud size={24} />
            </span>
            <p className="text-[14px] font-semibold">Sube tu archivo</p>
            <p className="text-[12px] text-muted">Formato .xlsx, .xls o .csv</p>
          </button>
        ) : (
          <>
            {/* Archivo cargado */}
            <Card className="mb-4 p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                  <FileSpreadsheet size={22} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold">{fileName}</p>
                  <p className="text-[12px] text-muted">
                    {filas.length} filas · {(fileSize / 1024).toFixed(0)} KB
                  </p>
                </div>
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-primary text-white">
                  <Check size={16} />
                </span>
              </div>
              <Bar value={100} className="mt-3" />
              <p className="mt-1.5 text-[11.5px] font-medium text-primary-700">
                Procesado · {filas.length} / {filas.length} filas
              </p>
            </Card>

            {/* Resumen de validación */}
            <div className="mb-4 grid grid-cols-3 gap-2.5">
              <Card className="p-3 text-center">
                <p className="font-display text-[19px] font-extrabold text-primary-700">{resumen.nuevos}</p>
                <p className="mt-0.5 text-[11px] text-muted">Nuevos</p>
              </Card>
              <Card className="p-3 text-center">
                <p className="font-display text-[19px] font-extrabold text-teal-700">{resumen.actualizados}</p>
                <p className="mt-0.5 text-[11px] text-muted">Actualizados</p>
              </Card>
              <Card className="p-3 text-center">
                <p className="font-display text-[19px] font-extrabold text-danger">{resumen.errores}</p>
                <p className="mt-0.5 text-[11px] text-muted">Con error</p>
              </Card>
            </div>

            {/* Vista previa */}
            <p className="mb-2 font-display text-[14px] font-bold">Vista previa</p>
            <Card className="mb-3 divide-y divide-line">
              {filas.slice(0, 8).map((f, i) => (
                <div key={i} className={`flex items-center gap-3 p-3 ${f.estado === "error" ? "bg-danger-50/60" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-[13px] font-medium ${f.estado === "error" ? "text-danger" : ""}`}>
                      {f.estado === "error" ? `Fila ${f.fila} · ${f.nombre || "sin nombre"}` : f.nombre}
                    </p>
                    <p className={`text-[11.5px] ${f.estado === "error" ? "text-danger/80" : "text-muted"}`}>
                      {f.estado === "error" ? f.error : `${cop(f.precioNum)} · stock ${f.stock || 0}`}
                    </p>
                  </div>
                  <Badge tone={f.estado === "error" ? "red" : f.estado === "nuevo" ? "green" : "teal"} className="flex-none">
                    {f.estado === "error" ? "Error" : f.estado === "nuevo" ? "Nuevo" : "Actualizado"}
                  </Badge>
                </div>
              ))}
            </Card>

            {resumen.errores > 0 && (
              <Button
                variant="ghost"
                size="sm"
                block
                onClick={() =>
                  descargarErrores(
                    filas
                      .filter((f) => f.estado === "error")
                      .map((f) => ({ fila: f.fila, nombre: f.nombre, error: f.error ?? "" })),
                  )
                }
              >
                <Download size={14} /> Descargar reporte de errores
              </Button>
            )}
          </>
        )}

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </div>

      {/* Footer sticky */}
      {filas && importables.length > 0 && (
        <div
          className="fixed bottom-0 left-1/2 z-20 w-full max-w-[430px] -translate-x-1/2 border-t border-line bg-surface px-5 py-3.5"
          style={{ boxShadow: "0 -6px 20px rgba(15,23,42,.05)" }}
        >
          <Button size="lg" block disabled={importing} onClick={importar}>
            {importing ? "Importando…" : `Importar ${importables.length} productos`} <ArrowRight size={18} />
          </Button>
          {resumen.errores > 0 && (
            <p className="mt-2 text-center text-[11.5px] text-muted">Las {resumen.errores} filas con error se omitirán</p>
          )}
        </div>
      )}
    </>
  );
}

// Utilidades de carga masiva (p5): parseo de Excel/CSV, plantilla y matching.
import * as XLSX from "xlsx";

export type FilaCruda = {
  fila: number; // número de fila en el archivo (1 = encabezado)
  nombre: string;
  presentacion: string;
  unidades: string;
  precio: string;
  stock: string;
};

// Encabezados aceptados (sin tildes, en minúsculas) → campo canónico.
const HEADER_ALIASES: Record<string, string> = {
  nombre: "nombre",
  medicamento: "nombre",
  producto: "nombre",
  presentacion: "presentacion",
  unidades: "unidades",
  "unidades/caja": "unidades",
  precio: "precio",
  "precio (caja)": "precio",
  stock: "stock",
  "stock (cajas)": "stock",
  existencias: "stock",
};

function sinTildes(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function normHeader(h: string): string {
  const k = sinTildes(h);
  return HEADER_ALIASES[k] ?? k;
}

/** Normaliza un nombre de producto para hacer matching con el catálogo maestro. */
export function normNombre(s: string): string {
  return sinTildes(s).replace(/\s+/g, " ");
}

/** Lee un archivo .xlsx/.xls/.csv y devuelve las filas crudas. */
export async function parseArchivo(file: File): Promise<FilaCruda[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  return rows.map((r, i) => {
    const o: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) o[normHeader(k)] = String(v ?? "").trim();
    return {
      fila: i + 2,
      nombre: o.nombre ?? "",
      presentacion: o.presentacion ?? "",
      unidades: o.unidades ?? "",
      precio: o.precio ?? "",
      stock: o.stock ?? "",
    };
  });
}

/** Genera y descarga la plantilla .xlsx con las columnas correctas. */
export function descargarPlantilla(): void {
  const ws = XLSX.utils.aoa_to_sheet([
    ["Nombre", "Presentación", "Unidades", "Precio", "Stock"],
    ["Acetaminofén 500mg", "Tableta · Caja x 100", 100, 8900, 1200],
    ["Ibuprofeno 400mg", "Tableta · Caja x 50", 50, 6200, 500],
  ]);
  ws["!cols"] = [{ wch: 24 }, { wch: 22 }, { wch: 10 }, { wch: 10 }, { wch: 8 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Ofertas");
  XLSX.writeFile(wb, "plantilla_cero_agotados.xlsx");
}

/** Descarga un reporte .xlsx con las filas que tuvieron error. */
export function descargarErrores(filas: { fila: number; nombre: string; error: string }[]): void {
  const ws = XLSX.utils.aoa_to_sheet([
    ["Fila", "Nombre", "Error"],
    ...filas.map((f) => [f.fila, f.nombre, f.error]),
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Errores");
  XLSX.writeFile(wb, "errores_carga.xlsx");
}

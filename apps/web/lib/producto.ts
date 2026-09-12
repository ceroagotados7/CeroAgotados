// Identidad visible de un producto del maestro — fuente única.
//
// Antes de este módulo cada pantalla armaba su propia línea de identidad a mano
// y cada una olvidaba campos distintos: la card seleccionada de "Agregar" perdía
// la concentración, el catálogo del proveedor perdía la concentración, el
// carrito perdía la forma farmacéutica, el imprimible perdía todo menos la
// presentación. El equipo lo reportó tres veces en el grupo (Torrox 60/90 mg,
// Cindimizol 150 mg, laboratorio que desaparecía al señalar).
//
// Regla de producto (Propuesta B, decisión del fundador 2026-09-11):
//   título     = nombre + concentración   → "Torrox 90 mg"
//   molécula   = principio activo, solo si aporta algo que el título no dice
//   detalle    = forma · presentación · laboratorio
//
// La concentración viaja PEGADA AL NOMBRE a propósito: así ninguna vista que
// solo tenga espacio para el nombre (chips de recompra, viñetas de faltantes,
// barra de título) puede volver a perderla.

/** Cualquier forma que traiga los campos del maestro: `ProductoMaestro`, el
 *  producto embebido de una oferta o el de un ítem de orden. */
export type ProductoIdentificable = {
  nombre?: string | null;
  principio_activo?: string | null;
  concentracion?: string | null;
  forma_farmaceutica?: string | null;
  presentacion?: string | null;
  laboratorio?: string | null;
};

const SEPARADOR = " · ";

/** Texto comparable: sin tildes, en minúsculas, con las unidades separadas del
 *  número ("500mg" → "500 mg") y sin puntuación. Conserva los espacios porque
 *  las comparaciones son por palabra completa, no por subcadena. */
function norm(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/(\d)\s*([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** ¿`texto` contiene `frase` como secuencia de palabras completas?
 *
 *  Por palabra y no por subcadena para no confundir "150 mg" con "50 mg":
 *  un `includes` crudo daría por repetida la concentración de Torrox 150 mg
 *  cuando la del producto es 50 mg, y la borraría de pantalla. */
function contienePalabras(texto: string, frase: string): boolean {
  if (!frase) return false;
  return ` ${texto} `.includes(` ${frase} `);
}

function unir(partes: (string | null | undefined)[]): string {
  return partes.map((p) => p?.trim()).filter(Boolean).join(SEPARADOR);
}

/** Concentración solo cuando el nombre no la dice ya.
 *  "Dolex 500 mg" + concentración "500 mg" no se repite; "Torrox" + "90 mg" sí. */
export function concentracionVisible(p: ProductoIdentificable): string | null {
  const conc = p.concentracion?.trim();
  if (!conc) return null;
  return contienePalabras(norm(p.nombre), norm(conc)) ? null : conc;
}

/** Nombre + concentración: "Torrox 90 mg". Lo que el usuario llama "el producto". */
export function tituloProducto(
  p: ProductoIdentificable,
  fallback = "Producto",
): string {
  const nombre = p.nombre?.trim();
  if (!nombre) return fallback;
  const conc = concentracionVisible(p);
  return conc ? `${nombre} ${conc}` : nombre;
}

/** Principio activo, solo si añade información que el título no da.
 *  En un genérico ("Acetaminofén" marca de "Acetaminofén") sobra; en una marca
 *  ("Funzal" de terbinafina) es lo que distingue el producto. */
export function moleculaProducto(p: ProductoIdentificable): string | null {
  const molecula = p.principio_activo?.trim();
  if (!molecula) return null;
  return contienePalabras(norm(tituloProducto(p, "")), norm(molecula)) ? null : molecula;
}

/** Forma · presentación: "Tabletas · 30 Und.". */
export function presentacionProducto(p: ProductoIdentificable): string {
  return unir([p.forma_farmaceutica, p.presentacion]);
}

/** Forma · presentación · laboratorio — la línea secundaria de casi toda card. */
export function detalleProducto(p: ProductoIdentificable): string {
  return unir([p.forma_farmaceutica, p.presentacion, p.laboratorio]);
}

/** Identidad completa en una sola línea, para contextos sin dos renglones
 *  (hoja imprimible, aria-labels, texto de una viñeta). */
export function identidadProducto(
  p: ProductoIdentificable,
  fallback = "Producto",
): string {
  return unir([tituloProducto(p, fallback), detalleProducto(p)]);
}

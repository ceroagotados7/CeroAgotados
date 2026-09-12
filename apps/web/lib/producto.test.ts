import { describe, expect, it } from "vitest";

import {
  abreviarForma,
  concentracionVisible,
  detalleProducto,
  identidadProducto,
  moleculaProducto,
  presentacionCompacta,
  presentacionProducto,
  tituloProducto,
} from "./producto";

// Productos REALES del maestro de producción, los mismos que el equipo reportó
// en el grupo. Si estos tres salen bien, el bug reportado no puede volver.
const TORROX = {
  nombre: "Torrox",
  principio_activo: "Etoricoxib",
  concentracion: "90 mg",
  forma_farmaceutica: "Tabletas",
  presentacion: "30 Und.",
  laboratorio: "Hetero Labs",
};

const CINDIMIZOL = {
  nombre: "Cindimizol",
  principio_activo: "Fluconazol",
  concentracion: "150 mg",
  forma_farmaceutica: "Cápsulas",
  presentacion: "5 Und.",
  laboratorio: "Bioquifar",
};

describe("concentracionVisible", () => {
  it("muestra la concentración cuando el nombre no la dice", () => {
    expect(concentracionVisible(TORROX)).toBe("90 mg");
    expect(concentracionVisible(CINDIMIZOL)).toBe("150 mg");
  });

  it("no la repite cuando el nombre ya la trae", () => {
    expect(concentracionVisible({ nombre: "Dolex 500 mg", concentracion: "500 mg" })).toBeNull();
  });

  it("tolera que el nombre la escriba pegada: 'Dolex 500mg' con '500 mg'", () => {
    expect(concentracionVisible({ nombre: "Dolex 500mg", concentracion: "500 mg" })).toBeNull();
    expect(concentracionVisible({ nombre: "Dolex 500 mg", concentracion: "500mg" })).toBeNull();
  });

  it("NO confunde '50 mg' con el '150 mg' del nombre (sería borrar la dosis real)", () => {
    expect(concentracionVisible({ nombre: "Torrox 150 mg", concentracion: "50 mg" })).toBe("50 mg");
  });

  it("compara sin tildes ni mayúsculas", () => {
    expect(concentracionVisible({ nombre: "ÁCIDO FÓLICO 5 MG", concentracion: "5 mg" })).toBeNull();
  });

  it("devuelve null si no hay concentración o viene vacía", () => {
    expect(concentracionVisible({ nombre: "Torrox" })).toBeNull();
    expect(concentracionVisible({ nombre: "Torrox", concentracion: "   " })).toBeNull();
    expect(concentracionVisible({ nombre: "Torrox", concentracion: null })).toBeNull();
  });
});

describe("tituloProducto", () => {
  it("pega la concentración al nombre", () => {
    expect(tituloProducto(TORROX)).toBe("Torrox 90 mg");
    expect(tituloProducto(CINDIMIZOL)).toBe("Cindimizol 150 mg");
  });

  it("no duplica la concentración ya presente en el nombre", () => {
    expect(tituloProducto({ nombre: "Dolex 500 mg", concentracion: "500 mg" })).toBe("Dolex 500 mg");
  });

  it("cae al texto de respaldo si el producto no viene (ítem huérfano)", () => {
    expect(tituloProducto({})).toBe("Producto");
    expect(tituloProducto({ nombre: null })).toBe("Producto");
    expect(tituloProducto({ nombre: "   " })).toBe("Producto");
    expect(tituloProducto({}, "—")).toBe("—");
  });

  it("sin concentración devuelve el nombre tal cual", () => {
    expect(tituloProducto({ nombre: "Suero fisiológico" })).toBe("Suero fisiológico");
  });
});

describe("moleculaProducto", () => {
  it("conserva el principio activo de una marca (es lo que la distingue)", () => {
    expect(moleculaProducto(TORROX)).toBe("Etoricoxib");
  });

  it("lo omite cuando el nombre ya es la molécula (genéricos)", () => {
    expect(
      moleculaProducto({ nombre: "Acetaminofén", principio_activo: "Acetaminofén" }),
    ).toBeNull();
    expect(
      moleculaProducto({
        nombre: "Acetaminofén",
        concentracion: "500 mg",
        principio_activo: "Acetaminofen",
      }),
    ).toBeNull();
  });

  it("conserva los combinados aunque compartan una palabra con el nombre", () => {
    expect(
      moleculaProducto({ nombre: "Ibuprofeno NF", principio_activo: "Cafeína + Ibuprofeno" }),
    ).toBe("Cafeína + Ibuprofeno");
  });

  it("devuelve null si no hay principio activo", () => {
    expect(moleculaProducto({ nombre: "Torrox" })).toBeNull();
    expect(moleculaProducto({ nombre: "Torrox", principio_activo: "  " })).toBeNull();
  });
});

describe("presentacionProducto y detalleProducto", () => {
  it("arman las líneas completas", () => {
    expect(presentacionProducto(TORROX)).toBe("Tabletas · 30 Und.");
    expect(detalleProducto(TORROX)).toBe("Tabletas · 30 Und. · Hetero Labs");
  });

  it("no dejan separadores sueltos cuando faltan campos", () => {
    expect(detalleProducto({ nombre: "X", laboratorio: "Genfar" })).toBe("Genfar");
    expect(detalleProducto({ nombre: "X", forma_farmaceutica: "Jarabe" })).toBe("Jarabe");
    expect(detalleProducto({ nombre: "X" })).toBe("");
    expect(detalleProducto({ nombre: "X", presentacion: "   ", laboratorio: null })).toBe("");
  });
});

describe("identidadProducto", () => {
  it("da la identidad completa en una línea", () => {
    expect(identidadProducto(TORROX)).toBe("Torrox 90 mg · Tabletas · 30 Und. · Hetero Labs");
  });

  it("funciona con lo mínimo", () => {
    expect(identidadProducto({ nombre: "Suero" })).toBe("Suero");
    expect(identidadProducto({})).toBe("Producto");
  });
});

describe("abreviarForma (hoja impresa, Tanda 6)", () => {
  it("abrevia las formas más comunes del maestro", () => {
    expect(abreviarForma("Tabletas")).toBe("Tab.");
    expect(abreviarForma("Cápsulas")).toBe("Cáps.");
    expect(abreviarForma("Tabletas masticables")).toBe("Tab. mastic.");
  });

  it("encoge los compuestos palabra por palabra, sin enumerarlos todos", () => {
    expect(abreviarForma("Suspensión para inhalación")).toBe("Susp. p/ inhal.");
    expect(abreviarForma("Polvo para reconstituir a suspensión oral")).toBe(
      "Polvo p/ reconst. a Susp. oral",
    );
    expect(abreviarForma("Solución inyectable")).toBe("Sol. iny.");
  });

  it("deja intacto lo que no tiene abreviatura", () => {
    expect(abreviarForma("Jarabe")).toBe("Jarabe");
    expect(abreviarForma("Crema")).toBe("Crema");
    expect(abreviarForma("Parches transdérmicos")).toBe("Parches transdérmicos");
  });

  it("tolera tildes, mayúsculas y espacios de más", () => {
    expect(abreviarForma("  CÁPSULAS  ")).toBe("Cáps.");
    expect(abreviarForma("capsulas")).toBe("Cáps.");
  });

  it("no rompe con nada", () => {
    expect(abreviarForma(null)).toBe("");
    expect(abreviarForma("")).toBe("");
    expect(abreviarForma("   ")).toBe("");
  });
});

describe("presentacionCompacta", () => {
  it("abrevia la forma pero conserva la presentación tal cual", () => {
    expect(
      presentacionCompacta({ forma_farmaceutica: "Tabletas", presentacion: "100 Und." }),
    ).toBe("Tab. · 100 Und.");
  });

  it("NUNCA toca el nombre ni la concentración", () => {
    const p = { nombre: "Torrox", concentracion: "90 mg", forma_farmaceutica: "Tabletas" };
    expect(tituloProducto(p)).toBe("Torrox 90 mg");
  });

  it("con solo uno de los dos, no deja separadores sueltos", () => {
    expect(presentacionCompacta({ presentacion: "30 Und." })).toBe("30 Und.");
    expect(presentacionCompacta({ forma_farmaceutica: "Jarabe" })).toBe("Jarabe");
    expect(presentacionCompacta({})).toBe("");
  });
});

// Contrato de edición de las casillas numéricas (InputMiles), reescrito tras el
// reporte del equipo: "presionaba en la casilla y la borraba, y seguía quedando
// cualquier otro número; si escribe 7 deben ser 7, no 70".
//
// Estos tests simulan el ciclo tecla → salir del campo SIN montar React: la
// lógica que fallaba es pura (acotar + qué se emite y qué no), y así queda
// fijada aunque la interfaz cambie.

import { describe, expect, it } from "vitest";

import { acotar, milesInput, soloDigitos } from "./format";

const MAX_DIGITOS = 9;

/** Simula el campo: lo que se emite al padre al teclear y al salir. */
function campo(inicial: number, opts: { min?: number; max?: number } = {}) {
  let valorPadre = String(inicial);
  let borrador: string | null = null;
  const emitidos: string[] = [];

  const emitir = (d: string) => {
    valorPadre = d;
    emitidos.push(d);
  };

  return {
    /** El usuario enfoca: se selecciona todo (lo siguiente que teclee reemplaza). */
    enfocar() {
      borrador = null;
    },
    /** Escribe texto SOBRE la selección completa (el caso "toco y escribo 7"). */
    escribirEncima(texto: string) {
      const d = soloDigitos(texto).slice(0, MAX_DIGITOS);
      borrador = d;
      if (d !== "") emitir(d);
    },
    /** Borra todo el contenido. */
    borrarTodo() {
      borrador = "";
    },
    /** Sale del campo: se acota y se corrige. */
    salir() {
      const d = borrador;
      borrador = null;
      if (d != null && d !== "") {
        const corregido = acotar(Number(d), opts.min, opts.max);
        if (String(corregido) !== d) emitir(String(corregido));
      } else if (d === "") {
        const actual = valorPadre === "" ? (opts.min ?? 0) : Number(valorPadre);
        emitir(String(acotar(actual, opts.min, opts.max)));
      }
    },
    get valor() {
      return Number(valorPadre);
    },
    get mostrado() {
      return borrador != null ? milesInput(borrador) : milesInput(valorPadre);
    },
    get emitidos() {
      return emitidos;
    },
  };
}

describe("el caso exacto que reportó el equipo", () => {
  it("con 1 prellenado, tocar y escribir 7 da 7 (no 17 ni 71)", () => {
    const c = campo(1, { min: 1, max: 100 });
    c.enfocar();
    c.escribirEncima("7");
    c.salir();
    expect(c.valor).toBe(7);
  });

  it("se puede borrar del todo: no se reinyecta un 1 a media escritura", () => {
    const c = campo(5, { min: 1, max: 100 });
    c.enfocar();
    c.borrarTodo();
    expect(c.mostrado).toBe(""); // el campo queda VACÍO, no en "1"
    expect(c.emitidos).toEqual([]); // y no se emitió nada todavía
  });

  it("borrar y escribir 25 da 25", () => {
    const c = campo(1, { min: 1, max: 100 });
    c.enfocar();
    c.borrarTodo();
    c.escribirEncima("25");
    c.salir();
    expect(c.valor).toBe(25);
  });

  it("borrar y salir sin escribir restaura el valor anterior, no un 1", () => {
    const c = campo(40, { min: 1, max: 100 });
    c.enfocar();
    c.borrarTodo();
    c.salir();
    expect(c.valor).toBe(40);
  });
});

describe("acotado al salir, nunca por tecla", () => {
  it("deja escribir por encima del máximo y corrige al salir", () => {
    const c = campo(5, { min: 1, max: 20 });
    c.enfocar();
    c.escribirEncima("999");
    expect(c.mostrado).toBe("999"); // mientras escribe ve lo que tecleó
    c.salir();
    expect(c.valor).toBe(20); // al salir queda el máximo
  });

  it("sube al mínimo si se escribe 0", () => {
    const c = campo(5, { min: 1, max: 20 });
    c.enfocar();
    c.escribirEncima("0");
    c.salir();
    expect(c.valor).toBe(1);
  });

  it("un valor válido no se toca al salir", () => {
    const c = campo(5, { min: 1, max: 20 });
    c.enfocar();
    c.escribirEncima("12");
    c.salir();
    expect(c.valor).toBe(12);
    expect(c.emitidos).toEqual(["12"]); // una sola emisión, sin correcciones
  });
});

describe("entradas sucias", () => {
  it("ignora letras y símbolos pegados (pegar desde otra app)", () => {
    const c = campo(1, { min: 1, max: 10000 });
    c.enfocar();
    c.escribirEncima("$ 1.250 cajas");
    c.salir();
    expect(c.valor).toBe(1250);
  });

  it("pegar algo sucio POR ENCIMA del máximo igual se acota al salir", () => {
    const c = campo(1, { min: 1, max: 1000 });
    c.enfocar();
    c.escribirEncima("$ 1.250 cajas");
    c.salir();
    expect(c.valor).toBe(1000);
  });

  it("corta a 9 dígitos y no desborda", () => {
    const c = campo(1);
    c.enfocar();
    c.escribirEncima("12345678901234");
    expect(c.mostrado).toBe(milesInput("123456789"));
  });

  it("un campo sin máximo acepta cifras grandes (precios)", () => {
    const c = campo(0, { min: 0 });
    c.enfocar();
    c.escribirEncima("1250000");
    c.salir();
    expect(c.valor).toBe(1250000);
    expect(c.mostrado).toBe("1.250.000");
  });
});

describe("acotar", () => {
  it("respeta el rango", () => {
    expect(acotar(5, 1, 10)).toBe(5);
    expect(acotar(50, 1, 10)).toBe(10);
    expect(acotar(0, 1, 10)).toBe(1);
  });

  it("sin límites devuelve el valor", () => {
    expect(acotar(99999)).toBe(99999);
  });

  it("un valor no numérico cae al mínimo, no a NaN", () => {
    expect(acotar(Number("x"), 1, 10)).toBe(1);
    expect(acotar(Number("x"))).toBe(0);
  });

  it("min por encima de max gana min (rango imposible, no rompe)", () => {
    expect(acotar(5, 10, 3)).toBe(10);
  });
});

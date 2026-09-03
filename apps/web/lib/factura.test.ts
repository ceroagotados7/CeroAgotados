import { describe, expect, it } from "vitest";

import { facturaValida, normalizarFactura } from "./factura";

describe("facturaValida (espejo de la regla de la API y la DB)", () => {
  it("acepta formatos reales de facturación colombiana", () => {
    expect(facturaValida("FV-10425")).toBe(true);
    expect(facturaValida("FE 1234")).toBe(true);
    expect(facturaValida("A-001/2026")).toBe(true);
    expect(facturaValida("FAC.00987")).toBe(true);
    expect(facturaValida("123")).toBe(true);
  });

  it("rechaza vacío y demasiado corto", () => {
    expect(facturaValida("")).toBe(false);
    expect(facturaValida("  ")).toBe(false);
    expect(facturaValida("A1")).toBe(false);
  });

  it("rechaza más de 30 caracteres", () => {
    expect(facturaValida("A".repeat(30))).toBe(true);
    expect(facturaValida("A".repeat(31))).toBe(false);
  });

  it("rechaza caracteres fuera del alfabeto permitido", () => {
    expect(facturaValida("FV#123")).toBe(false);
    expect(facturaValida("FV_123")).toBe(false);
    expect(facturaValida("FV;123")).toBe(false);
    expect(facturaValida("FVñ10")).toBe(false);
  });

  it("no puede empezar ni terminar en separador", () => {
    expect(facturaValida("-FV123")).toBe(false);
    expect(facturaValida("FV123-")).toBe(false);
    expect(facturaValida(".FV123.")).toBe(false);
  });

  it("los espacios extremos se perdonan (se normalizan antes de validar)", () => {
    expect(facturaValida("  FV-10425  ")).toBe(true);
    expect(normalizarFactura("  FV   10425 ")).toBe("FV 10425");
  });
});

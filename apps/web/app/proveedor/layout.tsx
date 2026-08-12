"use client";


import { BottomNav } from "@/components/shell";
import { Spinner } from "@/components/ui";
import { useRoleGuard } from "@/lib/role-guard";

export default function ProveedorLayout({ children }: { children: React.ReactNode }) {
  const ready = useRoleGuard("proveedor");

  if (!ready) return <Spinner />;

  // Columna móvil fluida y centrada: llena el ancho en teléfonos (≤430px) y
  // queda como columna centrada en pantallas grandes. Sin medidas fijas.
  return (
    <div className="mx-auto flex w-full max-w-[430px] flex-1 flex-col bg-canvas">
      <div className="flex flex-1 flex-col pb-24">{children}</div>
      <BottomNav />
    </div>
  );
}

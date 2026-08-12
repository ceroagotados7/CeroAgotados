"use client";

import { clsx } from "clsx";
import { usePathname } from "next/navigation";

import { BottomNav, isMainTab } from "@/components/shell";
import { Spinner } from "@/components/ui";
import { useRoleGuard } from "@/lib/role-guard";

export default function ProveedorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const ready = useRoleGuard("proveedor");

  if (!ready) return <Spinner />;

  const showNav = isMainTab(pathname);

  // Columna móvil fluida y centrada: llena el ancho en teléfonos (≤430px) y
  // queda como columna centrada en pantallas grandes. Sin medidas fijas.
  return (
    <div className="mx-auto flex w-full max-w-[430px] flex-1 flex-col bg-canvas">
      <div className={clsx("flex flex-1 flex-col", showNav && "pb-24")}>{children}</div>
      {showNav && <BottomNav />}
    </div>
  );
}

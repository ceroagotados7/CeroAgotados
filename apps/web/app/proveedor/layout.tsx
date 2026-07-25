"use client";

import { clsx } from "clsx";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Spinner } from "@/components/ui";
import { BottomNav, isMainTab } from "@/components/shell";
import { createClient } from "@/lib/supabase/client";

export default function ProveedorLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/login");
      else setReady(true);
    });
  }, [router, supabase]);

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

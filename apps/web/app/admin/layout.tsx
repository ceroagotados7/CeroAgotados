"use client";

import { clsx } from "clsx";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { BottomNav, isMainTab } from "@/components/shell";
import { Spinner } from "@/components/ui";
import { fetchMe } from "@/lib/me";
import { createClient } from "@/lib/supabase/client";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.replace("/login");
        return;
      }
      // Solo el admin de plataforma entra aquí.
      try {
        const me = await fetchMe();
        if (!me.es_admin) {
          router.replace(me.organizacion?.tipo === "farmacia" ? "/farmacia" : "/proveedor");
          return;
        }
        setReady(true);
      } catch {
        router.replace("/login");
      }
    });
  }, [router, supabase]);

  if (!ready) return <Spinner />;

  const showNav = isMainTab(pathname);

  return (
    <div className="mx-auto flex w-full max-w-[430px] flex-1 flex-col bg-canvas">
      <div className={clsx("flex flex-1 flex-col", showNav && "pb-24")}>{children}</div>
      {showNav && <BottomNav rol="admin" />}
    </div>
  );
}

"use client";

import { clsx } from "clsx";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { BottomNav, isMainTab } from "@/components/shell";
import { Spinner } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export default function FarmaciaLayout({ children }: { children: React.ReactNode }) {
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

  return (
    <div className="mx-auto flex w-full max-w-[430px] flex-1 flex-col bg-canvas">
      <div className={clsx("flex flex-1 flex-col", showNav && "pb-24")}>{children}</div>
      {showNav && <BottomNav rol="farmacia" />}
    </div>
  );
}

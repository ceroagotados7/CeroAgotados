"use client";

import { clsx } from "clsx";
import { usePathname } from "next/navigation";

import { BottomNav, isMainTab } from "@/components/shell";
import { Spinner } from "@/components/ui";
import { useRoleGuard } from "@/lib/role-guard";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const ready = useRoleGuard("admin");

  if (!ready) return <Spinner />;

  const showNav = isMainTab(pathname);

  return (
    <div className="mx-auto flex w-full max-w-[430px] flex-1 flex-col bg-canvas">
      <div className={clsx("flex flex-1 flex-col", showNav && "pb-24")}>{children}</div>
      {showNav && <BottomNav rol="admin" />}
    </div>
  );
}

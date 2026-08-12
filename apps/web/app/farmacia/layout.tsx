"use client";


import { BottomNav } from "@/components/shell";
import { Spinner } from "@/components/ui";
import { useRoleGuard } from "@/lib/role-guard";

export default function FarmaciaLayout({ children }: { children: React.ReactNode }) {
  const ready = useRoleGuard("farmacia");

  if (!ready) return <Spinner />;

  return (
    <div className="mx-auto flex w-full max-w-[430px] flex-1 flex-col bg-canvas">
      <div className="flex flex-1 flex-col pb-24">{children}</div>
      <BottomNav rol="farmacia" />
    </div>
  );
}

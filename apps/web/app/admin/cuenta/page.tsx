"use client";

import { LogOut, Mail, ShieldCheck, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AppBar } from "@/components/shell";
import { Avatar, Badge, Button, Card } from "@/components/ui";
import { iniciales } from "@/lib/format";
import { clearMe, useMe } from "@/lib/me";
import { createClient } from "@/lib/supabase/client";

export default function CuentaAdminPage() {
  const router = useRouter();
  const supabase = createClient();
  const me = useMe();
  const [email, setEmail] = useState<string>("");
  const [saliendo, setSaliendo] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? ""));
  }, [supabase]);

  async function cerrarSesion() {
    setSaliendo(true);
    clearMe();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <>
      <AppBar>
        <p className="font-display text-[20px] font-extrabold">Cuenta</p>
      </AppBar>

      <div className="px-5 pb-24 pt-1">
        <Card className="mb-4 flex items-center gap-4 p-5">
          <Avatar className="h-16 w-16 bg-slate-700 text-[22px]">{iniciales(me?.perfil.nombre ?? "A")}</Avatar>
          <div className="min-w-0">
            <p className="truncate font-display text-[17px] font-bold leading-tight">
              {me?.perfil.nombre ?? "Administrador"}
            </p>
            <Badge tone="gray" className="mt-1.5">
              <ShieldCheck size={12} /> Admin de plataforma
            </Badge>
          </div>
        </Card>

        <Card className="mb-6 divide-y divide-line">
          <div className="flex items-center gap-3 p-3.5">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-canvas text-muted">
              <User size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11.5px] leading-none text-muted">Nombre</p>
              <p className="mt-1 truncate text-[14px] font-semibold">{me?.perfil.nombre || "—"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3.5">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-canvas text-muted">
              <Mail size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11.5px] leading-none text-muted">Correo</p>
              <p className="mt-1 truncate text-[14px] font-semibold">{email || "—"}</p>
            </div>
          </div>
        </Card>

        <Button variant="outline" size="md" block className="text-danger" disabled={saliendo} onClick={cerrarSesion}>
          <LogOut size={17} /> {saliendo ? "Cerrando…" : "Cerrar sesión"}
        </Button>

        <p className="mt-4 text-center text-[11.5px] text-muted">Cero Agotados · Marketplace farmacéutico B2B</p>
      </div>
    </>
  );
}

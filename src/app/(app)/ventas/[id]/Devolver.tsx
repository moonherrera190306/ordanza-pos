"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { DevolucionModal } from "@/components/Devolucion";

export function Devolver({ folio }: { folio: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}><Icon name="undo" />Devolución</button>
      {open && <DevolucionModal folio={folio} needPin={false} onClose={() => setOpen(false)} onDone={() => router.refresh()} />}
    </>
  );
}

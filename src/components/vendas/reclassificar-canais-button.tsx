"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { reclassificarCanais } from "@/server/canal-actions";

export function ReclassificarCanaisButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const r = await reclassificarCanais();
      if (!r.ok) {
        toast({ title: "Erro", description: r.error, variant: "destructive" });
        return;
      }
      const partes = [
        r.mercadolivre > 0 ? `Mercado Livre: ${r.mercadolivre}` : null,
        r.shopee > 0 ? `Shopee: ${r.shopee}` : null,
        r.amazon > 0 ? `Amazon: ${r.amazon}` : null,
        r.outro > 0 ? `Outro: ${r.outro}` : null,
      ].filter(Boolean);
      toast({
        title: r.total === 0 ? "Nada a reclassificar" : `${r.total} pedidos atualizados`,
        description: partes.length > 0 ? partes.join(" · ") : "Todos os pedidos já estavam classificados.",
      });
      router.refresh();
    });
  }

  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={handleClick}>
      <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Reclassificando..." : "Reclassificar canais"}
    </Button>
  );
}

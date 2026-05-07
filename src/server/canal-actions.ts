"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export interface ResultadoReclassificacao {
  ok: true;
  mercadolivre: number;
  shopee: number;
  amazon: number;
  outro: number;
  total: number;
}

export interface ErroReclassificacao {
  ok: false;
  error: string;
}

export async function reclassificarCanais(): Promise<ResultadoReclassificacao | ErroReclassificacao> {
  try {
    const session = await auth();
    if (!session?.user) return { ok: false, error: "Não autenticado." };

    const ml = await prisma.$executeRaw`
      UPDATE "Pedido"
      SET "canal" = 'mercadolivre'
      WHERE "numeroEcommerce" ~ '^2000[0-9]{12}$'
        AND ("canal" IS NULL OR "canal" != 'mercadolivre')
    `;

    const shopee = await prisma.$executeRaw`
      UPDATE "Pedido"
      SET "canal" = 'shopee'
      WHERE "numeroEcommerce" ~* '^[0-9]{6}[A-Z0-9]{8}$'
        AND ("canal" IS NULL OR "canal" != 'shopee')
    `;

    const amazon = await prisma.$executeRaw`
      UPDATE "Pedido"
      SET "canal" = 'amazon'
      WHERE "numeroEcommerce" ~ '^[0-9]{3}-[0-9]{7}-[0-9]{7}$'
        AND ("canal" IS NULL OR "canal" != 'amazon')
    `;

    const outros = await prisma.$executeRaw`
      UPDATE "Pedido"
      SET "canal" = 'outro'
      WHERE "numeroEcommerce" IS NOT NULL
        AND "numeroEcommerce" !~ '^2000[0-9]{12}$'
        AND "numeroEcommerce" !~* '^[0-9]{6}[A-Z0-9]{8}$'
        AND "numeroEcommerce" !~ '^[0-9]{3}-[0-9]{7}-[0-9]{7}$'
        AND "canal" IS NULL
    `;

    revalidatePath("/vendas");

    return {
      ok: true,
      mercadolivre: Number(ml),
      shopee: Number(shopee),
      amazon: Number(amazon),
      outro: Number(outros),
      total: Number(ml) + Number(shopee) + Number(amazon) + Number(outros),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "erro desconhecido" };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { encryptString } from "@/lib/crypto";

const empresaSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome da empresa."),
  apelido: z.string().trim().max(40).optional().nullable(),
  cnpj: z
    .string()
    .trim()
    .max(20)
    .optional()
    .nullable()
    .transform((v) => (v ? v.replace(/\D/g, "") : v)),
  cor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Cor deve ser um código hex (#RRGGBB).")
    .default("#FF6B35"),
  tinyToken: z.string().trim().optional(),
  ativo: z.boolean().default(true),
});

async function ensureAuth() {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Não autenticado.");
  }
}

export type ActionResult<T = unknown> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string };

export async function createEmpresa(formData: FormData): Promise<ActionResult> {
  await ensureAuth();

  const parsed = empresaSchema.safeParse({
    nome: formData.get("nome"),
    apelido: formData.get("apelido") || null,
    cnpj: formData.get("cnpj") || null,
    cor: formData.get("cor") || "#FF6B35",
    tinyToken: formData.get("tinyToken") || "",
    ativo: formData.get("ativo") === "true",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { nome, apelido, cnpj, cor, tinyToken, ativo } = parsed.data;

  const data: {
    nome: string;
    apelido: string | null;
    cnpj: string | null;
    cor: string;
    ativo: boolean;
    tinyTokenCipher?: string;
    tinyTokenIv?: string;
    tinyTokenTag?: string;
  } = {
    nome,
    apelido: apelido ?? null,
    cnpj: cnpj ?? null,
    cor,
    ativo,
  };

  if (tinyToken && tinyToken.length > 0) {
    const enc = encryptString(tinyToken);
    data.tinyTokenCipher = enc.cipher;
    data.tinyTokenIv = enc.iv;
    data.tinyTokenTag = enc.tag;
  }

  await prisma.empresa.create({ data });

  revalidatePath("/empresas");
  revalidatePath("/dashboard");
  return { ok: true, message: "Empresa cadastrada." };
}

export async function updateEmpresa(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  await ensureAuth();

  const parsed = empresaSchema.safeParse({
    nome: formData.get("nome"),
    apelido: formData.get("apelido") || null,
    cnpj: formData.get("cnpj") || null,
    cor: formData.get("cor") || "#FF6B35",
    tinyToken: formData.get("tinyToken") || "",
    ativo: formData.get("ativo") === "true",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { nome, apelido, cnpj, cor, tinyToken, ativo } = parsed.data;

  const data: {
    nome: string;
    apelido: string | null;
    cnpj: string | null;
    cor: string;
    ativo: boolean;
    tinyTokenCipher?: string;
    tinyTokenIv?: string;
    tinyTokenTag?: string;
  } = {
    nome,
    apelido: apelido ?? null,
    cnpj: cnpj ?? null,
    cor,
    ativo,
  };

  if (tinyToken && tinyToken.length > 0) {
    const enc = encryptString(tinyToken);
    data.tinyTokenCipher = enc.cipher;
    data.tinyTokenIv = enc.iv;
    data.tinyTokenTag = enc.tag;
  }

  await prisma.empresa.update({ where: { id }, data });

  revalidatePath("/empresas");
  revalidatePath("/dashboard");
  return { ok: true, message: "Empresa atualizada." };
}

export async function removeEmpresaToken(id: string): Promise<ActionResult> {
  await ensureAuth();

  await prisma.empresa.update({
    where: { id },
    data: { tinyTokenCipher: null, tinyTokenIv: null, tinyTokenTag: null },
  });

  revalidatePath("/empresas");
  revalidatePath("/dashboard");
  return { ok: true, message: "Token removido." };
}

export async function deleteEmpresa(id: string): Promise<ActionResult> {
  await ensureAuth();

  await prisma.empresa.delete({ where: { id } });
  revalidatePath("/empresas");
  revalidatePath("/dashboard");
  return { ok: true, message: "Empresa removida." };
}

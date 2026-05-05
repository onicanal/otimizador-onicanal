import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "Credenciais",
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        let user = await prisma.user.findUnique({ where: { email } });

        // Bootstrap automático: na primeira vez, se as credenciais batem com
        // ADMIN_EMAIL / ADMIN_PASSWORD do ambiente, cria o usuário admin.
        if (!user) {
          const adminEmail = process.env.ADMIN_EMAIL;
          const adminPassword = process.env.ADMIN_PASSWORD;
          const adminName = process.env.ADMIN_NAME ?? "Admin";

          if (
            adminEmail &&
            adminPassword &&
            email === adminEmail &&
            password === adminPassword
          ) {
            const passwordHash = await bcrypt.hash(adminPassword, 12);
            user = await prisma.user.create({
              data: { email: adminEmail, passwordHash, name: adminName },
            });
          } else {
            return null;
          }
        }

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? user.email,
        };
      },
    }),
  ],
});

import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: [
    /*
     * Aplica em tudo, exceto:
     * - assets do Next (_next/static, _next/image)
     * - favicon, robots, sitemap
     * - rotas de API de auth (next-auth lida internamente)
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api/auth).*)",
  ],
};

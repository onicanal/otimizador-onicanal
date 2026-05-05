import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLogged = !!auth?.user;
      const onLogin = nextUrl.pathname.startsWith("/login");
      const onApi = nextUrl.pathname.startsWith("/api/auth");

      if (onApi) return true;
      if (onLogin) {
        return isLogged
          ? Response.redirect(new URL("/dashboard", nextUrl))
          : true;
      }
      return isLogged;
    },
    jwt({ token, user }) {
      if (user) token.uid = (user as { id?: string }).id;
      return token;
    },
    session({ session, token }) {
      if (token.uid && session.user) {
        session.user.id = token.uid as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

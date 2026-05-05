import { LogoutButton } from "@/components/layout/logout-button";
import { auth } from "@/lib/auth";

export async function Header() {
  const session = await auth();
  const name = session?.user?.name ?? session?.user?.email ?? "Usuário";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b bg-background/95 px-6 backdrop-blur">
      <div className="flex items-center gap-2 md:hidden">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold">
          O
        </div>
        <span className="font-semibold">Onicanal</span>
      </div>

      <div className="ml-auto flex items-center gap-4">
        <div className="hidden text-right text-sm leading-tight sm:block">
          <p className="font-medium">{name}</p>
          <p className="text-xs text-muted-foreground">Logado</p>
        </div>
        <LogoutButton />
      </div>
    </header>
  );
}

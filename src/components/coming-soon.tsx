import { Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  title: string;
  fase: string;
  descricao: string;
  itens: string[];
}

export function ComingSoon({ title, fase, descricao, itens }: Props) {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground">{descricao}</p>
      </div>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle>Em construção · {fase}</CardTitle>
          </div>
          <CardDescription>
            Esta tela ganha vida assim que a sincronização do Tiny estiver ativa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            {itens.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <h1 className="font-display text-display font-bold text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">Em construção — chega numa próxima fatia.</p>
    </div>
  );
}

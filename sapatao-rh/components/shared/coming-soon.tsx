export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <h1 className="font-display text-2xl font-bold text-neutro-900">{title}</h1>
      <p className="text-sm text-neutro-700">Em construção — chega numa próxima fatia.</p>
    </div>
  );
}

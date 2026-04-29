export function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <section class="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-soft">
      <p class="text-sm text-slate-400">{label}</p>
      <p class="mt-2 text-2xl font-semibold text-white">{value}</p>
      {hint ? <p class="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </section>
  );
}

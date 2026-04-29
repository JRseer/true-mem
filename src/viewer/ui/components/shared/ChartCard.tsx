import { useEffect, useRef } from 'preact/hooks';
import type { ChartConfiguration, Chart as ChartInstance } from 'chart.js';
import type { DistributionItem } from '../../../shared/types.js';
import { Chart } from '../../lib/chart.js';
import { formatNumber } from '../../lib/format.js';

export function ChartCard({ title, config, fallbackItems = [] }: { title: string; config: ChartConfiguration; fallbackItems?: DistributionItem[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<ChartInstance | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    chartRef.current?.destroy();
    chartRef.current = new Chart(canvas, config);
    return () => chartRef.current?.destroy();
  }, [config]);

  return (
    <section class="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-soft">
      <h3 class="mb-4 text-sm font-semibold text-slate-200">{title}</h3>
      <canvas ref={canvasRef} aria-label={title} role="img" />
      {fallbackItems.length > 0 ? (
        <dl class="sr-only">
          {fallbackItems.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>{formatNumber(item.count)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

import type { ViewerMemoryStatus } from '../../../shared/types.js';
import { statusLabels } from '../../i18n/zh-CN.js';

export function StatusBadge({ status }: { status: ViewerMemoryStatus }) {
  const tone = status === 'active' ? 'bg-mint-400/15 text-mint-200' : status === 'deleted' ? 'bg-red-400/15 text-red-200' : 'bg-amber-400/15 text-amber-200';
  return <span class={`rounded-full px-2 py-1 text-xs font-medium ${tone}`}>{statusLabels[status]}</span>;
}

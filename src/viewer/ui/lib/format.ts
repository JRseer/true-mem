import { copy } from '../i18n/zh-CN.js';

export const numberFormatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
export const percentFormatter = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1 });
export const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

export function formatPercent(value: number): string {
  return percentFormatter.format(value);
}

export function formatDateTime(value: string | null): string {
  if (!value) return copy.common.never;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateTimeFormatter.format(date);
}

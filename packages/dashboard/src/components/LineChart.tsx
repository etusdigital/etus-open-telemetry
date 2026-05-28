'use client';

import {
  CartesianGrid,
  Line,
  LineChart as RLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts';
import { formatBytes, formatInt } from '@/lib/format';

// Paleta consistente — 10 cores que funcionam em fundo claro e escuro.
const PALETTE = [
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#84cc16', // lime-500
  '#f97316', // orange-500
  '#6366f1', // indigo-500
];

// `format` é string em vez de função porque Server Components não
// serializam funções para Client Components.
export type FormatHint = 'int' | 'bytes';

function pickFormatter(hint: FormatHint = 'int') {
  return hint === 'bytes' ? formatBytes : formatInt;
}

export interface SingleLineProps {
  data: Array<{ day: string; value: number }>;
  format?: FormatHint;
  color?: string;
}

export function SingleLineChart({
  data,
  format,
  color = PALETTE[0],
}: SingleLineProps) {
  const fmt = pickFormatter(format);
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-zinc-500">
        Sem dados na janela.
      </div>
    );
  }

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RLineChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 10, fill: 'currentColor' }}
            tickFormatter={(v) => v.slice(5)} // 'MM-DD'
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'currentColor' }}
            tickFormatter={(v) => fmt(v as number)}
            width={56}
          />
          <Tooltip
            contentStyle={{
              background: 'rgba(24,24,27,0.95)',
              border: '1px solid rgba(255,255,255,0.1)',
              fontSize: 12,
              color: '#fff',
            }}
            formatter={(v: number) => fmt(v)}
            labelStyle={{ color: '#fff', fontWeight: 600 }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </RLineChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface MultiLineProps {
  data: Array<Record<string, string | number>>;
  seriesNames: string[];
  format?: FormatHint;
}

export function MultiLineChart({
  data,
  seriesNames,
  format,
}: MultiLineProps) {
  const fmt = pickFormatter(format);
  if (data.length === 0 || seriesNames.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-zinc-500">
        Sem dados na janela.
      </div>
    );
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RLineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 10, fill: 'currentColor' }}
            tickFormatter={(v) => v.slice(5)}
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'currentColor' }}
            tickFormatter={(v) => fmt(v as number)}
            width={56}
          />
          <Tooltip
            contentStyle={{
              background: 'rgba(24,24,27,0.95)',
              border: '1px solid rgba(255,255,255,0.1)',
              fontSize: 12,
              color: '#fff',
            }}
            formatter={(v: number) => fmt(v)}
            labelStyle={{ color: '#fff', fontWeight: 600 }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11 }}
            iconType="line"
          />
          {seriesNames.map((s, i) => (
            <Line
              key={s}
              type="monotone"
              dataKey={s}
              stroke={PALETTE[i % PALETTE.length]}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </RLineChart>
      </ResponsiveContainer>
    </div>
  );
}

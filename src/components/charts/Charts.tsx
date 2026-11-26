import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';

/**
 * Single-series charts in the accent hue (one measure per chart, one y-axis).
 * Thin marks, rounded bar ends, recessive grid, crosshair/hover tooltip.
 */

const ACCENT = 'rgb(var(--accent))';

interface Point {
  label: string;
  value: number | null;
}

function Tip({ active, payload, label, fmt }: TooltipProps<number, string> & { fmt: (v: number) => string }) {
  if (!active || !payload?.length || payload[0].value == null) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-[12px] shadow-xl">
      <div className="text-muted">{label}</div>
      <div className="num text-[14px] font-bold text-fg">{fmt(payload[0].value as number)}</div>
    </div>
  );
}

const axisProps = {
  tickLine: false,
  axisLine: false,
  tickMargin: 8,
} as const;

export function BarTrend({
  data,
  fmt,
  height = 180,
  yFmt,
  goal,
  goalLabel,
}: {
  data: Point[];
  fmt: (v: number) => string;
  height?: number;
  yFmt?: (v: number) => string;
  goal?: number | null;
  goalLabel?: string;
}) {
  return (
    <div style={{ height }} className="-ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} strokeDasharray="0" strokeOpacity={0.6} />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={14} />
          <YAxis {...axisProps} width={44} allowDecimals={false} tickFormatter={yFmt} />
          <Tooltip cursor={{ fill: 'rgb(var(--fg) / .05)' }} content={<Tip fmt={fmt} />} />
          <Bar dataKey="value" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
          {goal != null && (
            <ReferenceLine
              y={goal}
              stroke="rgb(var(--fg) / .55)"
              strokeDasharray="4 4"
              label={{ value: goalLabel ?? 'Ziel', position: 'insideTopRight', fill: 'rgb(var(--muted))', fontSize: 11 }}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AreaTrend({ data, fmt, height = 200, yFmt }: { data: Point[]; fmt: (v: number) => string; height?: number; yFmt?: (v: number) => string }) {
  return (
    <div style={{ height }} className="-ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
              <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeOpacity={0.6} />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={14} />
          <YAxis {...axisProps} width={44} tickFormatter={yFmt} />
          <Tooltip cursor={{ stroke: 'rgb(var(--subtle))', strokeWidth: 1 }} content={<Tip fmt={fmt} />} />
          <Area
            type="monotone"
            dataKey="value"
            stroke={ACCENT}
            strokeWidth={2}
            fill="url(#areaFill)"
            activeDot={{ r: 5, stroke: 'rgb(var(--surface))', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LineTrend({
  data,
  fmt,
  height = 200,
  yFmt,
  goal,
  goalLabel,
}: {
  data: Point[];
  fmt: (v: number) => string;
  height?: number;
  yFmt?: (v: number) => string;
  goal?: number | null;
  goalLabel?: string;
}) {
  return (
    <div style={{ height }} className="-ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeOpacity={0.6} />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={14} />
          <YAxis {...axisProps} width={44} domain={['auto', 'auto']} tickFormatter={yFmt} />
          <Tooltip cursor={{ stroke: 'rgb(var(--subtle))', strokeWidth: 1 }} content={<Tip fmt={fmt} />} />
          <Line
            type="monotone"
            dataKey="value"
            stroke={ACCENT}
            strokeWidth={2}
            connectNulls
            dot={{ r: 4, fill: ACCENT, stroke: 'rgb(var(--surface))', strokeWidth: 2 }}
            activeDot={{ r: 6, stroke: 'rgb(var(--surface))', strokeWidth: 2 }}
            isAnimationActive={false}
          />
          {goal != null && (
            <ReferenceLine
              y={goal}
              stroke="rgb(var(--fg) / .55)"
              strokeDasharray="4 4"
              label={{ value: goalLabel ?? 'Ziel', position: 'insideTopRight', fill: 'rgb(var(--muted))', fontSize: 11 }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Ranked horizontal bars as plain HTML (accessible, readable labels). */
export function RankBars({ items, fmt }: { items: { label: string; value: number }[]; fmt: (v: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2.5">
      {items.map((i) => (
        <li key={i.label} className="group" title={`${i.label}: ${fmt(i.value)}`}>
          <div className="mb-1 flex justify-between text-[13px]">
            <span className="font-semibold">{i.label}</span>
            <span className="num text-muted">{fmt(i.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-elevated">
            <div className="h-full rounded-full bg-accent transition-all group-hover:brightness-110" style={{ width: `${(i.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

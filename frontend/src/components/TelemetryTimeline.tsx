import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export interface TelemetryEvent {
  timestamp: string;
  severity: 'LOW' | 'MED' | 'HIGH';
  event_type?: string;
}

interface TelemetryTimelineProps {
  logs: TelemetryEvent[];
}

const severityToValue: Record<TelemetryEvent['severity'], number> = {
  LOW: 1,
  MED: 2,
  HIGH: 3,
};

const valueToLabel: Record<number, string> = {
  1: 'LOW',
  2: 'MED',
  3: 'HIGH',
};

export default function TelemetryTimeline({ logs }: TelemetryTimelineProps) {
  const chartData = useMemo(() => {
    if (!logs || logs.length === 0) return [];

    const sorted = [...logs].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const startTime = new Date(sorted[0].timestamp).getTime();

    return sorted.map((log) => {
      const time = Math.max(
        0,
        Math.min(45, (new Date(log.timestamp).getTime() - startTime) / 60000)
      );

      return {
        time,
        severityValue: severityToValue[log.severity],
        event: log.event_type ? log.event_type.replace(/_/g, ' ') : 'Event',
        severity: log.severity,
      };
    });
  }, [logs]);

  if (!chartData.length) {
    return (
      <div className="h-52 flex items-center justify-center bg-aero-bg/30 rounded-xl border border-aero-border-subtle">
        <div className="text-center">
          <p className="text-aero-muted text-sm">No events recorded</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-52">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
        >
          <XAxis
            dataKey="time"
            type="number"
            domain={[0, 45]}
            ticks={[0, 15, 30, 45]}
            tickFormatter={(value) => `${value}m`}
            stroke="var(--aero-muted)"
            fontSize={11}
          />
          <YAxis
            domain={[0, 4]}
            ticks={[1, 2, 3]}
            tickFormatter={(value) => valueToLabel[value] || ''}
            stroke="var(--aero-muted)"
            fontSize={11}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--aero-surface)',
              border: '1px solid var(--aero-border-subtle)',
              borderRadius: '12px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
            }}
            labelFormatter={(value) => `Time: ${Math.round(value as number)} min`}
            formatter={(_, __, props) => {
              const payload = props.payload as { event?: string };
              return [payload?.event || 'Event', 'Event'];
            }}
          />
          <Line
            type="monotone"
            dataKey="severityValue"
            stroke="var(--aero-cyan)"
            strokeWidth={2}
            dot={{ r: 4, fill: '#38bdf8' }}
            connectNulls={true}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

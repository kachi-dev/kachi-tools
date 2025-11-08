import React from "react";

export type SkillOccurrenceDatum = { label: string, value: number };

type SkillOccurrenceChartProps = {
    data: SkillOccurrenceDatum[],
    height?: number,
    yMax?: number,
    yAxisLabel?: string,
    valueFormatter?: (v: number) => string,
};

export default function SkillOccurrenceChart(props: SkillOccurrenceChartProps) {
    const { data, height = 240, yMax, yAxisLabel, valueFormatter } = props;
    const max = yMax != null ? yMax : Math.max(1, ...data.map(d => d.value));
    const labelTopPadding = 24;
    const ticks = yMax === 100 ? [0, 25, 50, 75, 100] : [0, max/4, max/2, (3*max)/4, max].map(v => Number(v.toFixed(2)));
    const plotWidth = Math.max(240, data.length * 80);
    const barContainerWidth = Math.max(80, Math.floor((plotWidth - 32) / data.length));
    const barWidth = Math.min(72, barContainerWidth - 24);

    return <div style={{ display: 'flex' }}>
        <div style={{ width: 48, position: 'relative' }}>
            <div style={{ position: 'relative', height: height + labelTopPadding }}>
                <div style={{ position: 'absolute', top: labelTopPadding, bottom: 0, right: 0, borderRight: '1px solid #2a2a2a' }} />
                {ticks.map((t, i) => {
                    const y = height - Math.round((t / max) * height);
                    return <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: labelTopPadding + y - 8 }}>
                        <div style={{ position: 'absolute', right: 8, top: 0, transform: 'translateY(-50%)', fontSize: 12, color: '#9ca3af' }}>{t}</div>
                    </div>;
                })}
            </div>
            <div style={{ position: 'absolute', top: labelTopPadding, bottom: 0, left: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', color: '#9ca3af', fontSize: 12, marginLeft: 4 }}>{yAxisLabel || 'Avg occurrences'}</div>
            </div>
        </div>
        <div style={{ width: plotWidth }}>
            <div style={{ position: 'relative', height: height + labelTopPadding }}>
                {ticks.map((t, i) => {
                    const y = height - Math.round((t / max) * height);
                    return <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: labelTopPadding + y, height: 1, background: i === 0 ? '#2a2a2a' : '#1f2937' }} />;
                })}
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'flex-end', padding: '0 16px' }}>
                    {data.map(d => {
                        const scaled = max > 0 ? Math.round((d.value / max) * height) : 0;
                        const h = d.value > 0 ? Math.max(6, scaled) : 0;
                        return <div key={d.label} style={{ width: barContainerWidth, margin: '0 8px', display: 'flex', justifyContent: 'center' }}>
                            <div style={{ position: 'relative', height: h, width: barWidth, borderRadius: 6, background: 'linear-gradient(180deg, #f472b6 0%, #db2777 100%)', boxShadow: '0 2px 10px rgba(219,39,119,0.35), inset 0 0 0 1px rgba(255,255,255,0.08)' }}>
                                <div style={{ position: 'absolute', top: -22, left: '50%', transform: 'translateX(-50%)', fontSize: 12, color: '#e5e7eb', textShadow: '0 1px 1px rgba(0,0,0,0.7)' }}>{valueFormatter ? valueFormatter(d.value) : d.value.toFixed(2)}</div>
                            </div>
                        </div>;
                    })}
                </div>
            </div>
            <div style={{ display: 'flex', padding: '8px 16px 0 16px' }}>
                {data.map(d => <div key={d.label} style={{ width: barContainerWidth, margin: '0 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: '#cbd5e1', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{d.label}</div>
                </div>)}
            </div>
        </div>
    </div>;
}



import React from "react";

export type BasicBarDatum = { label: string, value: number, key?: string | number };

type BasicBarChartProps = {
    data: BasicBarDatum[],
    gradientFrom: string,
    gradientTo: string,
    height?: number,
    yMax?: number,
    yTicks?: number[],
    yAxisLabel?: string,
    valueFormatter?: (v: number) => string,
};

function hexToRgb(hex: string): { r: number, g: number, b: number } | undefined {
    const m = hex.trim().match(/^#?([0-9a-fA-F]{6})$/);
    if (!m) return undefined;
    const intVal = parseInt(m[1], 16);
    return {
        r: (intVal >> 16) & 0xff,
        g: (intVal >> 8) & 0xff,
        b: intVal & 0xff,
    };
}

export default function BasicBarChart(props: BasicBarChartProps) {
    const { data, gradientFrom, gradientTo, height = 240, yMax, yTicks, yAxisLabel, valueFormatter } = props;
    const maxValue = yMax != null ? yMax : Math.max(1, ...data.map(d => d.value));
    const defaultTicks = (() => {
        if (yTicks && yTicks.length > 0) return yTicks;
        if (yMax === 100) return [0, 25, 50, 75, 100];
        const q1 = Number((maxValue / 4).toFixed(2));
        const q2 = Number((maxValue / 2).toFixed(2));
        const q3 = Number(((3 * maxValue) / 4).toFixed(2));
        return [0, q1, q2, q3, Number(maxValue.toFixed(2))];
    })();

    const labelTopPadding = 24;
    const approxLabelWidth = (s: string): number => {
        let w = 0;
        for (const ch of s) {
            if (/[@MW#]/.test(ch)) w += 9; else if (/[Il1\s]/.test(ch)) w += 4; else w += 7;
        }
        return w;
    };
    const barContainerWidths = data.map(d => Math.max(72, Math.min(180, approxLabelWidth(d.label) + 24)));

    const rgb = hexToRgb(gradientTo);
    const glow = rgb ? `0 2px 10px rgba(${rgb.r},${rgb.g},${rgb.b},0.35), inset 0 0 0 1px rgba(255,255,255,0.08)`
                     : `0 2px 10px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.08)`;

    return <div style={{ display: 'flex' }}>
        <div style={{ width: 48, position: 'relative' }}>
            <div style={{ position: 'relative', height: height + labelTopPadding }}>
                <div style={{ position: 'absolute', top: labelTopPadding, bottom: 0, right: 0, borderRight: '1px solid #2a2a2a' }} />
                {defaultTicks.map((t, i) => {
                    const y = height - Math.round(((t) / maxValue) * height);
                    return <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: labelTopPadding + y - 8 }}>
                        <div style={{ position: 'absolute', right: 8, top: 0, transform: 'translateY(-50%)', fontSize: 12, color: '#9ca3af' }}>{t}</div>
                    </div>;
                })}
            </div>
            {yAxisLabel && (
                <div style={{ position: 'absolute', top: labelTopPadding, bottom: 0, left: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                    <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', color: '#9ca3af', fontSize: 12, marginLeft: 4 }}>{yAxisLabel}</div>
                </div>
            )}
        </div>
        <div style={{ flex: '1 0 auto', overflowX: 'auto' }}>
            <div style={{ position: 'relative', height: height + labelTopPadding, minWidth: 280 }}>
                {defaultTicks.map((t, i) => {
                    const y = height - Math.round(((t) / maxValue) * height);
                    return <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: labelTopPadding + y, height: 1, background: i === 0 ? '#2a2a2a' : '#1f2937' }} />;
                })}
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'inline-flex', alignItems: 'flex-end', padding: '0 16px' }}>
                    {data.map((d, idx) => {
                        const h = Math.round((Math.min(maxValue, Math.max(0, d.value)) / maxValue) * height);
                        const key = d.key ?? d.label;
                        const containerW = barContainerWidths[idx];
                        const barW = Math.min(72, containerW - 24);
                        return <div key={key} style={{ width: containerW, margin: '0 8px', display: 'flex', justifyContent: 'center' }}>
                            <div style={{ position: 'relative', height: Math.max(6, h), width: barW, borderRadius: 8, background: `linear-gradient(180deg, ${gradientFrom} 0%, ${gradientTo} 100%)`, boxShadow: glow }}>
                                <div style={{ position: 'absolute', top: -22, left: '50%', transform: 'translateX(-50%)', fontSize: 12, color: '#e5e7eb', textShadow: '0 1px 1px rgba(0,0,0,0.7)' }}>
                                    {valueFormatter ? valueFormatter(d.value) : d.value.toFixed(2)}
                                </div>
                            </div>
                        </div>;
                    })}
                </div>
            </div>
            <div style={{ display: 'inline-flex', padding: '8px 16px 0 16px', minWidth: 280 }}>
                {data.map((d, idx) => {
                    const key = d.key ?? d.label;
                    const containerW = barContainerWidths[idx];
                    return <div key={key} style={{ width: containerW, margin: '0 8px', textAlign: 'center' }}>
                        <div style={{ fontSize: 12, color: '#cbd5e1', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{d.label}</div>
                    </div>;
                })}
            </div>
        </div>
    </div>;
}














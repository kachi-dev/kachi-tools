import React from "react";

export type LineChartDatum = { label: string, value: number, key?: string | number };

type LineChartProps = {
    data: LineChartDatum[],
    height?: number,
    yMax?: number,
    yTicks?: number[],
    yAxisLabel?: string,
    xAxisLabel?: string,
    valueFormatter?: (v: number) => string,
    lineColor?: string,
    lineGradientFrom?: string,
    lineGradientTo?: string,
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

export default function LineChart(props: LineChartProps) {
    const {
        data,
        height = 240,
        yMax,
        yTicks,
        yAxisLabel,
        xAxisLabel,
        valueFormatter,
        lineColor,
        lineGradientFrom = "#f472b6",
        lineGradientTo = "#db2777",
    } = props;

    if (data.length === 0) return null;

    const maxValue = yMax != null ? yMax : Math.max(1, ...data.map(d => d.value));
    const minValue = Math.min(0, ...data.map(d => d.value));
    const valueRange = maxValue - minValue;
    
    const defaultTicks = (() => {
        if (yTicks && yTicks.length > 0) return yTicks;
        if (yMax === 100) return [0, 25, 50, 75, 100];
        const q1 = Number((maxValue / 4).toFixed(2));
        const q2 = Number((maxValue / 2).toFixed(2));
        const q3 = Number(((3 * maxValue) / 4).toFixed(2));
        return [0, q1, q2, q3, Number(maxValue.toFixed(2))];
    })();

    const labelTopPadding = 24;
    const xAxisLabelPadding = 24;
    const plotWidth = Math.max(320, data.length * 60);
    const pointSpacing = data.length > 1 ? (plotWidth - 32) / (data.length - 1) : plotWidth / 2;

    const rgb = hexToRgb(lineGradientTo);

    const points = data.map((d, idx) => {
        const x = data.length === 1 ? plotWidth / 2 : 16 + (idx * pointSpacing);
        const y = height - ((d.value - minValue) / valueRange) * height;
        return { x, y, value: d.value, label: d.label, key: d.key ?? d.label };
    });

    const pathData = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    
    const gradientId = `lineGradient-${lineGradientFrom.replace(/#/g, '')}-${lineGradientTo.replace(/#/g, '')}`;

    return <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex' }}>
            <div style={{ width: 48, position: 'relative' }}>
                <div style={{ position: 'relative', height: height + labelTopPadding + xAxisLabelPadding }}>
                    <div style={{ position: 'absolute', top: labelTopPadding, bottom: xAxisLabelPadding, right: 0, borderRight: '1px solid #2a2a2a' }} />
                    {defaultTicks.map((t, i) => {
                        const y = height - Math.round(((t - minValue) / valueRange) * height);
                        return <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: labelTopPadding + y - 8 }}>
                            <div style={{ position: 'absolute', right: 8, top: 0, transform: 'translateY(-50%)', fontSize: 12, color: '#9ca3af' }}>{t}</div>
                        </div>;
                    })}
                </div>
                {yAxisLabel && (
                    <div style={{ position: 'absolute', top: labelTopPadding, bottom: xAxisLabelPadding, left: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                        <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', color: '#9ca3af', fontSize: 12, marginLeft: 4 }}>{yAxisLabel}</div>
                    </div>
                )}
            </div>
            <div style={{ width: plotWidth, position: 'relative' }}>
                <div style={{ position: 'relative', height: height + labelTopPadding + xAxisLabelPadding }}>
                    {defaultTicks.map((t, i) => {
                        const y = height - Math.round(((t - minValue) / valueRange) * height);
                        return <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: labelTopPadding + y, height: 1, background: i === 0 ? '#2a2a2a' : '#1f2937' }} />;
                    })}
                    
                    <svg style={{ position: 'absolute', left: 0, top: labelTopPadding, width: plotWidth, height: height, overflow: 'visible' }}>
                        {!lineColor && (
                            <defs>
                                <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor={lineGradientFrom} />
                                    <stop offset="100%" stopColor={lineGradientTo} />
                                </linearGradient>
                                <radialGradient id={`dotGradient-${gradientId}`} cx="50%" cy="50%" r="50%">
                                    <stop offset="0%" stopColor={lineGradientFrom} />
                                    <stop offset="100%" stopColor={lineGradientTo} />
                                </radialGradient>
                            </defs>
                        )}
                        {data.length > 1 && (
                            <path
                                d={pathData}
                                fill="none"
                                stroke={lineColor || `url(#${gradientId})`}
                                strokeWidth="2.5"
                                style={{ filter: rgb ? `drop-shadow(0 2px 10px rgba(${rgb.r},${rgb.g},${rgb.b},0.35))` : undefined }}
                            />
                        )}
                        {points.map((p) => (
                            <g key={p.key}>
                                <circle
                                    cx={p.x}
                                    cy={p.y}
                                    r="3"
                                    fill={lineColor || `url(#dotGradient-${gradientId})`}
                                    style={{ filter: rgb ? `drop-shadow(0 1px 4px rgba(${rgb.r},${rgb.g},${rgb.b},0.4))` : undefined }}
                                />
                                <text
                                    x={p.x}
                                    y={p.y - 12}
                                    textAnchor="middle"
                                    fontSize="11"
                                    fill="#e5e7eb"
                                    style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}
                                >
                                    {valueFormatter ? valueFormatter(p.value) : p.value.toFixed(1)}
                                </text>
                            </g>
                        ))}
                    </svg>
                    
                    <div style={{ position: 'absolute', left: 0, top: labelTopPadding + height + 8, width: plotWidth, height: xAxisLabelPadding, paddingTop: 0 }}>
                        {data.map((d, idx) => {
                            const x = data.length === 1 ? plotWidth / 2 : 16 + (idx * pointSpacing);
                            return (
                                <div 
                                    key={d.key ?? d.label} 
                                    style={{ 
                                        position: 'absolute',
                                        left: x,
                                        transform: 'translateX(-50%)',
                                        textAlign: 'center',
                                        top: 0
                                    }}
                                >
                                    <div style={{ fontSize: 12, color: '#cbd5e1', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{d.label}</div>
                                </div>
                            );
                        })}
                    </div>
                </div>
                {xAxisLabel && (
                    <div style={{ textAlign: 'center', paddingTop: 4, fontSize: 12, color: '#9ca3af' }}>{xAxisLabel}</div>
                )}
            </div>
        </div>
    </div>;
}


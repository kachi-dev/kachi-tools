import React from "react";

export type WinsByStyleItem = {
    style: number,
    name: string,
    wins: number,
};

type WinsByStyleChartProps = {
    items: WinsByStyleItem[],
};

export default function WinsByStyleChart(props: WinsByStyleChartProps) {
    const items = props.items.filter(i => i.wins > 0);
    if (items.length === 0) return <div className="text-muted">No data found.</div>;
    const maxWins = Math.max(...items.map(i => i.wins));
    const chartHeight = 284; // match Uma chart total height (adds ~44px that Uma uses for icons)
    const labelTopPadding = 24;

    const ticks = (() => {
        if (maxWins <= 10) {
            return Array.from({ length: maxWins + 1 }, (_, i) => i);
        }
        const roughStep = Math.ceil(maxWins / 5);
        const step = roughStep <= 5 ? 5 : roughStep <= 10 ? 10 : Math.ceil(roughStep / 5) * 5;
        const arr: number[] = [];
        for (let v = 0; v <= maxWins; v += step) arr.push(v);
        if (arr[arr.length - 1] !== maxWins) arr.push(maxWins);
        return arr;
    })();

    return <div style={{
        background: "#151515",
        border: "1px solid #2a2a2a",
        borderRadius: 8,
        padding: 12,
    }}>
        <div className="d-flex align-items-center justify-content-between" style={{ marginBottom: 8 }}>
            <div style={{ fontWeight: 600 }}>Wins by Style</div>
            <div className="text-muted" style={{ fontSize: 12 }}>Sorted by wins (desc)</div>
        </div>
        <div style={{ display: 'flex', overflowX: 'auto', paddingBottom: 8 }}>
            {/* Y-axis */}
            <div style={{ width: 48, position: 'relative' }}>
                <div style={{ position: 'relative', height: chartHeight + labelTopPadding }}>
                    <div style={{ position: 'absolute', top: labelTopPadding, bottom: 0, right: 0, borderRight: '1px solid #2a2a2a' }} />
                    {ticks.map((t, i) => {
                        const y = chartHeight - Math.round((t / maxWins) * chartHeight);
                        return <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: labelTopPadding + y - 8 }}>
                            <div style={{ position: 'absolute', right: 8, top: 0, transform: 'translateY(-50%)', fontSize: 12, color: '#9ca3af' }}>{t}</div>
                        </div>;
                    })}
                </div>
                <div style={{ position: 'absolute', top: labelTopPadding, bottom: 0, left: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                    <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', color: '#9ca3af', fontSize: 12, marginLeft: 4 }}>Wins</div>
                </div>
            </div>

            {/* Plot area */}
            <div style={{ flex: '1 0 auto' }}>
                <div style={{ position: 'relative', height: chartHeight + labelTopPadding }}>
                    {/* Grid lines */}
                    {ticks.map((t, i) => {
                        const y = chartHeight - Math.round((t / maxWins) * chartHeight);
                        return <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: labelTopPadding + y, height: 1, background: i === 0 ? '#2a2a2a' : '#1f2937' }} />;
                    })}

                    {/* Bars */}
                    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'flex-end', padding: '0 16px' }}>
                        {items.map((item) => {
                            const scaled = maxWins > 0 ? Math.round((item.wins / maxWins) * chartHeight) : 0;
                            const heightPx = item.wins > 0 ? Math.max(6, scaled) : 0;
                            return <div key={item.style} style={{ width: 88, margin: '0 8px', display: 'flex', justifyContent: 'center' }}>
                                <div style={{ position: 'relative', height: heightPx, width: 48, borderRadius: 8, background: 'linear-gradient(180deg, #34d399 0%, #059669 100%)', boxShadow: '0 2px 10px rgba(5,150,105,0.35), inset 0 0 0 1px rgba(255,255,255,0.08)' }}>
                                    <div style={{ position: 'absolute', top: -22, left: '50%', transform: 'translateX(-50%)', fontSize: 12, color: '#e5e7eb', textShadow: '0 1px 1px rgba(0,0,0,0.7)' }}>{item.wins}</div>
                                </div>
                            </div>;
                        })}
                    </div>
                </div>

                {/* Names */}
                <div style={{ display: 'flex', padding: '8px 16px 0 16px' }}>
                    {items.map((item) => {
                        return <div key={item.style} style={{ width: 88, margin: '0 8px', textAlign: 'center' }}>
                            <div style={{ fontSize: 12, color: '#cbd5e1', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }} title={item.name}>{item.name}</div>
                        </div>;
                    })}
                </div>
            </div>
        </div>
    </div>;
}



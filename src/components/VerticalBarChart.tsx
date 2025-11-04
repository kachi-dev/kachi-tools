import React, { useState, useEffect } from "react";
import iconsMapping from "../data/umamusume_icons/icons.json";

export type VerticalBarChartItem = {
    charaId: number,
    cardId?: number,
    value: number,
    name: string,
};

type VerticalBarChartProps = {
    items: VerticalBarChartItem[],
    valueLabel?: string,
    maxRowsPerPage?: number,
};

const transformIconPath = (path: string): string => {
    return path.replace(/^\/uma-tools\/icons\/chara\//, '');
};

const getIconUrl = (charaId?: number | null, cardId?: number | null): string | null => {
    if (charaId == null) return null;
    
    const iconsMap = iconsMapping as Record<string, string>;
    
    if (cardId != null) {
        const cardIdStr = cardId.toString();
        if (iconsMap[cardIdStr]) {
            const transformedPath = transformIconPath(iconsMap[cardIdStr]);
            try { return require(`../data/umamusume_icons/${transformedPath}`); } catch { }
        }
    }
    
    const charaIdStr = charaId.toString();
    if (iconsMap[charaIdStr]) {
        const transformedPath = transformIconPath(iconsMap[charaIdStr]);
        try { return require(`../data/umamusume_icons/${transformedPath}`); } catch { }
    }
    
    if (cardId != null) {
        try { return require(`../data/umamusume_icons/trained_chr_icon_${charaId}_${cardId}_02.png`); } catch { }
    }
    try { return require(`../data/umamusume_icons/chr_icon_${charaId}.png`); } catch { return null; }
};

export default function VerticalBarChart(props: VerticalBarChartProps) {
    const [currentPage, setCurrentPage] = useState(1);
    const maxRowsPerPage = props.maxRowsPerPage ?? 10;
    
    const items = props.items.filter(i => i.value > 0);
    
    useEffect(() => {
        setCurrentPage(1);
    }, [items.length]);
    if (items.length === 0) return <div className="text-muted">No data found.</div>;
    
    const totalPages = Math.ceil(items.length / maxRowsPerPage);
    const startIndex = (currentPage - 1) * maxRowsPerPage;
    const endIndex = startIndex + maxRowsPerPage;
    const displayedItems = items.slice(startIndex, endIndex);

    const colorPalette = [
        { from: '#60a5fa', to: '#2563eb' }, // Blue
        { from: '#34d399', to: '#059669' }, // Green
        { from: '#f472b6', to: '#db2777' }, // Pink
        { from: '#f59e0b', to: '#b45309' }, // Orange
        { from: '#a78bfa', to: '#7c3aed' }, // Purple
        { from: '#fb7185', to: '#e11d48' }, // Rose
        { from: '#38bdf8', to: '#0284c7' }, // Sky
        { from: '#fbbf24', to: '#d97706' }, // Amber
        { from: '#a3e635', to: '#65a30d' }, // Lime
        { from: '#f97316', to: '#c2410c' }, // Orange-red
        { from: '#ec4899', to: '#be185d' }, // Fuchsia
        { from: '#8b5cf6', to: '#6d28d9' }, // Violet
        { from: '#10b981', to: '#047857' }, // Emerald
        { from: '#06b6d4', to: '#0891b2' }, // Cyan
        { from: '#ef4444', to: '#dc2626' }, // Red
    ];

    const getBarColor = (idx: number) => {
        return colorPalette[idx % colorPalette.length];
    };

    const maxValue = items.length > 0 ? Math.max(...items.map(i => i.value)) : 0;
    const barHeight = 50;
    const iconSize = 44;
    const iconGap = 10;
    const chartHeight = displayedItems.length * (barHeight + iconGap) + iconGap;
    const xAxisLabelPadding = 28;
    
    const ticks = (() => {
        if (maxValue <= 10) {
            return Array.from({ length: maxValue + 1 }, (_, i) => i);
        }
        const roughStep = Math.ceil(maxValue / 5);
        const step = roughStep <= 5 ? 5 : roughStep <= 10 ? 10 : Math.ceil(roughStep / 5) * 5;
        const arr: number[] = [];
        for (let v = 0; v <= maxValue; v += step) arr.push(v);
        if (arr[arr.length - 1] !== maxValue) arr.push(maxValue);
        return arr;
    })();

    const createNavButton = (onClick: () => void, disabled: boolean, children: React.ReactNode) => (
        <button
            onClick={onClick}
            disabled={disabled}
            style={{
                padding: '6px 12px',
                border: '1px solid #2a2a2a',
                background: disabled ? '#1a1a1a' : '#0f0f0f',
                color: disabled ? '#4b5563' : '#e5e7eb',
                borderRadius: '6px',
                cursor: disabled ? 'not-allowed' : 'pointer',
                fontSize: 13,
                fontWeight: 500,
                transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
                if (!disabled) {
                    e.currentTarget.style.background = '#1a1a1a';
                    e.currentTarget.style.borderColor = '#3a3a3a';
                }
            }}
            onMouseLeave={(e) => {
                if (!disabled) {
                    e.currentTarget.style.background = '#0f0f0f';
                    e.currentTarget.style.borderColor = '#2a2a2a';
                }
            }}
        >
            {children}
        </button>
    );

    return (
        <div>
            <div style={{ display: 'flex', overflowX: 'hidden' }}>
                {/* Y-axis with icons */}
                <div style={{ width: 280, flexShrink: 0, position: 'relative' }}>
                    <div style={{ position: 'relative', minHeight: chartHeight }}>
                        {displayedItems.map((item, idx) => {
                            const iconUrl = getIconUrl(item.charaId, item.cardId) || '';
                            const y = idx * (barHeight + iconGap) + iconGap / 2;
                            return <div key={`${item.charaId}_${item.cardId || 0}`} style={{ 
                                position: 'absolute', 
                                top: y, 
                                left: 0,
                                width: '100%',
                                height: barHeight,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                            }}>
                                <div style={{ 
                                    width: iconSize, 
                                    height: iconSize, 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                }}>
                                    {iconUrl && <img src={iconUrl} alt="icon" style={{ width: iconSize - 6, height: iconSize - 6, borderRadius: 5 }} />}
                                </div>
                                <div style={{ 
                                    fontSize: 13, 
                                    fontWeight: 500,
                                    color: '#e5e7eb', 
                                    overflow: 'hidden', 
                                    whiteSpace: 'nowrap', 
                                    textOverflow: 'ellipsis',
                                    flex: 1,
                                }} title={item.name}>{item.name}</div>
                            </div>;
                        })}
                    </div>
                </div>

                {/* Plot area */}
                <div style={{ flex: 1, position: 'relative', minWidth: 280, overflow: 'hidden', paddingLeft: 12 }}>
                    <div style={{ position: 'relative', width: '100%', minHeight: chartHeight + xAxisLabelPadding }}>
                        {/* X-axis line */}
                        <div style={{ position: 'absolute', left: 0, top: 0, bottom: xAxisLabelPadding, width: 1, background: '#2a2a2a' }} />
                        
                        {/* Grid lines */}
                        {ticks.map((t, i) => {
                            const leftPercent = maxValue > 0 ? (t / maxValue) * 100 : 0;
                            return <div key={i} style={{ position: 'absolute', left: `${leftPercent}%`, top: 0, bottom: xAxisLabelPadding, width: 1, background: i === 0 ? '#2a2a2a' : '#1f2937' }} />;
                        })}
                        
                        {/* Tick labels */}
                        {ticks.map((t, i) => {
                            const leftPercent = maxValue > 0 ? (t / maxValue) * 100 : 0;
                            const clampedPercent = Math.max(0, Math.min(leftPercent, 100));
                            return <div key={i} style={{ position: 'absolute', left: `clamp(0px, calc(${clampedPercent}% - 22px), calc(100% - 44px))`, top: -22, width: 44, textAlign: 'center' }}>
                                <div style={{ fontSize: 13, color: '#9ca3af' }}>{t}</div>
                            </div>;
                        })}
                        
                        {/* Bars */}
                        {displayedItems.map((item, idx) => {
                            const y = idx * (barHeight + iconGap) + iconGap / 2;
                            const barHeightPx = 36;
                            const widthPercent = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
                            const colors = getBarColor(startIndex + idx);
                            const rgb = colors.to.match(/^#([0-9a-f]{6})$/i);
                            const shadowColor = rgb ? `rgba(${parseInt(rgb[1].slice(0,2), 16)},${parseInt(rgb[1].slice(2,4), 16)},${parseInt(rgb[1].slice(4,6), 16)},0.35)` : 'rgba(0,0,0,0.35)';
                            return <div key={`${item.charaId}_${item.cardId || 0}`} style={{ 
                                position: 'absolute', 
                                left: 0, 
                                top: y + (barHeight - barHeightPx) / 2,
                                width: '100%',
                                height: barHeightPx,
                                display: 'flex',
                                alignItems: 'center',
                            }}>
                                <div style={{ 
                                    position: 'relative', 
                                    width: `${widthPercent}%`, 
                                    minWidth: 6,
                                    height: barHeightPx, 
                                    borderRadius: 6, 
                                    background: `linear-gradient(90deg, ${colors.from} 0%, ${colors.to} 100%)`, 
                                    boxShadow: `0 2px 10px ${shadowColor}, inset 0 0 0 1px rgba(255,255,255,0.08)`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'flex-end',
                                    paddingRight: 10,
                                }}>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: '#ffffff', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>{item.value}</div>
                                </div>
                            </div>;
                        })}
                    </div>
                </div>
            </div>
            
            {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 20 }}>
                    {createNavButton(() => setCurrentPage(1), currentPage === 1, '««')}
                    {createNavButton(() => setCurrentPage(p => Math.max(1, p - 1)), currentPage === 1, '‹')}
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                        if (
                            page === 1 ||
                            page === totalPages ||
                            (page >= currentPage - 1 && page <= currentPage + 1)
                        ) {
                            const isActive = page === currentPage;
                            return (
                                <button
                                    key={page}
                                    onClick={() => setCurrentPage(page)}
                                    style={{
                                        padding: '6px 12px',
                                        border: `1px solid ${isActive ? '#3b82f6' : '#2a2a2a'}`,
                                        background: isActive ? '#2563eb' : '#0f0f0f',
                                        color: isActive ? '#ffffff' : '#e5e7eb',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontSize: 13,
                                        fontWeight: isActive ? 600 : 500,
                                        transition: 'all 0.2s',
                                        minWidth: '36px',
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!isActive) {
                                            e.currentTarget.style.background = '#1a1a1a';
                                            e.currentTarget.style.borderColor = '#3a3a3a';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!isActive) {
                                            e.currentTarget.style.background = '#0f0f0f';
                                            e.currentTarget.style.borderColor = '#2a2a2a';
                                        }
                                    }}
                                >
                                    {page}
                                </button>
                            );
                        } else if (page === currentPage - 2 || page === currentPage + 2) {
                            return (
                                <span key={page} style={{ color: '#6b7280', fontSize: 13, padding: '0 4px' }}>
                                    ...
                                </span>
                            );
                        }
                        return null;
                    })}
                    {createNavButton(() => setCurrentPage(p => Math.min(totalPages, p + 1)), currentPage === totalPages, '›')}
                    {createNavButton(() => setCurrentPage(totalPages), currentPage === totalPages, '»»')}
                </div>
            )}
        </div>
    );
}


import React from "react";
import BasicBarChart from "./BasicBarChart";

export type HitRateItem = { name: string, percent: number, key?: string | number };

type HitRateByStyleChartProps = {
    items: HitRateItem[],
    gradientFrom: string,
    gradientTo: string,
    height?: number,
};

export default function HitRateByStyleChart(props: HitRateByStyleChartProps) {
    const { items, gradientFrom, gradientTo, height = 240 } = props;
    const data = items.map(it => ({ label: it.name, value: it.percent, key: it.key }));
    return (
        <BasicBarChart
            data={data}
            gradientFrom={gradientFrom}
            gradientTo={gradientTo}
            height={height}
            yMax={100}
            yTicks={[0, 25, 50, 75, 100]}
            yAxisLabel="Hit-rate %"
            valueFormatter={(v) => `${v.toFixed(1)}%`}
        />
    );
}



import React from "react";
import VerticalBarChart, { VerticalBarChartItem } from "./VerticalBarChart";

export type WinsByUmaItem = {
    charaId: number,
    cardId?: number,
    name: string,
    wins: number,
};

type WinsByUmaChartProps = {
    items: WinsByUmaItem[],
};

export default function WinsByUmaChart(props: WinsByUmaChartProps) {
    const chartItems: VerticalBarChartItem[] = props.items.map(item => ({
        charaId: item.charaId,
        cardId: item.cardId,
        value: item.wins,
        name: item.name,
    }));

    return <VerticalBarChart items={chartItems} maxRowsPerPage={5} />;
}

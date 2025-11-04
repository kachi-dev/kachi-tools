import { TrainedCharaData } from "./TrainedCharaData";

export type PlayerWinRates = {
    playerName: string,
    totalRaces: number,
    wins: number,
    winRate: number, // percentage (0-100)
    byUma: {
        trainedCharaId: number,
        charaId: number,
        races: number,
        wins: number,
        winRate: number, // percentage (0-100)
        top2: number,
        top2Rate: number, // percentage (0-100)
        top3: number,
        top3Rate: number, // percentage (0-100)
        spurtSamples?: number,
        spurtCount?: number,
        spurtRate?: number, // percentage (0-100)
        staminaSamples?: number,
        staminaSurvivalCount?: number,
        staminaSurvivalRate?: number, // percentage (0-100)
        runningStyle?: number,
    }[],
};

export type WinRateInputItem = {
    trainedChara: TrainedCharaData,
    finishOrder: number,
    lastSpurtDistanceRatio?: number,
    zeroHpFrameCount?: number,
    raceId?: string,
    spurtSuccess?: '✓' | '✗' | '—',
    staminaSuccess?: '✓' | '✗',
    runningStyle?: number,
};

export function calculatePlayerWinRates(results: WinRateInputItem[], playerName: string): PlayerWinRates {
    const playerResults = results.filter(r => r.trainedChara.viewerName === playerName);

    const raceIds = new Set<string>();
    const winRaceIds = new Set<string>();
    for (const r of playerResults) {
        const id = r.raceId ?? `${r.trainedChara.trainedCharaId}-${r.finishOrder}`; // fallback to avoid empty set
        raceIds.add(id);
        if (r.finishOrder === 0) winRaceIds.add(id);
    }
    const totalRaces = raceIds.size;
    const wins = winRaceIds.size;
    const winRate = totalRaces === 0 ? 0 : wins / totalRaces * 100;

    const grouped = new Map<number, WinRateInputItem[]>();
    for (const r of playerResults) {
        const key = r.trainedChara.trainedCharaId;
        const arr = grouped.get(key);
        if (arr) {
            arr.push(r);
        } else {
            grouped.set(key, [r]);
        }
    }

    const byUma = Array.from(grouped.entries()).map(([trainedCharaId, arr]) => {
        const umaWins = arr.filter(r => r.finishOrder === 0).length;
        const umaRaces = arr.length;
        const top2 = arr.filter(r => r.finishOrder <= 1).length;
        const top3 = arr.filter(r => r.finishOrder <= 2).length;

        // Optional metrics only available for team race entries
        let spurtSamples = 0;
        let spurtCount = 0;
        let staminaSamples = 0;
        let staminaSurvivalCount = 0;
        const styleCounts = new Map<number, number>();

        for (const r of arr) {
            if (r.spurtSuccess !== undefined) {
                spurtSamples += 1;
                if (r.spurtSuccess === '✓') spurtCount += 1;
            } else if (typeof r.lastSpurtDistanceRatio === "number") {
                spurtSamples += 1;
                if (r.lastSpurtDistanceRatio > 0) spurtCount += 1;
            }

            if (r.staminaSuccess !== undefined) {
                staminaSamples += 1;
                if (r.staminaSuccess === '✓') staminaSurvivalCount += 1;
            } else if (typeof r.zeroHpFrameCount === "number") {
                staminaSamples += 1;
                if (r.zeroHpFrameCount === 0) staminaSurvivalCount += 1;
            }

            if (r.runningStyle !== undefined && r.runningStyle > 0) {
                styleCounts.set(r.runningStyle, (styleCounts.get(r.runningStyle) || 0) + 1);
            }
        }

        let mostCommonStyle: number | undefined = undefined;
        if (styleCounts.size > 0) {
            mostCommonStyle = Array.from(styleCounts.entries())
                .sort((a, b) => b[1] - a[1])[0][0];
        }

        return {
            trainedCharaId,
            charaId: arr[0].trainedChara.charaId,
            races: umaRaces,
            wins: umaWins,
            winRate: umaRaces === 0 ? 0 : umaWins / umaRaces * 100,
            top2,
            top2Rate: umaRaces === 0 ? 0 : top2 / umaRaces * 100,
            top3,
            top3Rate: umaRaces === 0 ? 0 : top3 / umaRaces * 100,
            spurtSamples: spurtSamples || undefined,
            spurtCount: spurtSamples ? spurtCount : undefined,
            spurtRate: spurtSamples ? (spurtCount / spurtSamples * 100) : undefined,
            staminaSamples: staminaSamples || undefined,
            staminaSurvivalCount: staminaSamples ? staminaSurvivalCount : undefined,
            staminaSurvivalRate: staminaSamples ? (staminaSurvivalCount / staminaSamples * 100) : undefined,
            runningStyle: mostCommonStyle,
        };
    }).sort((a, b) => b.winRate - a.winRate);

    return {
        playerName,
        totalRaces,
        wins,
        winRate,
        byUma,
    };
}



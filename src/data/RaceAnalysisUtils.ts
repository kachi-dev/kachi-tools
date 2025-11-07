import {RaceSimulateData, RaceSimulateEventData_SimulateEventType} from "./race_data_pb";
import {TrainedCharaData} from "./TrainedCharaData";

export enum FitRank {
    S = 8,
    A = 7,
    B = 6,
    C = 5,
    D = 4,
    E = 3,
    F = 2,
    G = 1,
}

enum Style {
    NIGE = 1,
    SEN = 2,
    SASI = 3,
    OI = 4,
    OONIGE = 0,
}

const distanceFitSpeedCoef: Record<number, number> = {
    [FitRank.S]: 1.05,
    [FitRank.A]: 1.0,
    [FitRank.B]: 0.9,
    [FitRank.C]: 0.8,
    [FitRank.D]: 0.6,
    [FitRank.E]: 0.4,
    [FitRank.F]: 0.2,
    [FitRank.G]: 0.1,
};

const styleSpeedCoefData: Record<number, Record<number, number>> = {
    [Style.OONIGE]: {
        0: 1.063,
        1: 0.962,
        2: 0.95,
        3: 0.95,
    },
    [Style.NIGE]: {
        0: 1.0,
        1: 0.98,
        2: 0.962,
        3: 0.962,
    },
    [Style.SEN]: {
        0: 0.978,
        1: 0.991,
        2: 0.975,
        3: 0.975,
    },
    [Style.SASI]: {
        0: 0.938,
        1: 0.998,
        2: 0.994,
        3: 0.994,
    },
    [Style.OI]: {
        0: 0.931,
        1: 1.0,
        2: 1.0,
        3: 1.0,
    },
};

export type LastSpurtStats = {
    success: '✓' | '✗' | '—',
    lastSpurtStartDistance: number,
    expectedLastSpurtPosition: number,
    delayDistance: number,
    maxSpurtSpeed: number,
    actualMaxSpeed: number,
    courseLength: number,
    staminaSuccess: '✓' | '✗',
    deathDistanceFromFinish: number,
};

export function calculateLastSpurtStats(
    raceData: RaceSimulateData,
    frameOrder: number,
    trainedChara: TrainedCharaData,
    runningStyle: number
): LastSpurtStats {
    const horseResult = raceData.horseResult[frameOrder];
    const lastSpurtStartDistance = horseResult.lastSpurtStartDistance!;
    
    const winnerIndex = raceData.horseResult.findIndex(hr => hr.finishOrder === 0);
    let goalInX = 0;
    
    if (winnerIndex >= 0 && raceData.frame.length) {
        const winnerFinish = raceData.horseResult[winnerIndex].finishTimeRaw!;
        const finishFrameIndex = raceData.frame.findIndex(frame => frame.time! >= winnerFinish);
        if (finishFrameIndex >= 0) {
            goalInX = raceData.frame[finishFrameIndex].horseFrame[winnerIndex].distance!;
        }
    }
    
    const courseLength = goalInX > 0 ? goalInX : Math.max(...raceData.frame.map(frame => frame.horseFrame[frameOrder].distance!));
    
    let staminaSuccess: '✓' | '✗' = '✓';
    let deathDistanceFromFinish = 0;
    
    for (const frame of raceData.frame) {
        const horseFrame = frame.horseFrame[frameOrder];
        const currentDistance = horseFrame.distance!;
        if (currentDistance >= courseLength) {
            break;
        }
        if (horseFrame.hp! <= 0) {
            const deathDistance = courseLength - currentDistance;
            if (deathDistance > 1) {
                staminaSuccess = '✗';
                deathDistanceFromFinish = deathDistance;
            }
            break;
        }
    }
    const expectedLastSpurtPosition = (courseLength * 2) / 3;
    
    const baseSpeed = 20.0 - (courseLength - 2000) / 1000.0;
    
    const distanceType = courseLength <= 1400 ? 1 :
                         courseLength <= 1800 ? 2 :
                         courseLength <= 2500 ? 3 : 4;
    
    const distanceFit = trainedChara.properDistances[distanceType] as FitRank;
    const distanceFitCoef = distanceFitSpeedCoef[distanceFit] || 1.0;
    
    const styleCoef = styleSpeedCoefData[runningStyle]?.[2] || 1.0;
    
    const modifiedSpeed = trainedChara.speed;
    
    const maxSpurtSpeed = (baseSpeed * (styleCoef + 0.01) +
        Math.sqrt(modifiedSpeed / 500.0) * distanceFitCoef) * 1.05 +
        Math.sqrt(500.0 * modifiedSpeed) * distanceFitCoef * 0.002;

    if (lastSpurtStartDistance <= 0) {
        return {
            success: '—',
            lastSpurtStartDistance: 0,
            expectedLastSpurtPosition,
            delayDistance: 0,
            maxSpurtSpeed,
            actualMaxSpeed: 0,
            courseLength,
            staminaSuccess,
            deathDistanceFromFinish,
        };
    }

    const lastSpurtStartIndex = raceData.frame.findIndex(frame => 
        frame.horseFrame[frameOrder].distance! >= lastSpurtStartDistance
    );

    let actualMaxSpeed = 0;
    if (lastSpurtStartIndex !== -1) {
        actualMaxSpeed = Math.max(...raceData.frame
            .slice(lastSpurtStartIndex)
            .map(frame => frame.horseFrame[frameOrder].speed!)) / 100.0;
    }

    const delayDistance = lastSpurtStartDistance - expectedLastSpurtPosition;
    
    if (Math.abs(delayDistance) > 10) {
        return {
            success: '✗',
            lastSpurtStartDistance,
            expectedLastSpurtPosition,
            delayDistance,
            maxSpurtSpeed,
            actualMaxSpeed,
            courseLength,
            staminaSuccess,
            deathDistanceFromFinish,
        };
    }

    const success = actualMaxSpeed > 0 && actualMaxSpeed >= maxSpurtSpeed ? '✓' : '✗';

    return {
        success,
        lastSpurtStartDistance,
        expectedLastSpurtPosition,
        delayDistance,
        maxSpurtSpeed,
        actualMaxSpeed,
        courseLength,
        staminaSuccess,
        deathDistanceFromFinish,
    };
}

export function calculateLastSpurtSuccess(
    raceData: RaceSimulateData,
    frameOrder: number,
    trainedChara: TrainedCharaData,
    runningStyle: number
): '✓' | '✗' | '—' {
    return calculateLastSpurtStats(raceData, frameOrder, trainedChara, runningStyle).success;
}

export type DebuffSetResult = {
    procs: number;
    opponents: Set<number>;
    hits: Set<number>;
};

// Computes occurrences and targeted indices for a given debuff skill across the race.
// Note: horseInfoRaw is currently unused but kept for signature compatibility/possible future needs.
export function computeDebuffSets(
    raceData: RaceSimulateData,
    horseInfoRaw: string,
    skillId: number,
): DebuffSetResult {
    const horseCount = raceData.horseResult?.length ?? 0;
    let procs = 0;
    const opponents: Set<number> = new Set();
    const hits: Set<number> = new Set();

    const namesByIdx: Record<number, string> = {};
    try {
        const parsed = JSON.parse(horseInfoRaw);
        const list = Array.isArray(parsed) ? parsed : [parsed];
        list.forEach((rh: any) => {
            const idx = (rh['frame_order'] || 1) - 1;
            if (idx >= 0) namesByIdx[idx] = rh['trainer_name'] || '';
        });
    } catch {}

    for (const wrapper of raceData.event) {
        const event = wrapper.event!;
        if (event.type !== RaceSimulateEventData_SimulateEventType.SKILL) continue;
        if (event.paramCount == null || event.paramCount < 2) continue;
        const evSkillId = event.param[1];
        if (evSkillId !== skillId) continue;

        procs += 1;
        const casterIdx = event.param[0] ?? -1;
        // param[4] is a bitmask of targets when present (>=5 params)
        if (event.paramCount >= 5) {
            const targetMask = event.param[4] >>> 0; // ensure unsigned
            for (let idx = 0; idx < horseCount; idx++) {
                if (namesByIdx[casterIdx] === namesByIdx[idx]) continue;
                opponents.add(idx);
                if ((targetMask & (1 << idx)) === 0) continue;
                hits.add(idx);
            }
        }
    }

    return { procs, opponents, hits };
}

export type DebuffProcDetail = {
	casterIdx: number;
	opponents: Set<number>;
	hits: Set<number>;
};

export function computeDebuffProcDetails(
	raceData: RaceSimulateData,
	horseInfoRaw: string,
	skillId: number,
): DebuffProcDetail[] {
	const horseCount = raceData.horseResult?.length ?? 0;
	const details: DebuffProcDetail[] = [];

	for (const wrapper of raceData.event) {
		const event = wrapper.event!;
		if (event.type !== RaceSimulateEventData_SimulateEventType.SKILL) continue;
		if (event.paramCount == null || event.paramCount < 5) continue;
		const evSkillId = event.param[1];
		if (evSkillId !== skillId) continue;

		const casterIdx = event.param[0] ?? -1;
		const opponents: Set<number> = new Set();
		const hits: Set<number> = new Set();
		const targetMask = event.param[4] >>> 0;
		for (let idx = 0; idx < horseCount; idx++) {
			if (idx === casterIdx) continue;
			opponents.add(idx);
			if ((targetMask & (1 << idx)) === 0) continue;
			hits.add(idx);
		}

		details.push({ casterIdx, opponents, hits });
	}

	return details;
}

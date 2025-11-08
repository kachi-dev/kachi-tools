import React from "react";
import { RaceSimulateData } from "../data/race_data_pb";
import { computeDebuffProcDetails, calculateLastSpurtStats } from "../data/RaceAnalysisUtils";
import { deserializeFromBase64 } from "../data/RaceDataParser";
import SkillOccurrenceChart from "./SkillOccurrenceChart";
import EyesHitRateByStyleChart from "./EyesHitRateByStyleChart";
import * as UMDatabaseUtils from "../data/UMDatabaseUtils";
import { fromRaceHorseData } from "../data/TrainedCharaData";

type SkillAnalysisRowProps = {
    skillName: string;
    skillId: number;
    races: { raceId: string, timestamp?: number, horseInfoRaw: string, raceScenario: string }[];
    lateSurgerSavvyIds?: Set<number>;
    isMystifyingMurmur?: boolean;
    isAllSeeingEyes?: boolean;
};

export default function SkillAnalysisRow(props: SkillAnalysisRowProps) {
    const { skillName, skillId, races, lateSurgerSavvyIds, isMystifyingMurmur, isAllSeeingEyes } = props;
    
    let totalProcs = 0;
    const occurrenceCounts: Record<number, number> = {};
    const denomByStyleWithSavvy: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const hitsByStyleWithSavvy: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const denomByStyleNoSavvy: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const hitsByStyleNoSavvy: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    
    const spurtByOccurrence: Record<number, { samples: number, successes: number }> = {};
    const staminaByOccurrence: Record<number, { samples: number, successes: number }> = {};

    for (const r of races) {
        let raceSim: RaceSimulateData;
        try {
            raceSim = deserializeFromBase64(r.raceScenario) as RaceSimulateData;
        } catch {
            continue;
        }
        const horseResults = raceSim.horseResult || [];

        try {
            const parsed = JSON.parse(r.horseInfoRaw);
            const list: any[] = Array.isArray(parsed) ? parsed : [parsed];
            const skillsByIdx: Record<number, Set<number>> = {};
            list.forEach((rh: any) => {
                const idx = (rh['frame_order'] || 1) - 1;
                const arr = Array.isArray(rh['skill_array']) ? rh['skill_array'] : [];
                skillsByIdx[idx] = new Set<number>(arr.map((s: any) => s['skill_id']));
            });

            const skillDetails = computeDebuffProcDetails(raceSim, r.horseInfoRaw, skillId);
            const occurrenceCount = skillDetails.length;
            occurrenceCounts[occurrenceCount] = (occurrenceCounts[occurrenceCount] || 0) + 1;
            
            if (isMystifyingMurmur || isAllSeeingEyes) {
                if (!spurtByOccurrence[occurrenceCount]) {
                    spurtByOccurrence[occurrenceCount] = { samples: 0, successes: 0 };
                }
                if (!staminaByOccurrence[occurrenceCount]) {
                    staminaByOccurrence[occurrenceCount] = { samples: 0, successes: 0 };
                }
                
                for (let idx = 0; idx < list.length; idx++) {
                    const rh = list[idx];
                    const frameOrder = (rh['frame_order'] || 1) - 1;
                    if (frameOrder < 0 || frameOrder >= horseResults.length) continue;
                    
                    try {
                        const trainedChara = fromRaceHorseData(rh);
                        const runningStyle = horseResults[frameOrder]?.runningStyle ?? rh['running_style'] ?? 0;
                        const spurtStats = calculateLastSpurtStats(raceSim, frameOrder, trainedChara, runningStyle);
                        
                        if (isMystifyingMurmur && spurtStats.success !== '—') {
                            spurtByOccurrence[occurrenceCount].samples += 1;
                            if (spurtStats.success === '✓') {
                                spurtByOccurrence[occurrenceCount].successes += 1;
                            }
                        }
                        
                        if (isAllSeeingEyes) {
                            staminaByOccurrence[occurrenceCount].samples += 1;
                            if (spurtStats.staminaSuccess === '✓') {
                                staminaByOccurrence[occurrenceCount].successes += 1;
                            }
                        }
                    } catch {}
                }
            }
            
            if (skillDetails.length > 0) {
                totalProcs += skillDetails.length;

                for (const dproc of skillDetails) {
                    const hasSavvy = lateSurgerSavvyIds && dproc.casterIdx >= 0 && !!skillsByIdx[dproc.casterIdx] && 
                        Array.from(skillsByIdx[dproc.casterIdx].values()).some(id => lateSurgerSavvyIds.has(id));
                    
                    if (hasSavvy) {
                        dproc.opponents.forEach(idx2 => {
                            const s = horseResults[idx2]?.runningStyle ?? 0;
                            if (s > 0) denomByStyleWithSavvy[s as 1|2|3|4] += 1;
                        });
                        dproc.hits.forEach(idx2 => {
                            const s = horseResults[idx2]?.runningStyle ?? 0;
                            if (s > 0) hitsByStyleWithSavvy[s as 1|2|3|4] += 1;
                        });
                    } else {
                        dproc.opponents.forEach(idx2 => {
                            const s = horseResults[idx2]?.runningStyle ?? 0;
                            if (s > 0) denomByStyleNoSavvy[s as 1|2|3|4] += 1;
                        });
                        dproc.hits.forEach(idx2 => {
                            const s = horseResults[idx2]?.runningStyle ?? 0;
                            if (s > 0) hitsByStyleNoSavvy[s as 1|2|3|4] += 1;
                        });
                    }
                }
            }
        } catch {}
    }

    const totalRaces = races.length || 1;
    
    const occurrenceKeys = Object.keys(occurrenceCounts).map(k => parseInt(k));
    const maxOccurrences = occurrenceKeys.length > 0 ? Math.max(...occurrenceKeys) : 0;
    const occurrenceFrequencyData = [];
    for (let i = 0; i <= maxOccurrences; i++) {
        const count = occurrenceCounts[i] || 0;
        const percentage = (count / totalRaces) * 100;
        occurrenceFrequencyData.push({
            label: `${i}x`,
            value: percentage,
        });
    }
    
    const rateByOccurrenceData = [];
    for (let i = 0; i <= maxOccurrences; i++) {
        if (isMystifyingMurmur && spurtByOccurrence[i]) {
            const stats = spurtByOccurrence[i];
            const rate = stats.samples > 0 ? (stats.successes / stats.samples) * 100 : 0;
            rateByOccurrenceData.push({
                label: `${i}x`,
                value: rate,
            });
        } else if (isAllSeeingEyes && staminaByOccurrence[i]) {
            const stats = staminaByOccurrence[i];
            const rate = stats.samples > 0 ? (stats.successes / stats.samples) * 100 : 0;
            rateByOccurrenceData.push({
                label: `${i}x`,
                value: rate,
            });
        }
    }

    const dualData = [1,2,3,4].map(s => ({
        key: s,
        label: UMDatabaseUtils.runningStyleLabels[s] || `${s}`,
        withSavvy: (() => {
            const denom = denomByStyleWithSavvy[s] || 0;
            const hits = hitsByStyleWithSavvy[s] || 0;
            return denom === 0 ? 0 : (hits / denom) * 100;
        })(),
        withoutSavvy: (() => {
            const denom = denomByStyleNoSavvy[s] || 0;
            const hits = hitsByStyleNoSavvy[s] || 0;
            return denom === 0 ? 0 : (hits / denom) * 100;
        })(),
    }));

    if (totalRaces === 0 || occurrenceFrequencyData.length === 0) {
        return <div className="text-muted">No {skillName} data found.</div>;
    }

    return (
        <div className="d-flex flex-wrap" style={{ gap: 12 }}>
            <div style={{ flex: '0 0 auto', width: Math.max(320, occurrenceFrequencyData.length * 80) }}>
                <div style={{ background: '#151515', border: '1px solid #2a2a2a', borderRadius: 8, padding: 12 }}>
                    <div className="d-flex align-items-center justify-content-between" style={{ marginBottom: 8 }}>
                        <div style={{ fontWeight: 600 }}>{skillName} frequency</div>
                    </div>
                    <SkillOccurrenceChart 
                        data={occurrenceFrequencyData}
                        yMax={100}
                        yAxisLabel="% of races"
                        valueFormatter={(v) => `${v.toFixed(1)}%`}
                    />
                </div>
            </div>

            {(isMystifyingMurmur || isAllSeeingEyes) && rateByOccurrenceData.length > 0 && (
                <div style={{ flex: '0 0 auto', width: Math.max(320, rateByOccurrenceData.length * 80) }}>
                    <div style={{ background: '#151515', border: '1px solid #2a2a2a', borderRadius: 8, padding: 12 }}>
                        <div className="d-flex align-items-center justify-content-between" style={{ marginBottom: 8 }}>
                            <div style={{ fontWeight: 600 }}>
                                {isMystifyingMurmur ? 'Spurt rate %' : 'Stamina survival rate %'}
                            </div>
                        </div>
                        <SkillOccurrenceChart 
                            data={rateByOccurrenceData}
                            yMax={100}
                            yAxisLabel={isMystifyingMurmur ? 'Spurt rate %' : 'Stamina survival %'}
                            valueFormatter={(v) => `${v.toFixed(1)}%`}
                        />
                    </div>
                </div>
            )}

            <div style={{ flex: '1 1 420px', minWidth: 320 }}>
                <div style={{ background: '#151515', border: '1px solid #2a2a2a', borderRadius: 8, padding: 12 }}>
                    <div className="d-flex align-items-center justify-content-between" style={{ marginBottom: 8 }}>
                        <div style={{ fontWeight: 600 }}>{skillName} hit-rate by style</div>
                        {lateSurgerSavvyIds && (
                            <div className="d-flex align-items-center" style={{ gap: 12 }}>
                                <div className="d-flex align-items-center" style={{ gap: 6 }}>
                                    <div style={{ width: 12, height: 12, borderRadius: 3, background: 'linear-gradient(180deg, #34d399 0%, #059669 100%)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }} />
                                    <div style={{ fontSize: 12, color: '#e5e7eb', whiteSpace: 'nowrap' }}>With Late Surger Savvy</div>
                                </div>
                                <div className="d-flex align-items-center" style={{ gap: 6 }}>
                                    <div style={{ width: 12, height: 12, borderRadius: 3, background: 'linear-gradient(180deg, #60a5fa 0%, #2563eb 100%)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }} />
                                    <div style={{ fontSize: 12, color: '#cbd5e1', whiteSpace: 'nowrap' }}>Without Late Surger Savvy</div>
                                </div>
                            </div>
                        )}
                    </div>
                    <EyesHitRateByStyleChart
                        data={dualData}
                        withGradientFrom="#34d399" withGradientTo="#059669"
                        withoutGradientFrom="#60a5fa" withoutGradientTo="#2563eb"
                        height={240}
                        yMax={100}
                        yTicks={[0,25,50,75,100]}
                        yAxisLabel="Hit-rate %"
                        valueFormatter={(v) => `${v.toFixed(1)}%`}
                    />
                </div>
            </div>
        </div>
    );
}


import React from "react";
import {Alert, Button, Form, Modal, Nav, Spinner, Table, Tab} from "react-bootstrap";
import BootstrapTable, { ColumnDescription, ExpandRowProps } from "react-bootstrap-table-next";
import {calculatePlayerWinRates, PlayerWinRates, WinRateInputItem} from "../data/DataAnalysisUtils";
import {deserializeFromBase64} from "../data/RaceDataParser";
import { computeDebuffProcDetails } from "../data/RaceAnalysisUtils";
import UMDatabaseWrapper from "../data/UMDatabaseWrapper";
import {calculateLastSpurtStats} from "../data/RaceAnalysisUtils";
import {fromRaceHorseData} from "../data/TrainedCharaData";
import {getCharaActivatedSkillIds} from "../data/RaceDataUtils";
import CharaProperLabels from "../components/CharaProperLabels";
import WinsByUmaChart, { WinsByUmaItem } from "../components/WinsByUmaChart";
import WinsByStyleChart, { WinsByStyleItem } from "../components/WinsByStyleChart";
import SkillAnalysisRow from "../components/SkillAnalysisRow";
import VerticalBarChart, { VerticalBarChartItem } from "../components/VerticalBarChart";
import * as UMDatabaseUtils from "../data/UMDatabaseUtils";

type MultiRaceParserPageState = {
    loading: boolean,
    results: WinRateInputItem[],
    nameFrequency: { name: string, count: number }[],
    selectedName?: string,
    summary?: PlayerWinRates,
    error?: string,
    races: { raceId: string, timestamp?: number, horseInfoRaw: string, raceScenario: string }[],
    showRaceModal: boolean,
    openingRaceId?: string,
    excludePlayerUmas: boolean,
};

export default class MultiRaceParserPage extends React.Component<{}, MultiRaceParserPageState> {
    private fileInputRef = React.createRef<HTMLInputElement>();
    constructor(props: {}) {
        super(props);
        this.state = {
            loading: false,
            results: [],
            nameFrequency: [],
            races: [],
            showRaceModal: false,
            excludePlayerUmas: false,
        };
    }

    async handleFiles(files: FileList | null) {
        if (!files || files.length === 0) return;
        this.setState({ loading: true, results: [], nameFrequency: [], selectedName: undefined, summary: undefined, error: undefined });

        const results: WinRateInputItem[] = [];
        const races: { raceId: string, timestamp?: number, horseInfoRaw: string, raceScenario: string }[] = [];
        const nameCounts = new Map<string, number>();

        const tasks = Array.from(files).map(async (file) => {
            try {
                // Support only .txt files used by the Race Parser (two lines: horseInfo JSON, scenario base64)
                if (/\.txt$/i.test(file.name)) {
                    const text = await file.text();
                    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
                    const horseInfoRaw = (lines[0] || '').replace(/^\uFEFF/, '');
                    const scenarioRaw = lines[1] || '';
                    try {
                        const horseInfoParsed = JSON.parse(horseInfoRaw);
                        const list: any[] = Array.isArray(horseInfoParsed) ? horseInfoParsed : [horseInfoParsed];
                        const raceSim = deserializeFromBase64(scenarioRaw.trim());
                        const winnerIndex = raceSim.horseResult.findIndex((hr: any) => hr.finishOrder === 0);
                        let courseLength = 0;
                        if (winnerIndex >= 0 && raceSim.frame.length) {
                            const winnerFinish = raceSim.horseResult[winnerIndex].finishTimeRaw!;
                            const finishFrameIndex = raceSim.frame.findIndex((frame: any) => frame.time! >= winnerFinish);
                            if (finishFrameIndex >= 0) {
                                courseLength = raceSim.frame[finishFrameIndex].horseFrame[winnerIndex].distance!;
                            }
                        }
                        if (courseLength <= 0) {
                            courseLength = Math.max(...raceSim.frame[0].horseFrame.map((_: any, idx: number) =>
                                Math.max(...raceSim.frame.map((f: any) => f.horseFrame[idx].distance!))));
                        }
                        const namesInThisTxt = new Set<string>();
                        for (const rh of list) {
                            const frameOrder = (rh['frame_order'] || 1) - 1;
                            const finishOrder = raceSim.horseResult[frameOrder]?.finishOrder ?? 999;
                            const viewerName = rh['trainer_name'];
                            if (viewerName) namesInThisTxt.add(viewerName);
                            const trainedChara = fromRaceHorseData(rh);
                            const runningStyle = raceSim.horseResult[frameOrder]?.runningStyle ?? rh['running_style'] ?? 0;
                            const spurtStats = calculateLastSpurtStats(raceSim, frameOrder, trainedChara, runningStyle);
                            results.push({
                                trainedChara,
                                finishOrder: finishOrder,
                                spurtSuccess: spurtStats.success,
                                staminaSuccess: spurtStats.staminaSuccess,
                                runningStyle: runningStyle,
                                raceId: file.name,
                            });
                        }
                        namesInThisTxt.forEach(n => nameCounts.set(n, (nameCounts.get(n) || 0) + 1));

                        // Store race for "View Race"
                        races.push({
                            raceId: file.name,
                            timestamp: (file as any).lastModified ?? undefined,
                            horseInfoRaw: JSON.stringify(horseInfoParsed),
                            raceScenario: scenarioRaw.trim(),
                        });
                    } catch {
                        // ignore malformed .txt
                    }
                }
            } catch (e) {
                // ignore individual file errors; continue others
            }
        });

        await Promise.all(tasks);

        const nameFrequency = Array.from(nameCounts.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

        const error = results.length === 0 ? "No supported race data found in the selected files." : undefined;

        let selectedName: string | undefined = undefined;
        let summary: PlayerWinRates | undefined = undefined;
        if (!error && nameFrequency.length > 0) {
            selectedName = nameFrequency[0].name;
            const filtered = results.filter(r => r.trainedChara.viewerName === selectedName);
            summary = calculatePlayerWinRates(filtered, selectedName);
        }

        this.setState({ loading: false, results, nameFrequency, error, selectedName, summary, races });
    }

    computeSummaryFor(name: string) {
        const { results } = this.state;
        const filtered = results.filter(r => r.trainedChara.viewerName === name);
        const summary = calculatePlayerWinRates(filtered, name);
        this.setState({ selectedName: name, summary });
    }

    renderSummary() {
        const { summary, races, selectedName } = this.state;
        if (!summary) return null;

        const getIconUrl = (charaId?: number | null): string | null => {
            if (charaId == null) return null;
            try { return require(`../data/umamusume_icons/chr_icon_${charaId}.png`); } catch { return null; }
        };

        const murmurId = 201161;
        const eyesId = 201441;

        const umaDebuffCounts = new Map<number, { murmurHits: number, eyesHits: number }>();
        const skillProcCounts = new Map<number, Map<number, { procCount: number, totalRaces: number }>>();
        const finishTimes = new Map<number, number[]>();
        for (const uma of summary.byUma) {
            umaDebuffCounts.set(uma.trainedCharaId, { murmurHits: 0, eyesHits: 0 });
            skillProcCounts.set(uma.trainedCharaId, new Map());
            finishTimes.set(uma.trainedCharaId, []);
        }

        if (selectedName) {
            for (const race of races) {
                let raceSim: any;
                try {
                    raceSim = deserializeFromBase64(race.raceScenario);
                } catch {
                    continue;
                }

                try {
                    const parsed = JSON.parse(race.horseInfoRaw);
                    const list: any[] = Array.isArray(parsed) ? parsed : [parsed];
                    
                    const umaIdxInRace = new Map<number, number>();
                    list.forEach((rh: any) => {
                        const trainerName = rh['trainer_name'];
                        if (trainerName === selectedName) {
                            const trainedCharaId = rh['trained_chara_id'];
                            const frameOrder = (rh['frame_order'] || 1) - 1;
                            umaIdxInRace.set(trainedCharaId, frameOrder);
                        }
                    });

                    for (const [trainedCharaId, idx] of umaIdxInRace.entries()) {
                        if (!umaDebuffCounts.has(trainedCharaId)) continue;

                        const murmurDetails = computeDebuffProcDetails(raceSim, race.horseInfoRaw, murmurId);
                        for (const dproc of murmurDetails) {
                            if (dproc.hits.has(idx)) {
                                const counts = umaDebuffCounts.get(trainedCharaId)!;
                                counts.murmurHits += 1;
                            }
                        }

                        const eyesDetails = computeDebuffProcDetails(raceSim, race.horseInfoRaw, eyesId);
                        for (const dproc of eyesDetails) {
                            if (dproc.hits.has(idx)) {
                                const counts = umaDebuffCounts.get(trainedCharaId)!;
                                counts.eyesHits += 1;
                            }
                        }

                        const activatedSkillIds = getCharaActivatedSkillIds(raceSim, idx);
                        const skillProcs = skillProcCounts.get(trainedCharaId);
                        if (skillProcs) {
                            const tc = this.state.results.find(r => r.trainedChara.trainedCharaId === trainedCharaId)?.trainedChara;
                            if (tc) {
                                for (const skill of tc.skills || []) {
                                    if (!skillProcs.has(skill.skillId)) {
                                        skillProcs.set(skill.skillId, { procCount: 0, totalRaces: 0 });
                                    }
                                    const stats = skillProcs.get(skill.skillId)!;
                                    stats.totalRaces += 1;
                                    if (activatedSkillIds.has(skill.skillId)) {
                                        stats.procCount += 1;
                                    }
                                }
                            }
                        }

                        const finishTimeRaw = raceSim.horseResult[idx]?.finishTimeRaw;
                        if (finishTimeRaw != null) {
                            const times = finishTimes.get(trainedCharaId);
                            if (times) {
                                times.push(finishTimeRaw * 1.18);
                            }
                        }
                    }
                } catch {
                    continue;
                }
            }
        }

        const rows = summary.byUma.map(u => {
            const debuffCounts = umaDebuffCounts.get(u.trainedCharaId) || { murmurHits: 0, eyesHits: 0 };
            const times = finishTimes.get(u.trainedCharaId) || [];
            let medianTime: number | null = null;
            
            if (times.length > 0) {
                const sorted = [...times].sort((a, b) => a - b);
                const mid = Math.floor(sorted.length / 2);
                medianTime = sorted.length % 2 === 0 
                    ? (sorted[mid - 1] + sorted[mid]) / 2 
                    : sorted[mid];
            }
            
            return {
                ...u,
                trainedChara: this.state.results.find(r => r.trainedChara.trainedCharaId === u.trainedCharaId)?.trainedChara,
                murmurHits: debuffCounts.murmurHits,
                eyesHits: debuffCounts.eyesHits,
                medianTime,
            };
        });

        const formatTime = (time: number): string => {
            const min = Math.floor(time / 60);
            const sec = time - min * 60;
            const secStr = sec.toFixed(3);
            const secParts = secStr.split('.');
            const secInt = secParts[0].padStart(2, '0');
            return `${min}:${secInt}.${secParts[1]}`;
        };

        const columns: ColumnDescription<typeof rows[number]>[] = [
            {
                dataField: 'trainedCharaId', text: 'TCID', sort: true,
                headerStyle: { width: '50px' }, style: { width: '50px', whiteSpace: 'nowrap' }
            },
            {
                dataField: 'charaId',
                text: 'Chara',
                headerStyle: { width: '150px' }, style: { width: '150px', whiteSpace: 'nowrap' },
                formatter: (cell, row) => {
                    const chara = UMDatabaseWrapper.charas[row.charaId];
                    const url = getIconUrl(row.charaId);
                    return <div className="d-flex align-items-center">
                        {url && <img src={url} alt="icon" style={{width: 24, height: 24, marginRight: 8}}/>}
                        <span>{chara ? chara.name : row.charaId}</span>
                    </div>;
                },
            },
            {
                dataField: 'runningStyle',
                text: 'Style',
                sort: true,
                headerStyle: { width: '120px' }, style: { width: '120px', whiteSpace: 'nowrap' },
                formatter: (cell, row) => {
                    if (row.runningStyle === undefined || row.runningStyle === 0) return '-';
                    return UMDatabaseUtils.runningStyleLabels[row.runningStyle] || `${row.runningStyle}`;
                },
            },
            { dataField: 'races', text: 'Races', sort: true, headerStyle: { width: '80px' }, style: { width: '80px', textAlign: 'right' } },
            { dataField: 'wins', text: 'Wins', sort: true, headerStyle: { width: '80px' }, style: { width: '80px', textAlign: 'right' } },
            { dataField: 'winRate', text: 'WR%', sort: true, headerStyle: { width: '90px' }, style: { width: '90px', textAlign: 'right' }, formatter: (v) => (v as number).toFixed(2) },
            { dataField: 'top2Rate', text: 'Top2%', sort: true, headerStyle: { width: '90px' }, style: { width: '90px', textAlign: 'right' }, formatter: (v) => (v as number).toFixed(2) },
            { dataField: 'top3Rate', text: 'Top3%', sort: true, headerStyle: { width: '90px' }, style: { width: '90px', textAlign: 'right' }, formatter: (v) => (v as number).toFixed(2) },
            { dataField: 'spurtRate', text: 'Spurt%', sort: true, headerStyle: { width: '90px' }, style: { width: '90px', textAlign: 'right' }, formatter: (v, row) => row.spurtRate !== undefined ? (row.spurtRate as number).toFixed(2) : '-' },
            { dataField: 'staminaSurvivalRate', text: 'Stamina%', sort: true, headerStyle: { width: '100px' }, style: { width: '100px', textAlign: 'right' }, formatter: (v, row) => row.staminaSurvivalRate !== undefined ? (row.staminaSurvivalRate as number).toFixed(2) : '-' },
            { dataField: 'medianTime', text: 'Median Time', sort: true, headerStyle: { width: '110px' }, style: { width: '110px', textAlign: 'right', whiteSpace: 'nowrap' }, formatter: (v, row) => row.medianTime !== null ? formatTime(row.medianTime) : '-' },
        ];

        const expandRow: ExpandRowProps<typeof rows[number]> = {
            renderer: row => {
                const tc = row.trainedChara;
                const skillProcs = skillProcCounts.get(row.trainedCharaId);
                const times = finishTimes.get(row.trainedCharaId) || [];
                
                let fastest: number | null = null;
                let median: number | null = null;
                let average: number | null = null;
                let slowest: number | null = null;
                
                if (times.length > 0) {
                    const sorted = [...times].sort((a, b) => a - b);
                    fastest = sorted[0];
                    slowest = sorted[sorted.length - 1];
                    average = times.reduce((sum, t) => sum + t, 0) / times.length;
                    const mid = Math.floor(sorted.length / 2);
                    median = sorted.length % 2 === 0 
                        ? (sorted[mid - 1] + sorted[mid]) / 2 
                        : sorted[mid];
                }
                
                return <div className="d-flex flex-row align-items-start">
                    <Table size="small" className="w-auto m-2">
                        <thead>
                            <tr>
                                <th>Skill</th>
                                <th>Lv</th>
                                <th>Proc%</th>
                            </tr>
                        </thead>
                        <tbody>
                        {(tc?.skills ?? []).map(cs => {
                            const procStats = skillProcs?.get(cs.skillId);
                            const procRate = procStats && procStats.totalRaces > 0 
                                ? (procStats.procCount / procStats.totalRaces) * 100 
                                : null;
                            return (
                                <tr key={cs.skillId}>
                                    <td>{UMDatabaseWrapper.skillNameWithId(cs.skillId)}</td>
                                    <td>Lv {cs.level}</td>
                                    <td>{procRate !== null ? `${procRate.toFixed(1)}%` : '-'}</td>
                                </tr>
                            );
                        })}
                        </tbody>
                    </Table>
                    <div className="d-flex flex-column">
                        <Table size="small" className="w-auto m-2">
                            <tbody>
                            <tr>
                                <td>Speed</td><td>{tc?.speed ?? '-'}</td>
                                <td>Stamina</td><td>{tc?.stamina ?? '-'}</td>
                                <td>Power</td><td>{tc?.pow ?? '-'}</td>
                                <td>Guts</td><td>{tc?.guts ?? '-'}</td>
                                <td>Wit</td><td>{tc?.wiz ?? '-'}</td>
                            </tr>
                            </tbody>
                        </Table>
                        {tc && <CharaProperLabels chara={tc} />}
                        {times.length > 0 && (
                            <Table size="small" className="w-auto m-2">
                                <tbody>
                                <tr><td>Fastest</td><td>{formatTime(fastest!)}</td></tr>
                                <tr><td>Median</td><td>{formatTime(median!)}</td></tr>
                                <tr><td>Average</td><td>{formatTime(average!)}</td></tr>
                                <tr><td>Slowest</td><td>{formatTime(slowest!)}</td></tr>
                                </tbody>
                            </Table>
                        )}
                    </div>
                    <Table size="small" className="w-auto m-2">
                        <tbody>
                        <tr><td colSpan={2}><strong>Debuffs</strong></td></tr>
                        <tr><td>Mystifying Murmur</td><td>{row.murmurHits ?? 0}</td></tr>
                        <tr><td>All-Seeing Eyes</td><td>{row.eyesHits ?? 0}</td></tr>
                        </tbody>
                    </Table>
                </div>;
            },
            showExpandColumn: true,
            expandByColumnOnly: false,
        };

        return <>
            <h5>Player: {summary.playerName}</h5>
            <div className="d-flex align-items-center justify-content-between">
                <div>Races: {summary.totalRaces} / Wins: {summary.wins} / WR: {summary.winRate.toFixed(2)}%</div>
                <div>
                    <Button size="sm" variant="secondary" onClick={() => this.setState({ showRaceModal: true })}>View races</Button>
                </div>
            </div>
            <BootstrapTable bootstrap4 condensed hover
                            classes="responsive-bootstrap-table"
                            wrapperClasses="table-responsive mt-2"
                            data={rows}
                            keyField="trainedCharaId"
                            columns={columns}
                            expandRow={expandRow}
            />
            {this.renderRaceModal()}
        </>;
    }

    private buildContentNonAnon = (horseInfoRaw: string, scenarioRaw: string): string => {
        const raceHorseInfo = (() => { try { return JSON.stringify(JSON.parse(horseInfoRaw)); } catch { return horseInfoRaw.trim(); } })();
        const raceScenario = scenarioRaw.trim();
        return JSON.stringify({ raceHorseInfo, raceScenario });
    };

    private openRace = async (raceId: string) => {
        const { races } = this.state;
        const r = races.find(x => x.raceId === raceId);
        if (!r) return;
        this.setState({ openingRaceId: raceId });
        try {
            const content = this.buildContentNonAnon(r.horseInfoRaw, r.raceScenario);
            const res = await fetch('https://sourceb.in/api/bins', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: [{ content }] }),
            });
            const data = await res.json();
            if (data.key) {
                const url = `${window.location.origin}${window.location.pathname}#/racedata?bin=${data.key}`;
                window.open(url, '_blank');
            }
        } finally {
            this.setState({ openingRaceId: undefined });
        }
    };

    renderRaceModal() {
        const { showRaceModal, selectedName, races, results, openingRaceId } = this.state;
        if (!showRaceModal || !selectedName) return null;

        const getIconUrl = (charaId?: number | null): string | null => {
            if (charaId == null) return null;
            try { return require(`../data/umamusume_icons/chr_icon_${charaId}.png`); } catch { return null; }
        };

        const parseNameDate = (name: string): { epoch: number, label: string } | undefined => {
            const m = name.match(/(\d{8})_(\d{6})/);
            if (!m) return undefined;
            const d = m[1], t = m[2];
            const year = parseInt(d.slice(0, 4), 10);
            const month = parseInt(d.slice(4, 6), 10) - 1;
            const day = parseInt(d.slice(6, 8), 10);
            const hour = parseInt(t.slice(0, 2), 10);
            const min = parseInt(t.slice(2, 4), 10);
            const sec = parseInt(t.slice(4, 6), 10);
            const date = new Date(year, month, day, hour, min, sec);
            const pad = (n: number) => n.toString().padStart(2, '0');
            const label = `${year}-${pad(month + 1)}-${pad(day)} ${pad(hour)}:${pad(min)}:${pad(sec)}`;
            return { epoch: date.getTime(), label };
        };

        const parsedRaces = races
            .map(r => ({
                ...r,
                list: (() => { try { const parsed = JSON.parse(r.horseInfoRaw); return Array.isArray(parsed) ? parsed : [parsed]; } catch { return []; } })(),
                dt: (() => {
                    const byName = parseNameDate(r.raceId);
                    if (byName) return byName;
                    if (r.timestamp) {
                        const d = new Date(r.timestamp);
                        const pad = (n: number) => n.toString().padStart(2, '0');
                        return {
                            epoch: r.timestamp,
                            label: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
                        };
                    }
                    return { epoch: 0, label: '' };
                })()
            }))
            .filter(r => r.list.some((rh: any) => rh['trainer_name'] === selectedName))
            .sort((a, b) => (b.dt?.epoch ?? 0) - (a.dt?.epoch ?? 0));

        return <Modal show onHide={() => this.setState({ showRaceModal: false })} size="xl" dialogClassName="bg-dark text-white">
            <Modal.Header closeButton className="bg-dark text-white border-secondary">
                <Modal.Title>Races</Modal.Title>
            </Modal.Header>
            <Modal.Body className="bg-dark text-white">
                <Table striped bordered hover size="sm" className="table-dark">
                    <tbody>
                    {parsedRaces.map(r => {
                        // players in this race
                        const playerNamesSet = new Set<string>();
                        r.list.forEach((rh: any) => { if (rh['trainer_name']) playerNamesSet.add(rh['trainer_name']); });
                        const playerNames = Array.from(playerNamesSet);
                        playerNames.sort((a, b) => (a === selectedName ? -1 : b === selectedName ? 1 : a.localeCompare(b)));

                        return <tr key={r.raceId}>
                            {/* Leftmost cell: parsed date/time from filename */}
                            <td className="text-nowrap align-middle" style={{ minWidth: 170 }}>{r.dt?.label || ''}</td>
                            {playerNames.map((name) => {
                                const horses = r.list.filter((rh: any) => rh['trainer_name'] === name).slice(0, 3);
                                const isWin = results.some(e => e.raceId === r.raceId && e.trainedChara.viewerName === name && e.finishOrder === 0);
                                return <td key={name} className="text-center align-middle" style={{ minWidth: 160 }}>
                                    <div className="d-flex justify-content-center mb-1">
                                        {horses.map((h: any, idx: number) => {
                                            const url = getIconUrl(h['chara_id']);
                                            const isHorseWinner = results.some(e => e.raceId === r.raceId && e.trainedChara.trainedCharaId === h['trained_chara_id'] && e.finishOrder === 0);
                                            return <div key={idx} style={{ position: 'relative', width: 28, height: 28, margin: '0 4px' }}>
                                                <img src={url || ''} alt="icon" style={{ width: 28, height: 28 }} />
                                                {isHorseWinner && <div style={{ position: 'absolute', top: -1, right: 0, color: '#d4af37', fontSize: 12, lineHeight: 1, textShadow: '0 1px 2px rgba(0,0,0,0.6), 0 0 1px rgba(0,0,0,0.5)' }}>★</div>}
                                            </div>
                                        })}
                                    </div>
                                    <div style={{ fontWeight: name === selectedName ? 700 : 400 }}>{name}</div>
                                    <div style={{ color: isWin ? '#d4af37' : '#888' }}>{isWin ? 'Win' : 'Lose'}</div>
                                </td>;
                            })}
                            {/* Rightmost cell with centered View button */}
                            <td className="text-center align-middle" style={{ whiteSpace: 'nowrap' }}>
                                <Button size="sm" variant="primary" onClick={() => this.openRace(r.raceId)} disabled={openingRaceId === r.raceId}>
                                    {openingRaceId === r.raceId ? 'Opening…' : 'View Race'}
                                </Button>
                            </td>
                        </tr>;
                    })}
                    </tbody>
                </Table>
            </Modal.Body>
            <Modal.Footer className="bg-dark text-white border-secondary">
                <Button variant="secondary" onClick={() => this.setState({ showRaceModal: false })}>Close</Button>
            </Modal.Footer>
        </Modal>;
    }

    render() {
        const { loading, nameFrequency, selectedName, error, results } = this.state;

        return <div className="mt-3">
            {error && <Alert variant="warning" className="mt-3">{error}</Alert>}

            <div className="mt-3">
                <Tab.Container defaultActiveKey="player" id="multirace-tabs">
                    <div className="bg-dark text-white p-2 rounded border border-secondary d-flex align-items-center justify-content-between">
                        <Nav variant="pills">
                            <Nav.Item>
                                <Nav.Link eventKey="player">Player analysis</Nav.Link>
                            </Nav.Item>
                            <Nav.Item>
                                <Nav.Link eventKey="data">Data analysis</Nav.Link>
                            </Nav.Item>
                        </Nav>
                        <div className="d-flex align-items-center">
                            <input
                                ref={this.fileInputRef}
                                type="file"
                                multiple
                                style={{ display: 'none' }}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                    this.handleFiles(e.currentTarget.files);
                                    if (this.fileInputRef.current) this.fileInputRef.current.value = '';
                                }}
                            />
                            <Button size="sm" variant="secondary" onClick={() => this.fileInputRef.current?.click()} disabled={loading}>
                                Upload files
                            </Button>
                            <div className="ml-2" style={{ minWidth: 220 }}>
                                <Form.Control as="select" size="sm" custom
                                              disabled={loading || nameFrequency.length === 0}
                                              value={selectedName || ''}
                                              onChange={e => this.computeSummaryFor((e.target as HTMLSelectElement).value)}>
                                    <option value="" disabled>Select player</option>
                                    {nameFrequency.map(nf => <option key={nf.name} value={nf.name}>{nf.name} ({nf.count})</option>)}
                                </Form.Control>
                            </div>
                            <div className="ml-2">
                                {loading && <><Spinner animation="border" size="sm"/> <span className="text-muted">Parsing…</span></>}
                                {!loading && results.length > 0 && <span className="text-muted">Parsed: {results.length} • Players: {nameFrequency.length}</span>}
                            </div>
                        </div>
                    </div>
                    <Tab.Content className="mt-3">
                        <Tab.Pane eventKey="player">
                            <div className="mt-3">
                                {this.renderSummary()}
                            </div>
                        </Tab.Pane>
                        <Tab.Pane eventKey="data">
                            {(() => {
                                const { results, selectedName, excludePlayerUmas } = this.state;
                                
                                let excludedPlayers = new Set<string>();
                                
                                if (excludePlayerUmas) {
                                    if (selectedName) {
                                        excludedPlayers.add(selectedName);
                                    }
                                    
                                    const playerRaceCounts = new Map<string, Set<string>>();
                                    for (const r of results) {
                                        const playerName = r.trainedChara.viewerName;
                                        if (playerName) {
                                            if (!playerRaceCounts.has(playerName)) {
                                                playerRaceCounts.set(playerName, new Set());
                                            }
                                            const raceId = r.raceId || '';
                                            if (raceId) {
                                                playerRaceCounts.get(playerName)!.add(raceId);
                                            }
                                        }
                                    }
                                    
                                    for (const [playerName, raceIds] of playerRaceCounts.entries()) {
                                        if (raceIds.size > 5) {
                                            excludedPlayers.add(playerName);
                                        }
                                    }
                                }
                                
                                const chartResults = excludedPlayers.size > 0
                                    ? results.filter(r => !excludedPlayers.has(r.trainedChara.viewerName))
                                    : results;
                                const umaFrequency = new Map<number, number>();
                                const cardIdToCharaId = new Map<number, number>();
                                for (const r of chartResults) {
                                    const cid = r.trainedChara.cardId;
                                    if (cid != null) {
                                        umaFrequency.set(cid, (umaFrequency.get(cid) || 0) + 1);
                                        if (!cardIdToCharaId.has(cid)) {
                                            cardIdToCharaId.set(cid, r.trainedChara.charaId);
                                        }
                                    }
                                }
                                const umaOverviewItems: VerticalBarChartItem[] = Array.from(umaFrequency.entries())
                                    .map(([cardId, count]) => {
                                        const charaId = cardIdToCharaId.get(cardId) ?? 0;
                                        const charaName = UMDatabaseWrapper.charas[charaId]?.name || '';
                                        const cardName = UMDatabaseWrapper.cards[cardId]?.name || `${cardId}`;
                                        const cardNameClean = cardName.trim();
                                        const hasBrackets = cardNameClean.startsWith('[') && cardNameClean.endsWith(']');
                                        const cardDisplay = hasBrackets ? cardNameClean : `[${cardNameClean}]`;
                                        const displayName = charaName && cardNameClean !== charaName 
                                            ? `${cardDisplay} ${charaName}` 
                                            : cardNameClean;
                                        return {
                                            charaId: charaId,
                                            cardId: cardId,
                                            value: count,
                                            name: displayName,
                                        };
                                    })
                                    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

                                const winCounts = new Map<number, number>();
                                const cardIdToCharaIdForWins = new Map<number, number>();
                                for (const r of chartResults) {
                                    if (r.finishOrder === 0) {
                                        const cardId = r.trainedChara.cardId;
                                        if (cardId != null) {
                                            winCounts.set(cardId, (winCounts.get(cardId) || 0) + 1);
                                            if (!cardIdToCharaIdForWins.has(cardId)) {
                                                cardIdToCharaIdForWins.set(cardId, r.trainedChara.charaId);
                                            }
                                        } else {
                                            const cid = r.trainedChara.charaId;
                                            if (cid != null) winCounts.set(cid, (winCounts.get(cid) || 0) + 1);
                                        }
                                    }
                                }
                                const items: WinsByUmaItem[] = Array.from(winCounts.entries())
                                    .map(([id, wins]) => {
                                        const cardId = cardIdToCharaIdForWins.has(id) ? id : undefined;
                                        const charaId = cardIdToCharaIdForWins.get(id) ?? id;
                                        const charaName = UMDatabaseWrapper.charas[charaId]?.name || '';
                                        const cardName = cardId ? (UMDatabaseWrapper.cards[cardId]?.name || `${cardId}`) : '';
                                        const cardNameClean = cardName.trim();
                                        const hasBrackets = cardNameClean.startsWith('[') && cardNameClean.endsWith(']');
                                        const cardDisplay = hasBrackets ? cardNameClean : `[${cardNameClean}]`;
                                        const displayName = cardId && charaName && cardNameClean !== charaName 
                                            ? `${cardDisplay} ${charaName}` 
                                            : cardNameClean || charaName || `${id}`;
                                        return {
                                            charaId,
                                            cardId,
                                            wins,
                                            name: displayName,
                                        };
                                    })
                                    .sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name));
                                // Aggregate wins by running style (winners only)
                                const styleCounts = new Map<number, number>();
                                for (const r of chartResults) {
                                    if (r.finishOrder === 0) {
                                        const style = r.runningStyle ?? 0;
                                        if (style > 0) styleCounts.set(style, (styleCounts.get(style) || 0) + 1);
                                    }
                                }
                                const styles: WinsByStyleItem[] = Array.from(styleCounts.entries())
                                    .map(([style, wins]) => ({
                                        style,
                                        wins,
                                        name: UMDatabaseUtils.runningStyleLabels[style] || `${style}`,
                                    }))
                                    .sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name));

                                const murmurId = 201161; // Mystifying Murmur
                                const eyesId = 201441;   // All-Seeing Eyes
                                const lateSurgerSavvyIds = new Set([201541, 201542]); // Late Surger Savvy

                                const { races } = this.state;

                                return <>
                                    <div style={{ background: '#0f0f0f', border: '1px solid #2a2a2a', borderRadius: 8, padding: 12 }}>
                                        <div className="d-flex align-items-center justify-content-between" style={{ marginBottom: 8 }}>
                                            <div style={{ fontWeight: 600 }}>Uma overview</div>
                                            <Form.Check
                                                type="switch"
                                                id="exclude-player-umas"
                                                label="Exclude player's umas"
                                                checked={!!excludePlayerUmas}
                                                disabled={!selectedName}
                                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => this.setState({ excludePlayerUmas: e.currentTarget.checked })}
                                            />
                                        </div>
                                        <div className="d-flex flex-wrap" style={{ gap: 12 }}>
                                            <div style={{ flex: '1 1 420px', minWidth: 320 }}>
                                                <div style={{ background: '#151515', border: '1px solid #2a2a2a', borderRadius: 8, padding: 12 }}>
                                                    <div className="d-flex align-items-center justify-content-between" style={{ marginBottom: 8 }}>
                                                        <div style={{ fontWeight: 600 }}>Number of umas</div>
                                                    </div>
                                                    <VerticalBarChart items={umaOverviewItems} maxRowsPerPage={11} />
                                                </div>
                                            </div>
                                            <div style={{ flex: '1 1 420px', minWidth: 320 }}>
                                                <div style={{ background: '#151515', border: '1px solid #2a2a2a', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                                                    <div className="d-flex align-items-center justify-content-between" style={{ marginBottom: 8 }}>
                                                        <div style={{ fontWeight: 600 }}>Wins by uma</div>
                                                    </div>
                                                    <WinsByUmaChart items={items}/>
                                                </div>
                                                <WinsByStyleChart items={styles} />
                                            </div>
                                        </div>
                                    </div>
                                    {/* Debuffer overview */}
                                    <div className="mt-3" style={{ background: '#0b0b0b', border: '1px solid #2a2a2a', borderRadius: 8, padding: 12 }}>
                                        <div className="d-flex align-items-center justify-content-between" style={{ marginBottom: 8 }}>
                                            <div style={{ fontWeight: 600 }}>Debuffer overview</div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                            {/* First row: All-Seeing Eyes */}
                                            <SkillAnalysisRow
                                                skillName="All-Seeing Eyes"
                                                skillId={eyesId}
                                                races={races}
                                                lateSurgerSavvyIds={lateSurgerSavvyIds}
                                                isAllSeeingEyes={true}
                                            />

                                            {/* Divider */}
                                            <div style={{ height: 1, background: 'linear-gradient(90deg, transparent 0%, #2a2a2a 20%, #2a2a2a 80%, transparent 100%)', margin: '4px 0' }} />

                                            {/* Second row: Mystifying Murmur */}
                                            <SkillAnalysisRow
                                                skillName="Mystifying Murmur"
                                                skillId={murmurId}
                                                races={races}
                                                lateSurgerSavvyIds={lateSurgerSavvyIds}
                                                isMystifyingMurmur={true}
                                            />
                                        </div>
                                    </div>
                                </>;
                            })()}
                        </Tab.Pane>
                    </Tab.Content>
                </Tab.Container>
            </div>
        </div>;
    }
}



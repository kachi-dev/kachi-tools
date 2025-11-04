import React from "react";
import {Alert, Button, Form, Modal, Nav, Spinner, Table, Tab} from "react-bootstrap";
import BootstrapTable, { ColumnDescription, ExpandRowProps } from "react-bootstrap-table-next";
import {calculatePlayerWinRates, PlayerWinRates, WinRateInputItem} from "../data/DataAnalysisUtils";
import {deserializeFromBase64} from "../data/RaceDataParser";
import { computeDebuffSets, computeDebuffProcDetails } from "../data/RaceAnalysisUtils";
import { RaceSimulateEventData_SimulateEventType } from "../data/race_data_pb";
import UMDatabaseWrapper from "../data/UMDatabaseWrapper";
import {calculateLastSpurtStats} from "../data/RaceAnalysisUtils";
import {fromRaceHorseData} from "../data/TrainedCharaData";
import CharaProperLabels from "../components/CharaProperLabels";
import WinsByUmaChart, { WinsByUmaItem } from "../components/WinsByUmaChart";
import WinsByStyleChart, { WinsByStyleItem } from "../components/WinsByStyleChart";
import SkillOccurrenceChart from "../components/SkillOccurrenceChart";
import HitRateByStyleChart from "../components/HitRateByStyleChart";
import EyesHitRateByStyleChart from "../components/EyesHitRateByStyleChart";
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
        const { summary } = this.state;
        if (!summary) return null;

        const getIconUrl = (charaId?: number | null): string | null => {
            if (charaId == null) return null;
            try { return require(`../data/umamusume_icons/chr_icon_${charaId}.png`); } catch { return null; }
        };

        const rows = summary.byUma.map(u => {
            return {
                ...u,
                trainedChara: this.state.results.find(r => r.trainedChara.trainedCharaId === u.trainedCharaId)?.trainedChara,
            };
        });

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
        ];

        const expandRow: ExpandRowProps<typeof rows[number]> = {
            renderer: row => {
                const tc = row.trainedChara;
                return <div className="d-flex flex-row align-items-start">
                    <Table size="small" className="w-auto m-2">
                        <tbody>
                        {(tc?.skills ?? []).map(cs =>
                            <tr key={cs.skillId}>
                                <td>{UMDatabaseWrapper.skillNameWithId(cs.skillId)}</td>
                                <td>Lv {cs.level}</td>
                            </tr>,
                        )}
                        </tbody>
                    </Table>
                    <Table size="small" className="w-auto m-2">
                        <tbody>
                        <tr><td>Speed</td><td>{tc?.speed ?? '-'}</td></tr>
                        <tr><td>Stamina</td><td>{tc?.stamina ?? '-'}</td></tr>
                        <tr><td>Power</td><td>{tc?.pow ?? '-'}</td></tr>
                        <tr><td>Guts</td><td>{tc?.guts ?? '-'}</td></tr>
                        <tr><td>Wit</td><td>{tc?.wiz ?? '-'}</td></tr>
                        </tbody>
                    </Table>
                    {tc && <CharaProperLabels chara={tc} />}
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

                                // Compute debuffer stats from race events
                                const { races } = this.state;
                                let totalMurmur = 0;
                                let totalEyes = 0;
                                let racesWithEyes = 0;
                                let racesWithMurmur = 0;
                                // Eyes (split by whether caster has Late Surger Savvy)
                                const eyesDenomByStyleWithSavvy: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
                                const eyesHitsByStyleWithSavvy: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
                                const eyesDenomByStyleNoSavvy: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
                                const eyesHitsByStyleNoSavvy: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
                                const murmurDenomByStyle: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
                                const murmurHitsByStyle: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };

                                for (const r of races) {
                                    let raceSim: any;
                                    try {
                                        raceSim = deserializeFromBase64(r.raceScenario);
                                    } catch {
                                        continue;
                                    }
                                    const horseResults = raceSim.horseResult || [];
                                    const horseCount = horseResults.length;
                                    const murmurSets = computeDebuffSets(raceSim, r.horseInfoRaw, murmurId);
                                    totalMurmur += murmurSets.procs;

                                    if (murmurSets.procs > 0) {
                                        racesWithMurmur += 1;
                                        for (const idx of murmurSets.opponents) {
                                            const s = horseResults[idx]?.runningStyle ?? 0;
                                            if (s > 0) murmurDenomByStyle[s as 1|2|3|4] += 1;
                                        }
                                        for (const idx of murmurSets.hits) {
                                            const s = horseResults[idx]?.runningStyle ?? 0;
                                            if (s > 0) murmurHitsByStyle[s as 1|2|3|4] += 1;
                                        }
                                    }

                                    // Eyes split logic per race using debuff proc details
                                    try {
                                        const parsed = JSON.parse(r.horseInfoRaw);
                                        const list: any[] = Array.isArray(parsed) ? parsed : [parsed];
                                        const skillsByIdx: Record<number, Set<number>> = {};
                                        list.forEach((rh: any) => {
                                            const idx = (rh['frame_order'] || 1) - 1;
                                            const arr = Array.isArray(rh['skill_array']) ? rh['skill_array'] : [];
                                            skillsByIdx[idx] = new Set<number>(arr.map((s: any) => s['skill_id']));
                                        });

                                        const eyesDetails = computeDebuffProcDetails(raceSim, r.horseInfoRaw, eyesId);
                                        if (eyesDetails.length > 0) {
                                            racesWithEyes += 1;
                                            totalEyes += eyesDetails.length;

                                            for (const dproc of eyesDetails) {
                                                const hasSavvy = dproc.casterIdx >= 0 && !!skillsByIdx[dproc.casterIdx] && Array.from(skillsByIdx[dproc.casterIdx].values()).some(id => lateSurgerSavvyIds.has(id));
                                                if (hasSavvy) {
                                                    dproc.opponents.forEach(idx2 => {
                                                        const s = horseResults[idx2]?.runningStyle ?? 0;
                                                        if (s > 0) eyesDenomByStyleWithSavvy[s as 1|2|3|4] += 1;
                                                    });
                                                    dproc.hits.forEach(idx2 => {
                                                        const s = horseResults[idx2]?.runningStyle ?? 0;
                                                        if (s > 0) eyesHitsByStyleWithSavvy[s as 1|2|3|4] += 1;
                                                    });
                                                } else {
                                                    dproc.opponents.forEach(idx2 => {
                                                        const s = horseResults[idx2]?.runningStyle ?? 0;
                                                        if (s > 0) eyesDenomByStyleNoSavvy[s as 1|2|3|4] += 1;
                                                    });
                                                    dproc.hits.forEach(idx2 => {
                                                        const s = horseResults[idx2]?.runningStyle ?? 0;
                                                        if (s > 0) eyesHitsByStyleNoSavvy[s as 1|2|3|4] += 1;
                                                    });
                                                }
                                            }
                                        }
                                    } catch {}
                                }

                                const totalRaces = races.length || 1;
                                const murmurAvg = totalMurmur / totalRaces;
                                const eyesAvg = totalEyes / totalRaces;

                                const eyesDualData = [1,2,3,4].map(s => ({
                                    key: s,
                                    label: UMDatabaseUtils.runningStyleLabels[s] || `${s}`,
                                    withSavvy: (() => {
                                        const denom = eyesDenomByStyleWithSavvy[s] || 0;
                                        const hits = eyesHitsByStyleWithSavvy[s] || 0;
                                        return denom === 0 ? 0 : (hits / denom) * 100;
                                    })(),
                                    withoutSavvy: (() => {
                                        const denom = eyesDenomByStyleNoSavvy[s] || 0;
                                        const hits = eyesHitsByStyleNoSavvy[s] || 0;
                                        return denom === 0 ? 0 : (hits / denom) * 100;
                                    })(),
                                }));

                                const murmurStylePercents: { style: number, name: string, percent: number }[] = [1,2,3,4].map(s => {
                                    const denom = murmurDenomByStyle[s] || 0;
                                    const hits = murmurHitsByStyle[s] || 0;
                                    const percent = denom === 0 ? 0 : (hits / denom) * 100;
                                    return { style: s, name: UMDatabaseUtils.runningStyleLabels[s] || `${s}`, percent };
                                });

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
                                        <div className="d-flex flex-wrap" style={{ gap: 12 }}>
                                            {/* Skill Occurrence average */}
                                            {(totalMurmur + totalEyes) === 0 ? (
                                                <div className="text-muted">No data found.</div>
                                            ) : (
                                                <div style={{ flex: '0 0 auto', width: 320 }}>
                                                    <div style={{ background: '#151515', border: '1px solid #2a2a2a', borderRadius: 8, padding: 12 }}>
                                                        <div className="d-flex align-items-center justify-content-between" style={{ marginBottom: 8 }}>
                                                            <div style={{ fontWeight: 600 }}>Skill occurrence frequency</div>
                                                        </div>
                                                        <SkillOccurrenceChart data={[
                                                            { label: 'Mystifying Murmur', value: murmurAvg },
                                                            { label: 'All-Seeing Eyes', value: eyesAvg },
                                                        ]} />
                                                    </div>
                                                </div>
                                            )}

                                            {/* Eye hit-rate by style (split by Late Surger Savvy) */}
                                            {racesWithEyes === 0 ? (
                                                <div className="text-muted">No data found.</div>
                                            ) : (
                                                <div style={{ flex: '1 1 420px', minWidth: 320 }}>
                                                    <div style={{ background: '#151515', border: '1px solid #2a2a2a', borderRadius: 8, padding: 12 }}>
                                                        <div className="d-flex align-items-center justify-content-between" style={{ marginBottom: 8 }}>
                                                            <div style={{ fontWeight: 600 }}>Eyes hit-rate by style</div>
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
                                                        </div>
                                                        <EyesHitRateByStyleChart
                                                            data={eyesDualData}
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
                                            )}

                                            {/* Murmur hit-rate by style */}
                                            {racesWithMurmur === 0 ? (
                                                <div className="text-muted">No data found.</div>
                                            ) : (
                                                <div style={{ flex: '1 1 420px', minWidth: 320 }}>
                                                    <div style={{ background: '#151515', border: '1px solid #2a2a2a', borderRadius: 8, padding: 12 }}>
                                                        <div className="d-flex align-items-center justify-content-between" style={{ marginBottom: 8 }}>
                                                            <div style={{ fontWeight: 600 }}>Murmur hit-rate by style</div>
                                                        </div>
                                                        <HitRateByStyleChart items={murmurStylePercents.map(it => ({ name: it.name, percent: it.percent, key: it.style }))}
                                                                            gradientFrom="#f59e0b" gradientTo="#b45309" />
                                                    </div>
                                                </div>
                                            )}
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



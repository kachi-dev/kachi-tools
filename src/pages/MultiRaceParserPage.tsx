import React from "react";
import {Alert, Button, Col, Form, Modal, Row, Spinner, Table} from "react-bootstrap";
import BootstrapTable, { ColumnDescription, ExpandRowProps } from "react-bootstrap-table-next";
import {calculatePlayerWinRates, PlayerWinRates, WinRateInputItem} from "../data/DataAnalysisUtils";
import {deserializeFromBase64} from "../data/RaceDataParser";
import UMDatabaseWrapper from "../data/UMDatabaseWrapper";
import {calculateLastSpurtStats} from "../data/RaceAnalysisUtils";
import {fromRaceHorseData} from "../data/TrainedCharaData";
import CharaProperLabels from "../components/CharaProperLabels";

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
};

export default class MultiRaceParserPage extends React.Component<{}, MultiRaceParserPageState> {
    constructor(props: {}) {
        super(props);
        this.state = {
            loading: false,
            results: [],
            nameFrequency: [],
            races: [],
            showRaceModal: false,
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
            <Row className="align-items-end">
                <Col md={6}>
                    <Form.Group controlId="files">
                        <Form.Label>Upload race files</Form.Label>
                        <Form.Control type="file" multiple onChange={(e: React.ChangeEvent<HTMLInputElement>) => this.handleFiles(e.currentTarget.files)}/>
                        <div className="mt-2">
                            {loading && <><Spinner animation="border" size="sm"/> Parsing files...</>}
                            {!loading && results.length > 0 && <span>Parsed entries: {results.length} • Players found: {nameFrequency.length}</span>}
                        </div>
                    </Form.Group>
                </Col>
                <Col md={6}>
                    <Form.Group controlId="playerSelect">
                        <Form.Label>Select player</Form.Label>
                        <Form.Control as="select"
                                      disabled={loading || nameFrequency.length === 0}
                                      value={selectedName || ''}
                                      onChange={e => this.computeSummaryFor((e.target as HTMLSelectElement).value)}>
                            <option value="" disabled>Select a player</option>
                            {nameFrequency.map(nf => <option key={nf.name} value={nf.name}>{nf.name} ({nf.count})</option>)}
                        </Form.Control>
                    </Form.Group>
                </Col>
            </Row>

            {error && <Alert variant="warning" className="mt-3">{error}</Alert>}

            <div className="mt-3">
                {this.renderSummary()}
            </div>
        </div>;
    }
}



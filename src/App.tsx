import { useEffect, useMemo, useState } from "react";

type Team = { id: string; name: string; club: string; group: string };
type Match = { id: string; home: string; away: string; round: number; pitch: number };
type Form = {
  host: string; date: string; age: string; start: string; pitches: number; games: number;
  mode: "groups" | "custom"; timing: "straight" | "halves"; duration: number;
  perHalf: number; halfTime: number; gap: number; groups: number; rules: string;
  info: string; primary: string; accent: string; logo: string;
};

const uid = () => Math.random().toString(36).slice(2, 9);
const detectedClub = (name: string) => name.trim().replace(/\s+(?:\d+|[A-Z])$/i, "").trim() || name.trim();
const toMinutes = (value: string) => { const [h, m] = value.split(":").map(Number); return h * 60 + m; };
const clock = (value: number) => `${Math.floor(value / 60) % 24}:${String(value % 60).padStart(2, "0")}`;
const initial: Form = {
  host: "", date: "", age: "", start: "10:00", pitches: 4, games: 4, mode: "groups",
  timing: "straight", duration: 10, perHalf: 5, halfTime: 2, gap: 5, groups: 1,
  rules: "Maximum 9-a-side\nGames played straight through\nPlease respect referees at all times", info: "", primary: "#064b1f", accent: "#c9151e", logo: "",
};

function chooseBalancedPairs(teams: Team[], target: number, allowSameClub: boolean) {
  const counts = Object.fromEntries(teams.map(team => [team.id, 0]));
  const used = new Set<string>(); const chosen: { a: Team; b: Team }[] = []; let visits = 0;
  const edgeKey = (a: Team, b: Team) => [a.id, b.id].sort().join("|");
  const eligible = (a: Team, b: Team) => a.id !== b.id && a.group === b.group && !used.has(edgeKey(a, b)) && (allowSameClub || a.club.toLowerCase() !== b.club.toLowerCase());
  const solve = (): boolean => {
    if (++visits > 350000) return false;
    const incomplete = teams.filter(team => counts[team.id] < target);
    if (!incomplete.length) return true;
    const team = incomplete.sort((a, b) => {
      const options = (item: Team) => teams.filter(other => counts[other.id] < target && eligible(item, other)).length;
      return options(a) - options(b) || (target - counts[b.id]) - (target - counts[a.id]);
    })[0];
    const candidates = teams.filter(other => counts[other.id] < target && eligible(team, other)).sort((a, b) =>
      (target - counts[b.id]) - (target - counts[a.id]) || a.club.localeCompare(b.club) || a.name.localeCompare(b.name));
    for (const opponent of candidates) {
      const key = edgeKey(team, opponent); used.add(key); counts[team.id]++; counts[opponent.id]++; chosen.push({ a: team, b: opponent });
      const stillPossible = teams.every(item => {
        const needed = target - counts[item.id];
        return needed <= 0 || teams.filter(other => counts[other.id] < target && eligible(item, other)).length >= needed;
      });
      if (stillPossible && solve()) return true;
      chosen.pop(); counts[team.id]--; counts[opponent.id]--; used.delete(key);
    }
    return false;
  };
  return solve() ? chosen : null;
}

function buildSchedule(teams: Team[], target: number, pitches: number) {
  const interClub = chooseBalancedPairs(teams, target, false);
  const chosen = interClub ?? chooseBalancedPairs(teams, target, true) ?? [];
  const counts = Object.fromEntries(teams.map(team => [team.id, 0]));
  chosen.forEach(pair => { counts[pair.a.id]++; counts[pair.b.id]++; });
  const warnings: string[] = [];
  const short = teams.filter(team => counts[team.id] < target);
  if (short.length) warnings.push(`${short.length} team${short.length === 1 ? "" : "s"} could not reach ${target} games with the current inputs.`);
  const sameClub = chosen.filter(pair => pair.a.club.toLowerCase() === pair.b.club.toLowerCase());
  if (sameClub.length) warnings.push(`${sameClub.length} same-club fixture${sameClub.length === 1 ? " was" : "s were"} unavoidable.`);
  const rounds: { ids: Set<string>; pairs: { a: Team; b: Team }[] }[] = [];
  chosen.forEach(pair => {
    let round = rounds.find(item => item.pairs.length < pitches && !item.ids.has(pair.a.id) && !item.ids.has(pair.b.id));
    if (!round) { round = { ids: new Set(), pairs: [] }; rounds.push(round); }
    round.pairs.push(pair); round.ids.add(pair.a.id); round.ids.add(pair.b.id);
  });
  return { warnings, matches: rounds.flatMap((round, roundIndex) => round.pairs.map((pair, pitchIndex) => ({ id: uid(), home: pair.a.id, away: pair.b.id, round: roundIndex + 1, pitch: pitchIndex + 1 }))) };
}

async function renderPosterCanvas(form: Form, matches: Match[], teams: Record<string, Team>, rounds: number, gameLength: number, end: string, roundTime: (round: number) => string) {
  const canvas = document.createElement("canvas"); canvas.width = 2240; canvas.height = 1494;
  const ctx = canvas.getContext("2d")!; ctx.scale(2, 2); const width = 1120; const height = 747;
  ctx.fillStyle = "#fbfaf6"; ctx.fillRect(0, 0, width, height); ctx.strokeStyle = "#111"; ctx.lineWidth = 3; ctx.strokeRect(2, 2, width - 4, height - 4); ctx.textAlign = "center";
  if (form.logo.startsWith("data:image/")) {
    const crest = new Image(); crest.src = form.logo; await crest.decode(); ctx.drawImage(crest, 43, 28, 108, 126); ctx.drawImage(crest, 969, 28, 108, 126);
  }
  ctx.fillStyle = "#050505"; ctx.font = "900 56px Arial"; ctx.fillText((form.host || "HOST CLUB").toUpperCase(), 560, 67);
  ctx.fillStyle = form.primary; ctx.font = "900 50px Arial"; ctx.fillText("GIRLS BLITZ", 560, 117);
  ctx.fillStyle = form.accent; ctx.beginPath(); ctx.moveTo(290, 126); ctx.lineTo(830, 126); ctx.lineTo(814, 143); ctx.lineTo(830, 160); ctx.lineTo(290, 160); ctx.lineTo(306, 143); ctx.closePath(); ctx.fill();
  const date = form.date ? new Date(`${form.date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }).toUpperCase() : "EVENT DATE";
  ctx.fillStyle = "#fff"; ctx.font = "900 20px Arial"; ctx.fillText(date, 560, 151); ctx.fillStyle = "#111"; ctx.font = "900 16px Arial"; ctx.fillText(`HOSTED BY ${(form.host || "HOST CLUB").toUpperCase()}`, 560, 179);
  ctx.fillStyle = form.primary; ctx.fillRect(10, 184, 1100, 44); ctx.fillStyle = "#fff"; ctx.font = "900 24px Arial"; ctx.fillText(`${form.age || "AGE GROUP"} BLITZ`, 560, 215);
  ctx.fillStyle = "#fff"; ctx.strokeStyle = "#9bae9f"; ctx.lineWidth = 1; ctx.fillRect(10, 228, 1100, 46); ctx.strokeRect(10, 228, 1100, 46);
  const facts = [`${form.start} – ${end}`, `${gameLength} MIN GAMES`, `${form.gap} MIN BREAK BETWEEN ROUNDS`, `PITCHES P1–P${form.pitches}`, `${form.games} GAMES PER TEAM`];
  facts.forEach((fact, index) => { const cell = 1100 / facts.length; if (index) { ctx.beginPath(); ctx.moveTo(10 + index * cell, 228); ctx.lineTo(10 + index * cell, 274); ctx.stroke(); } ctx.fillStyle = "#111"; ctx.font = "800 11px Arial"; ctx.fillText(fact, 10 + index * cell + cell / 2, 256); });
  const columns = rounds <= 4 ? 2 : 3; const rows = Math.max(1, Math.ceil(rounds / columns)); const gap = 8; const gridTop = 282; const gridHeight = 308; const boxWidth = (1100 - gap * (columns - 1)) / columns; const boxHeight = (gridHeight - gap * (rows - 1)) / rows;
  Array.from({ length: rounds }, (_, i) => i + 1).forEach((round, index) => {
    const left = 10 + (index % columns) * (boxWidth + gap); const top = gridTop + Math.floor(index / columns) * (boxHeight + gap);
    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#79927d"; ctx.strokeRect(left, top, boxWidth, boxHeight); ctx.fillStyle = "#111"; ctx.font = "900 15px Arial"; ctx.fillText(`ROUND ${round}`, left + boxWidth / 2 - 35, top + 20); ctx.fillStyle = form.primary; ctx.fillText(roundTime(round), left + boxWidth / 2 + 50, top + 20);
    const cellWidth = boxWidth / form.pitches;
    Array.from({ length: form.pitches }, (_, i) => i + 1).forEach(pitch => {
      const x = left + (pitch - 1) * cellWidth; const match = matches.find(item => item.round === round && item.pitch === pitch);
      ctx.fillStyle = form.primary; ctx.fillRect(x, top + 28, cellWidth, 24); ctx.fillStyle = "#fff"; ctx.font = "800 13px Arial"; ctx.fillText(`P${pitch}`, x + cellWidth / 2, top + 45); ctx.strokeStyle = "#91a594"; ctx.strokeRect(x, top + 28, cellWidth, boxHeight - 28);
      if (match) { ctx.fillStyle = "#111"; ctx.font = "800 11px Arial"; ctx.fillText(teams[match.home]?.name || "", x + cellWidth / 2, top + 76); ctx.font = "600 9px Arial"; ctx.fillText("vs", x + cellWidth / 2, top + 91); ctx.font = "800 11px Arial"; ctx.fillText(teams[match.away]?.name || "", x + cellWidth / 2, top + 108); }
    });
  });
  ctx.fillStyle = form.primary; ctx.fillRect(10, 598, 1100, 24); ctx.fillStyle = "#fff"; ctx.font = "900 15px Arial"; ctx.fillText("★     CLUB RULES & INFORMATION     ★", 560, 615);
  ctx.strokeStyle = "#829785"; ctx.strokeRect(10, 622, 1100, 84); ctx.textAlign = "left"; ctx.fillStyle = "#111"; ctx.font = "700 10px Arial";
  const rules = (form.rules || "Add optional game rules").split("\n").filter(Boolean).slice(0, 4); rules.forEach((rule, index) => ctx.fillText(`•  ${rule}`, 35, 642 + index * 16));
  ctx.fillText("•  Respect referees at all times", 400, 642); ctx.fillText("•  Encourage rotation throughout matches", 400, 658);
  const wrap = (text: string, x: number, y: number, maxWidth: number) => { const words = text.split(" "); let line = ""; let lineY = y; words.forEach(word => { const test = line ? `${line} ${word}` : word; if (ctx.measureText(test).width > maxWidth && line) { ctx.fillText(line, x, lineY); line = word; lineY += 14; } else line = test; }); if (line) ctx.fillText(line, x, lineY); };
  wrap(form.info || "Add optional host club information", 760, 642, 320);
  ctx.textAlign = "center"; ctx.fillStyle = form.primary; ctx.fillRect(10, 713, 1100, 27); ctx.fillStyle = "#fff"; ctx.font = "900 14px Arial"; ctx.fillText("★     THANK YOU FOR YOUR SUPPORT – ENJOY THE DAY!     ★", 560, 732);
  return canvas;
}

async function exportPosterPng(form: Form, matches: Match[], teams: Record<string, Team>, rounds: number, gameLength: number, end: string, roundTime: (round: number) => string) {
  const canvas = await renderPosterCanvas(form, matches, teams, rounds, gameLength, end, roundTime);
  const link = document.createElement("a"); link.download = `${(form.age || "blitz").toLowerCase()}-fixtures.png`; link.href = canvas.toDataURL("image/png", 1); link.click();
}

export default function Home() {
  const [restored] = useState<null | { form: Form; teams: Team[]; matches: Match[]; warnings: string[] }>(() => {
    try { const saved = sessionStorage.getItem("bfm-v2"); return saved ? JSON.parse(saved) : null; } catch { return null; }
  });
  const [form, setForm] = useState<Form>(restored?.form ?? initial);
  const [teams, setTeams] = useState<Team[]>(restored?.teams ?? []);
  const [matches, setMatches] = useState<Match[]>(restored?.matches ?? []);
  const [warnings, setWarnings] = useState<string[]>(restored?.warnings ?? []);
  const [step, setStep] = useState<"setup" | "draft" | "brand" | "poster">("setup");
  const [draft, setDraft] = useState("");
  useEffect(() => { sessionStorage.setItem("bfm-v2", JSON.stringify({ form, teams, matches, warnings })); }, [form, teams, matches, warnings]);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm(previous => ({ ...previous, [key]: value }));
  const gameLength = form.timing === "straight" ? form.duration : form.perHalf * 2 + form.halfTime;
  const roundCount = Math.max(0, ...matches.map(match => match.round));
  const eventEnd = clock(toMinutes(form.start) + (roundCount ? roundCount * gameLength + (roundCount - 1) * form.gap : 0));
  const teamMap = useMemo(() => Object.fromEntries(teams.map(team => [team.id, team])), [teams]);
  const roundTime = (round: number) => { const start = toMinutes(form.start) + (round - 1) * (gameLength + form.gap); return `${clock(start)}–${clock(start + gameLength)}`; };
  const changeTeam = (teamId: string, patch: Partial<Team>) => setTeams(items => items.map(team => team.id === teamId ? { ...team, ...patch } : team));
  const changeMatch = (matchId: string, patch: Partial<Match>) => setMatches(items => items.map(match => match.id === matchId ? { ...match, ...patch } : match));
  const addTeam = () => { if (!draft.trim()) return; setTeams(items => [...items, { id: uid(), name: draft.trim(), club: detectedClub(draft), group: "A" }]); setDraft(""); };
  const generate = () => {
    if (form.mode === "custom") {
      if (!matches.length && teams.length > 1) setMatches([{ id: uid(), home: teams[0].id, away: teams[1].id, round: 1, pitch: 1 }]);
      setWarnings([]); setStep("draft"); return;
    }
    const result = buildSchedule(teams, form.games, form.pitches); setMatches(result.matches); setWarnings(result.warnings); setStep("draft");
  };
  const reset = () => { if (confirm("Start a new event? Your current session will be cleared.")) { sessionStorage.clear(); location.reload(); } };
  const steps = [{ id: "setup", n: "1", label: "Event & teams" }, { id: "draft", n: "2", label: "Fixture draft" }, { id: "brand", n: "3", label: "Poster details" }, { id: "poster", n: "4", label: "Preview & export" }] as const;

  return <main>
    <header className="topbar"><div className="brand-lockup"><div className="mark">BF</div><div><b>Blitz Fixture Maker</b><small>Fast, balanced and match-day ready</small></div></div><button className="text-button" onClick={reset}>Start new event</button></header>
    <section className="hero"><div className="hero-copy"><p>FIXTURES, WITHOUT THE SPREADSHEET</p><h1>Build the blitz.<br/><em>Share the day.</em></h1><span>Create a balanced schedule and a polished, club-branded poster from one simple workspace.</span></div><div className="event-pulse"><div><b>{teams.length}</b><span>Teams</span></div><div><b>{matches.length}</b><span>Fixtures</span></div><small>{matches.length ? `${roundCount} rounds · ${form.pitches} pitches` : "Add your event and teams to begin"}</small></div></section>
    <nav className="tabs" aria-label="Event builder steps">{steps.map(item => <button className={step === item.id ? "active" : ""} onClick={() => setStep(item.id)} disabled={item.id !== "setup" && !matches.length} key={item.id}><i>{item.n}</i><span>{item.label}</span><small>{item.id === "setup" ? `${teams.length} teams` : item.id === "draft" ? matches.length ? `${matches.length} games` : "Not generated" : item.id === "brand" ? "Optional" : "Download"}</small></button>)}</nav>
    {step === "setup" && <Setup form={form} set={set} teams={teams} setTeams={setTeams} draft={draft} setDraft={setDraft} addTeam={addTeam} changeTeam={changeTeam} gameLength={gameLength} onContinue={generate}/>}
    {step === "draft" && <FixtureDraft form={form} teams={teams} matches={matches} warnings={warnings} roundCount={roundCount} roundTime={roundTime} changeMatch={changeMatch} setMatches={setMatches} regenerate={generate} onBack={() => setStep("setup")} onContinue={() => setStep("brand")}/>}
    {step === "brand" && <Brand form={form} set={set} onBack={() => setStep("draft")} onContinue={() => setStep("poster")}/>}
    {step === "poster" && <section className="workspace poster-step"><div className="poster-step-head"><Head n="04" title="Preview & export" sub="Review the finished poster, then download a high-resolution PNG for sharing or printing."/><div className="poster-actions"><button className="ghost" onClick={() => setStep("brand")}>← Poster details</button><button className="primary" onClick={() => exportPosterPng(form, matches, teamMap, roundCount, gameLength, eventEnd, roundTime)}>Download PNG <span>↓</span></button></div></div><div className="posterwrap final-preview"><PosterImage form={form} matches={matches} teams={teamMap} rounds={roundCount} gameLength={gameLength} end={eventEnd} roundTime={roundTime}/></div><div className="poster-footnote"><span>Need to change a game?</span><button className="text-button" onClick={() => setStep("draft")}>Return to fixture draft</button></div></section>}
  </main>;
}

function Setup({ form, set, teams, setTeams, draft, setDraft, addTeam, changeTeam, gameLength, onContinue }: { form: Form; set: <K extends keyof Form>(key: K, value: Form[K]) => void; teams: Team[]; setTeams: React.Dispatch<React.SetStateAction<Team[]>>; draft: string; setDraft: (v: string) => void; addTeam: () => void; changeTeam: (id: string, p: Partial<Team>) => void; gameLength: number; onContinue: () => void }) {
  return <section className="workspace setup-grid"><div className="panel"><Head n="01" title="Event setup" sub="Choose the format, timing and capacity for the day."/><div className="formgrid"><Field label="Host club"><input placeholder="e.g. Killeeshil GAC" value={form.host} onChange={e => set("host", e.target.value)}/></Field><Field label="Event date"><input type="date" value={form.date} onChange={e => set("date", e.target.value)}/></Field><Field label="Age group"><input placeholder="e.g. U11" value={form.age} onChange={e => set("age", e.target.value)}/></Field><Field label="First game starts"><input type="time" value={form.start} onChange={e => set("start", e.target.value)}/></Field><Field label="Available pitches"><input type="number" min="1" max="8" value={form.pitches} onChange={e => set("pitches", +e.target.value)}/></Field><Field label="Games for each team"><input type="number" min="1" value={form.games} onChange={e => set("games", +e.target.value)}/></Field></div><Choice label="Game format"><button className={form.timing === "straight" ? "on" : ""} onClick={() => set("timing", "straight")}>Straight through</button><button className={form.timing === "halves" ? "on" : ""} onClick={() => set("timing", "halves")}>Two halves</button></Choice><div className="formgrid small">{form.timing === "straight" ? <Field label="Game duration (minutes)"><input type="number" min="1" value={form.duration} onChange={e => set("duration", +e.target.value)}/></Field> : <><Field label="Minutes per half"><input type="number" min="1" value={form.perHalf} onChange={e => set("perHalf", +e.target.value)}/></Field><Field label="Half-time break"><input type="number" min="0" value={form.halfTime} onChange={e => set("halfTime", +e.target.value)}/></Field></>}<Field label="Break between rounds"><input type="number" min="0" value={form.gap} onChange={e => set("gap", +e.target.value)}/></Field></div><Choice label="Schedule type"><button className={form.mode === "groups" ? "on" : ""} onClick={() => set("mode", "groups")}>Balanced groups</button><button className={form.mode === "custom" ? "on" : ""} onClick={() => set("mode", "custom")}>Build manually</button></Choice><div className="setup-summary"><span>Estimated match window</span><b>{form.start} onward</b><small>{gameLength} minute games · {form.gap} minute changeover</small></div></div>
    <div className="panel teams-panel"><Head n={String(teams.length).padStart(2, "0")} title="Participating teams" sub="Add every team here so the format and game count are easy to judge together."/><div className="team-add"><input aria-label="New team name" placeholder="Type a team name, then press Enter" value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && addTeam()}/><button onClick={addTeam}>+ Add</button></div>{form.mode === "groups" && <div className="group-tools"><Field label="Number of groups"><input type="number" min="1" max="6" value={form.groups} onChange={e => set("groups", +e.target.value)}/></Field><button className="ghost" onClick={() => setTeams(items => items.map((team, index) => ({ ...team, group: String.fromCharCode(65 + index % form.groups) })))}>Distribute evenly</button></div>}<div className="teamtable"><div className="teamrow heading"><span>Team</span><span>Detected club</span>{form.mode === "groups" && <span>Group</span>}<span/></div>{teams.length === 0 && <div className="empty-state"><div>＋</div><b>No teams added yet</b><span>Team names stay in this tab only and clear when the session ends.</span></div>}{teams.map(team => <div className="teamrow" key={team.id}><input value={team.name} aria-label="Team name" onChange={e => changeTeam(team.id, { name: e.target.value, club: detectedClub(e.target.value) })}/><input value={team.club} aria-label="Detected club" onChange={e => changeTeam(team.id, { club: e.target.value })}/>{form.mode === "groups" && <select aria-label="Team group" value={team.group} onChange={e => changeTeam(team.id, { group: e.target.value })}>{Array.from({ length: form.groups }, (_, i) => <option key={i}>{String.fromCharCode(65 + i)}</option>)}</select>}<button className="remove" aria-label={`Remove ${team.name}`} onClick={() => setTeams(items => items.filter(item => item.id !== team.id))}>×</button></div>)}</div><div className="notice"><span>✓</span><div><b>Same-club protection is on</b><small>Teams with the same detected club name only meet when a balanced alternative is unavailable.</small></div></div><div className="actions"><span className="helper">Add at least two teams to continue.</span><button className="primary" disabled={teams.length < 2} onClick={onContinue}>{form.mode === "groups" ? "Generate fixture draft" : "Start fixture draft"} <span>→</span></button></div></div></section>;
}

function FixtureDraft({ form, teams, matches, warnings, roundCount, roundTime, changeMatch, setMatches, regenerate, onBack, onContinue }: { form: Form; teams: Team[]; matches: Match[]; warnings: string[]; roundCount: number; roundTime: (round: number) => string; changeMatch: (id: string, patch: Partial<Match>) => void; setMatches: React.Dispatch<React.SetStateAction<Match[]>>; regenerate: () => void; onBack: () => void; onContinue: () => void }) {
  const sorted = [...matches].sort((a, b) => a.round - b.round || a.pitch - b.pitch);
  const gameCounts = Object.fromEntries(teams.map(team => [team.id, matches.filter(match => match.home === team.id || match.away === team.id).length]));
  const duplicateSlots = matches.filter(match => matches.some(other => other.id !== match.id && other.round === match.round && other.pitch === match.pitch)).map(match => match.id);
  const clashes = matches.filter(match => matches.some(other => other.id !== match.id && other.round === match.round && [other.home, other.away].some(id => id === match.home || id === match.away))).map(match => match.id);
  const sameClub = matches.filter(match => teams.find(team => team.id === match.home)?.club.toLowerCase() === teams.find(team => team.id === match.away)?.club.toLowerCase()).length;
  const issueCount = new Set([...duplicateSlots, ...clashes]).size;
  return <section className="workspace draft-step"><div className="draft-header"><Head n="02" title="Review your fixture draft" sub="Edit the spreadsheet until the rounds, pitches and pairings work for your event."/><div className="draft-actions"><button className="ghost" onClick={regenerate}>↻ Regenerate</button><button className="ghost" disabled={teams.length < 2} onClick={() => setMatches(items => [...items, { id: uid(), home: teams[0].id, away: teams[1].id, round: Math.max(roundCount, 1), pitch: 1 }])}>+ Add fixture</button></div></div>
    <div className="draft-summary"><div><b>{matches.length}</b><span>Fixtures</span></div><div><b>{roundCount}</b><span>Rounds</span></div><div><b>{form.pitches}</b><span>Pitches</span></div><div className={issueCount ? "summary-alert" : "summary-ok"}><b>{issueCount || "✓"}</b><span>{issueCount ? "Conflicts to fix" : "No slot conflicts"}</span></div></div>
    {warnings.filter(warning => !warning.includes("same-club")).map((warning, i) => <div className="warning" key={i}>⚠ <span>{warning}</span></div>)}{sameClub > 0 && <div className="warning">⚠ <span>{sameClub} same-club fixture{sameClub === 1 ? "" : "s"} currently in the edited draft.</span></div>}
    <div className="fixture-sheet"><div className="sheet-head"><span>#</span><span>Round</span><span>Time</span><span>Pitch</span><span>Team A</span><span></span><span>Team B</span><span></span></div>{sorted.map((match, index) => { const hasIssue = duplicateSlots.includes(match.id) || clashes.includes(match.id); return <div className={`sheet-row ${hasIssue ? "row-issue" : ""}`} key={match.id}><span className="row-number">{String(index + 1).padStart(2, "0")}</span><label><small>Round</small><input aria-label="Round" type="number" min="1" value={match.round} onChange={e => changeMatch(match.id, { round: +e.target.value })}/></label><span className="sheet-time">{roundTime(match.round)}</span><label><small>Pitch</small><select aria-label="Pitch" value={match.pitch} onChange={e => changeMatch(match.id, { pitch: +e.target.value })}>{Array.from({ length: form.pitches }, (_, i) => <option value={i + 1} key={i}>Pitch {i + 1}</option>)}</select></label><label><small>Team A</small><select aria-label="Team A" value={match.home} onChange={e => changeMatch(match.id, { home: e.target.value })}>{teams.map(team => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label><span className="versus">vs</span><label><small>Team B</small><select aria-label="Team B" value={match.away} onChange={e => changeMatch(match.id, { away: e.target.value })}>{teams.map(team => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label><button className="remove" aria-label="Remove fixture" onClick={() => setMatches(items => items.filter(item => item.id !== match.id))}>×</button></div>})}</div>
    <div className="team-balance"><div><b>Games per team</b><span>Target: {form.games}</span></div><div>{teams.map(team => <span className={gameCounts[team.id] === form.games ? "balanced" : "unbalanced"} key={team.id}>{team.name}<b>{gameCounts[team.id]}</b></span>)}</div></div>
    <div className="actions draft-footer"><button className="ghost" onClick={onBack}>← Edit event & teams</button><div><span className="helper">You can return and edit these fixtures later.</span><button className="primary" disabled={!matches.length || issueCount > 0} onClick={onContinue}>Continue to poster details <span>→</span></button></div></div></section>;
}

function Brand({ form, set, onBack, onContinue }: { form: Form; set: <K extends keyof Form>(key: K, value: Form[K]) => void; onBack: () => void; onContinue: () => void }) {
  return <section className="workspace brand-grid"><div className="panel brand"><Head n="03" title="Club identity" sub="Use your crest and colours to make the poster recognisably yours."/><label className={`upload ${form.logo ? "has-logo" : ""}`}>{form.logo ? <><img src={form.logo} alt="Club crest"/><b>Change club crest</b></> : <><div>⬆</div><b>Upload club crest</b></>}<input type="file" accept="image/png,image/jpeg" onChange={e => { const file = e.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onload = () => set("logo", String(reader.result)); reader.readAsDataURL(file); } }}/><small>PNG or JPEG · used on screen and in the download</small></label><div className="colors"><Field label="Primary colour"><input type="color" value={form.primary} onChange={e => set("primary", e.target.value)}/></Field><Field label="Accent colour"><input type="color" value={form.accent} onChange={e => set("accent", e.target.value)}/></Field></div><div className="brand-preview"><i style={{ background: form.primary }}/><i style={{ background: form.accent }}/><span>Your poster palette</span></div></div><div className="panel info-panel"><Head n="✦" title="Rules & host information" sub="Optional notes shown in the information band at the foot of the poster."/><Field label="Game rules"><textarea rows={8} placeholder="One rule per line" value={form.rules} onChange={e => set("rules", e.target.value)}/></Field><Field label="Host information"><textarea rows={6} placeholder="Refreshments, parking, meeting point or other useful information" value={form.info} onChange={e => set("info", e.target.value)}/></Field><div className="actions"><button className="ghost" onClick={onBack}>← Back</button><button className="primary" onClick={onContinue}>Preview poster <span>→</span></button></div></div></section>;
}

function PosterImage({ form, matches, teams, rounds, gameLength, end, roundTime }: { form: Form; matches: Match[]; teams: Record<string, Team>; rounds: number; gameLength: number; end: string; roundTime: (round: number) => string }) {
  const [source, setSource] = useState("");
  useEffect(() => {
    let active = true;
    renderPosterCanvas(form, matches, teams, rounds, gameLength, end, roundTime).then(canvas => {
      if (active) setSource(canvas.toDataURL("image/png", 1));
    });
    return () => { active = false; };
  }, [form, matches, teams, rounds, gameLength, end, roundTime]);
  return source ? <img className="poster-image" src={source} alt="Final fixtures poster preview"/> : <div className="poster-loading">Preparing poster preview…</div>;
}
function Head({ n, title, sub }: { n: string; title: string; sub: string }) { return <div className="head"><i>{n}</i><div><h2>{title}</h2><p>{sub}</p></div></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
function Choice({ label, children }: { label: string; children: React.ReactNode }) { return <div className="choice"><span>{label}</span><div className="seg">{children}</div></div>; }

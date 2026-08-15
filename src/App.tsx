import { useEffect, useMemo, useRef, useState } from "react";

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

async function exportPosterPng(form: Form, matches: Match[], teams: Record<string, Team>, rounds: number, gameLength: number, end: string, roundTime: (round: number) => string) {
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
  const [step, setStep] = useState<"setup" | "brand" | "schedule">("setup");
  const [draft, setDraft] = useState(""); const [dragged, setDragged] = useState<string | null>(null); const posterRef = useRef<HTMLDivElement>(null);
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
  const generate = () => { const result = buildSchedule(teams, form.games, form.pitches); setMatches(result.matches); setWarnings(result.warnings); setStep("schedule"); };
  const moveMatch = (targetRound: number, targetPitch: number) => {
    if (!dragged) return; const source = matches.find(match => match.id === dragged); const target = matches.find(match => match.round === targetRound && match.pitch === targetPitch); if (!source) return;
    setMatches(items => items.map(match => match.id === source.id ? { ...match, round: targetRound, pitch: targetPitch } : target && match.id === target.id ? { ...match, round: source.round, pitch: source.pitch } : match)); setDragged(null);
  };
  const reset = () => { if (confirm("Start a new event? Your current session will be cleared.")) { sessionStorage.clear(); location.reload(); } };
  const steps = [{ id: "setup", n: "1", label: "Event & teams" }, { id: "brand", n: "2", label: "Club identity" }, { id: "schedule", n: "3", label: "Schedule & poster" }] as const;

  return <main>
    <header className="topbar"><div className="brand-lockup"><div className="mark">BF</div><div><b>Blitz Fixture Maker</b><small>Fast, balanced and match-day ready</small></div></div><button className="text-button" onClick={reset}>Start new event</button></header>
    <section className="hero"><div className="hero-copy"><p>FIXTURES, WITHOUT THE SPREADSHEET</p><h1>Build the blitz.<br/><em>Share the day.</em></h1><span>Create a balanced schedule and a polished, club-branded poster from one simple workspace.</span></div><div className="event-pulse"><div><b>{teams.length}</b><span>Teams</span></div><div><b>{matches.length}</b><span>Fixtures</span></div><small>{matches.length ? `${roundCount} rounds · ${form.pitches} pitches` : "Add your event and teams to begin"}</small></div></section>
    <nav className="tabs" aria-label="Event builder steps">{steps.map(item => <button className={step === item.id ? "active" : ""} onClick={() => setStep(item.id)} key={item.id}><i>{item.n}</i><span>{item.label}</span><small>{item.id === "setup" ? `${teams.length} teams` : item.id === "brand" ? "Optional" : matches.length ? `${matches.length} games` : "Not generated"}</small></button>)}</nav>
    {step === "setup" && <Setup form={form} set={set} teams={teams} setTeams={setTeams} draft={draft} setDraft={setDraft} addTeam={addTeam} changeTeam={changeTeam} gameLength={gameLength} onContinue={() => setStep("brand")}/>}
    {step === "brand" && <Brand form={form} set={set} onBack={() => setStep("setup")} onContinue={form.mode === "groups" ? generate : () => setStep("schedule")}/>}
    {step === "schedule" && <section className="workspace schedule-v2"><div className="panel board-panel"><div className="board-head"><Head n="03" title="Fine-tune the fixtures" sub="Drag a fixture onto any empty slot. Drop it onto another game to swap them."/><button className="ghost" disabled={teams.length < 2} onClick={() => teams.length > 1 && setMatches(items => [...items, { id: uid(), home: teams[0].id, away: teams[1].id, round: Math.max(roundCount, 1), pitch: 1 }])}>+ Add fixture</button></div>{warnings.map((warning, i) => <div className="warning" key={i}>⚠ <span>{warning}</span></div>)}<div className="schedule-legend"><span><i>⠿</i> Drag fixture</span><span><i>P</i> Pitch</span><span><i>R</i> Round</span></div><div className="schedule-board">{Array.from({ length: Math.max(roundCount, 1) }, (_, i) => i + 1).map(round => <div className="board-round" key={round}><div className="round-label"><small>ROUND</small><b>{round}</b><span>{roundTime(round)}</span></div><div className="slots" style={{ gridTemplateColumns: `repeat(${form.pitches}, minmax(168px, 1fr))` }}>{Array.from({ length: form.pitches }, (_, i) => i + 1).map(pitch => { const match = matches.find(item => item.round === round && item.pitch === pitch); return <div className={`slot ${match ? "filled" : ""}`} key={pitch} onDragOver={e => e.preventDefault()} onDrop={() => moveMatch(round, pitch)}><label>Pitch {pitch}</label>{match ? <div className="fixture-card" draggable onDragStart={() => setDragged(match.id)}><span className="drag-handle">⠿</span><div><select aria-label="First team" value={match.home} onChange={e => changeMatch(match.id, { home: e.target.value })}>{teams.map(team => <option value={team.id} key={team.id}>{team.name}</option>)}</select><i>vs</i><select aria-label="Second team" value={match.away} onChange={e => changeMatch(match.id, { away: e.target.value })}>{teams.map(team => <option value={team.id} key={team.id}>{team.name}</option>)}</select></div><button className="remove" aria-label="Remove fixture" onClick={() => setMatches(items => items.filter(item => item.id !== match.id))}>×</button></div> : <span className="drop-hint">Drop fixture here</span>}</div>})}</div></div>)}</div><div className="actions"><button className="ghost" onClick={() => setStep("brand")}>← Club identity</button><button className="ghost" onClick={() => setStep("setup")}>Edit event & teams</button></div></div>
      <div className="preview"><div className="previewbar"><div><b>Live poster</b><small>The PNG uses the same data, colours, crest, rules and fixture layout.</small></div><button className="primary" disabled={!matches.length} onClick={() => exportPosterPng(form, matches, teamMap, roundCount, gameLength, eventEnd, roundTime)}>Download PNG <span>↓</span></button></div><div className="posterwrap"><Poster posterRef={posterRef} form={form} matches={matches} teams={teamMap} rounds={roundCount} gameLength={gameLength} end={eventEnd} roundTime={roundTime}/></div></div></section>}
  </main>;
}

function Setup({ form, set, teams, setTeams, draft, setDraft, addTeam, changeTeam, gameLength, onContinue }: { form: Form; set: <K extends keyof Form>(key: K, value: Form[K]) => void; teams: Team[]; setTeams: React.Dispatch<React.SetStateAction<Team[]>>; draft: string; setDraft: (v: string) => void; addTeam: () => void; changeTeam: (id: string, p: Partial<Team>) => void; gameLength: number; onContinue: () => void }) {
  return <section className="workspace setup-grid"><div className="panel"><Head n="01" title="Event setup" sub="Choose the format, timing and capacity for the day."/><div className="formgrid"><Field label="Host club"><input placeholder="e.g. Killeeshil GAC" value={form.host} onChange={e => set("host", e.target.value)}/></Field><Field label="Event date"><input type="date" value={form.date} onChange={e => set("date", e.target.value)}/></Field><Field label="Age group"><input placeholder="e.g. U11" value={form.age} onChange={e => set("age", e.target.value)}/></Field><Field label="First game starts"><input type="time" value={form.start} onChange={e => set("start", e.target.value)}/></Field><Field label="Available pitches"><input type="number" min="1" max="8" value={form.pitches} onChange={e => set("pitches", +e.target.value)}/></Field><Field label="Games for each team"><input type="number" min="1" value={form.games} onChange={e => set("games", +e.target.value)}/></Field></div><Choice label="Game format"><button className={form.timing === "straight" ? "on" : ""} onClick={() => set("timing", "straight")}>Straight through</button><button className={form.timing === "halves" ? "on" : ""} onClick={() => set("timing", "halves")}>Two halves</button></Choice><div className="formgrid small">{form.timing === "straight" ? <Field label="Game duration (minutes)"><input type="number" min="1" value={form.duration} onChange={e => set("duration", +e.target.value)}/></Field> : <><Field label="Minutes per half"><input type="number" min="1" value={form.perHalf} onChange={e => set("perHalf", +e.target.value)}/></Field><Field label="Half-time break"><input type="number" min="0" value={form.halfTime} onChange={e => set("halfTime", +e.target.value)}/></Field></>}<Field label="Break between rounds"><input type="number" min="0" value={form.gap} onChange={e => set("gap", +e.target.value)}/></Field></div><Choice label="Schedule type"><button className={form.mode === "groups" ? "on" : ""} onClick={() => set("mode", "groups")}>Balanced groups</button><button className={form.mode === "custom" ? "on" : ""} onClick={() => set("mode", "custom")}>Build manually</button></Choice><div className="setup-summary"><span>Estimated match window</span><b>{form.start} onward</b><small>{gameLength} minute games · {form.gap} minute changeover</small></div></div>
    <div className="panel teams-panel"><Head n={String(teams.length).padStart(2, "0")} title="Participating teams" sub="Add every team here so the format and game count are easy to judge together."/><div className="team-add"><input aria-label="New team name" placeholder="Type a team name, then press Enter" value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && addTeam()}/><button onClick={addTeam}>+ Add</button></div>{form.mode === "groups" && <div className="group-tools"><Field label="Number of groups"><input type="number" min="1" max="6" value={form.groups} onChange={e => set("groups", +e.target.value)}/></Field><button className="ghost" onClick={() => setTeams(items => items.map((team, index) => ({ ...team, group: String.fromCharCode(65 + index % form.groups) })))}>Distribute evenly</button></div>}<div className="teamtable"><div className="teamrow heading"><span>Team</span><span>Detected club</span>{form.mode === "groups" && <span>Group</span>}<span/></div>{teams.length === 0 && <div className="empty-state"><div>＋</div><b>No teams added yet</b><span>Team names stay in this tab only and clear when the session ends.</span></div>}{teams.map(team => <div className="teamrow" key={team.id}><input value={team.name} aria-label="Team name" onChange={e => changeTeam(team.id, { name: e.target.value, club: detectedClub(e.target.value) })}/><input value={team.club} aria-label="Detected club" onChange={e => changeTeam(team.id, { club: e.target.value })}/>{form.mode === "groups" && <select aria-label="Team group" value={team.group} onChange={e => changeTeam(team.id, { group: e.target.value })}>{Array.from({ length: form.groups }, (_, i) => <option key={i}>{String.fromCharCode(65 + i)}</option>)}</select>}<button className="remove" aria-label={`Remove ${team.name}`} onClick={() => setTeams(items => items.filter(item => item.id !== team.id))}>×</button></div>)}</div><div className="notice"><span>✓</span><div><b>Same-club protection is on</b><small>Teams with the same detected club name only meet when a balanced alternative is unavailable.</small></div></div><div className="actions"><span className="helper">Add at least two teams to continue.</span><button className="primary" disabled={teams.length < 2} onClick={onContinue}>Continue <span>→</span></button></div></div></section>;
}

function Brand({ form, set, onBack, onContinue }: { form: Form; set: <K extends keyof Form>(key: K, value: Form[K]) => void; onBack: () => void; onContinue: () => void }) {
  return <section className="workspace brand-grid"><div className="panel brand"><Head n="02" title="Club identity" sub="Use your crest and colours to make the poster recognisably yours."/><label className={`upload ${form.logo ? "has-logo" : ""}`}>{form.logo ? <><img src={form.logo} alt="Club crest"/><b>Change club crest</b></> : <><div>⬆</div><b>Upload club crest</b></>}<input type="file" accept="image/png,image/jpeg" onChange={e => { const file = e.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onload = () => set("logo", String(reader.result)); reader.readAsDataURL(file); } }}/><small>PNG or JPEG · used on screen and in the download</small></label><div className="colors"><Field label="Primary colour"><input type="color" value={form.primary} onChange={e => set("primary", e.target.value)}/></Field><Field label="Accent colour"><input type="color" value={form.accent} onChange={e => set("accent", e.target.value)}/></Field></div><div className="brand-preview"><i style={{ background: form.primary }}/><i style={{ background: form.accent }}/><span>Your poster palette</span></div></div><div className="panel info-panel"><Head n="✦" title="Rules & host information" sub="Optional notes shown in the information band at the foot of the poster."/><Field label="Game rules"><textarea rows={8} placeholder="One rule per line" value={form.rules} onChange={e => set("rules", e.target.value)}/></Field><Field label="Host information"><textarea rows={6} placeholder="Refreshments, parking, meeting point or other useful information" value={form.info} onChange={e => set("info", e.target.value)}/></Field><div className="actions"><button className="ghost" onClick={onBack}>← Back</button><button className="primary" onClick={onContinue}>{form.mode === "groups" ? "Generate schedule" : "Build schedule"} <span>→</span></button></div></div></section>;
}

function Poster({ posterRef, form, matches, teams, rounds, gameLength, end, roundTime }: { posterRef: React.RefObject<HTMLDivElement | null>; form: Form; matches: Match[]; teams: Record<string, Team>; rounds: number; gameLength: number; end: string; roundTime: (r: number) => string }) {
  const date = form.date ? new Date(`${form.date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }).toUpperCase() : "EVENT DATE";
  const ruleLines = (form.rules || "Add optional game rules").split("\n").filter(Boolean);
  return <div ref={posterRef} className="poster" style={{ "--club": form.primary, "--accent": form.accent } as React.CSSProperties}><header className="posterhead"><Crest logo={form.logo}/><div className="poster-title"><h2>{(form.host || "HOST CLUB").toUpperCase()}</h2><h3>GIRLS BLITZ</h3><p><span>{date}</span></p><small>HOSTED BY {form.host ? form.host.toUpperCase() : "HOST CLUB"}</small></div><Crest logo={form.logo}/></header><div className="age">{form.age || "AGE GROUP"} BLITZ</div><div className="facts"><span><i>◷</i><b>{form.start} – {end}</b></span><span><i>◉</i><b>{gameLength} MIN GAMES</b></span><span><i>⏱</i><b>{form.gap} MIN BREAK BETWEEN ROUNDS</b></span><span><i>▦</i><b>PITCHES P1–P{form.pitches}</b></span><span><i>✓</i><b>{form.games} GAMES PER TEAM</b></span></div><div className={`rounds r${rounds}`}>{Array.from({ length: rounds }, (_, i) => i + 1).map(round => <article key={round}><h4>ROUND {round} <em>{roundTime(round)}</em></h4><div style={{ gridTemplateColumns: `repeat(${form.pitches}, 1fr)` }}>{Array.from({ length: form.pitches }, (_, i) => i + 1).map(pitch => { const match = matches.find(item => item.round === round && item.pitch === pitch); return <section key={pitch}><b>P{pitch}</b>{match ? <p><span>{teams[match.home]?.name}</span><i>vs</i><span>{teams[match.away]?.name}</span></p> : <p className="bye">—</p>}</section>})}</div></article>)}</div><div className="rules"><b><span>★</span> CLUB RULES & INFORMATION <span>★</span></b><div><section>{ruleLines.slice(0, 3).map((rule, i) => <p key={i}><i>{i === 0 ? "●" : i === 1 ? "◷" : "✓"}</i>{rule}</p>)}</section><section><p><i>●</i>Respect referees at all times</p><p><i>↻</i>Encourage rotation throughout matches</p></section><section className="host-info"><i>◧</i><p>{form.info || "Add optional host club information"}</p></section></div></div><footer><span>★</span> THANK YOU FOR YOUR SUPPORT – ENJOY THE DAY! <span>★</span></footer></div>;
}
function Crest({ logo }: { logo: string }) { return <div className={`crest ${logo ? "with-image" : ""}`}>{logo ? <img src={logo} alt=""/> : <><b>CLUB</b><span>CREST</span></>}</div>; }
function Head({ n, title, sub }: { n: string; title: string; sub: string }) { return <div className="head"><i>{n}</i><div><h2>{title}</h2><p>{sub}</p></div></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
function Choice({ label, children }: { label: string; children: React.ReactNode }) { return <div className="choice"><span>{label}</span><div className="seg">{children}</div></div>; }

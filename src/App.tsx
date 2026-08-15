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

function solvePackedRounds(teams: Team[], target: number, pitches: number, roundLimit: number, allowSameClub: boolean) {
  const counts = Object.fromEntries(teams.map(team => [team.id, 0])); const usedEdges = new Set<string>();
  const rounds = Array.from({ length: roundLimit }, () => ({ ids: new Set<string>(), pairs: [] as { a: Team; b: Team }[] })); let visits = 0;
  const edgeKey = (a: Team, b: Team) => [a.id, b.id].sort().join("|");
  const eligible = (a: Team, b: Team, round: number) => a.id !== b.id && a.group === b.group && !rounds[round].ids.has(a.id) && !rounds[round].ids.has(b.id) && !usedEdges.has(edgeKey(a, b)) && counts[a.id] < target && counts[b.id] < target && (allowSameClub || a.club.toLowerCase() !== b.club.toLowerCase());
  const solve = (round: number): boolean => {
    if (++visits > 800000) return false;
    if (round === roundLimit) return teams.every(team => counts[team.id] === target);
    const current = rounds[round]; const remainingGames = teams.reduce((sum, team) => sum + target - counts[team.id], 0) / 2;
    if (remainingGames > (roundLimit - round - 1) * pitches + (pitches - current.pairs.length)) return false;
    if (teams.some(team => target - counts[team.id] > roundLimit - round - (current.ids.has(team.id) ? 1 : 0))) return false;
    if (current.pairs.length === pitches) return solve(round + 1);
    const available = teams.filter(team => counts[team.id] < target && !current.ids.has(team.id));
    if (!available.length) return solve(round + 1);
    const team = available.sort((a, b) => {
      const options = (item: Team) => teams.filter(other => eligible(item, other, round)).length;
      const urgency = (item: Team) => target - counts[item.id] === roundLimit - round ? 0 : 1;
      return urgency(a) - urgency(b) || options(a) - options(b) || (target - counts[b.id]) - (target - counts[a.id]);
    })[0];
    const opponents = teams.filter(other => eligible(team, other, round)).sort((a, b) =>
      (target - counts[b.id]) - (target - counts[a.id]) || a.club.localeCompare(b.club) || a.name.localeCompare(b.name));
    for (const opponent of opponents) {
      const key = edgeKey(team, opponent); current.pairs.push({ a: team, b: opponent }); current.ids.add(team.id); current.ids.add(opponent.id); usedEdges.add(key); counts[team.id]++; counts[opponent.id]++;
      const globallyPossible = teams.every(item => target - counts[item.id] <= teams.filter(other => item.id !== other.id && item.group === other.group && !usedEdges.has(edgeKey(item, other)) && counts[other.id] < target && (allowSameClub || item.club.toLowerCase() !== other.club.toLowerCase())).length);
      if (globallyPossible && solve(round)) return true;
      counts[team.id]--; counts[opponent.id]--; usedEdges.delete(key); current.ids.delete(team.id); current.ids.delete(opponent.id); current.pairs.pop();
    }
    const futureCapacity = (roundLimit - round - 1) * pitches;
    if (remainingGames <= futureCapacity && current.pairs.length > 0 && solve(round + 1)) return true;
    return false;
  };
  return solve(0) ? rounds : null;
}

function buildSchedule(teams: Team[], target: number, pitches: number) {
  const totalGames = teams.length * target / 2; const minimumRounds = Math.max(target, Math.ceil(totalGames / pitches)); const maximumRounds = minimumRounds + teams.length;
  const findSchedule = (allowSameClub: boolean) => {
    for (let roundCount = minimumRounds; roundCount <= maximumRounds; roundCount++) {
      const result = solvePackedRounds(teams, target, pitches, roundCount, allowSameClub);
      if (result) return result;
    }
    return null;
  };
  const interClub = findSchedule(false); const rounds = interClub ?? findSchedule(true) ?? [];
  const chosen = rounds.flatMap(round => round.pairs); const warnings: string[] = [];
  const counts = Object.fromEntries(teams.map(team => [team.id, chosen.filter(pair => pair.a.id === team.id || pair.b.id === team.id).length]));
  const short = teams.filter(team => counts[team.id] < target);
  if (short.length) warnings.push(`${short.length} team${short.length === 1 ? "" : "s"} could not reach ${target} games with the current inputs.`);
  const sameClub = chosen.filter(pair => pair.a.club.toLowerCase() === pair.b.club.toLowerCase());
  if (sameClub.length) warnings.push(`${sameClub.length} same-club fixture${sameClub.length === 1 ? " was" : "s were"} unavoidable.`);
  return { warnings, matches: rounds.flatMap((round, roundIndex) => round.pairs.map((pair, pitchIndex) => ({ id: uid(), home: pair.a.id, away: pair.b.id, round: roundIndex + 1, pitch: pitchIndex + 1 }))) };
}

async function renderPosterCanvas(form: Form, matches: Match[], teams: Record<string, Team>, rounds: number, gameLength: number, end: string, roundTime: (round: number) => string) {
  const canvas = document.createElement("canvas"); canvas.width = 2240; canvas.height = 1494;
  const ctx = canvas.getContext("2d")!; ctx.scale(2, 2); const width = 1120; const height = 747;
  const rounded = (x: number, y: number, w: number, h: number, radius: number, fill: string, stroke?: string) => {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  };
  const fitted = (text: string, x: number, y: number, maxWidth: number, size = 13, weight = 800) => {
    let fontSize = size; do { ctx.font = `${weight} ${fontSize}px "Arial Narrow", "Trebuchet MS", Arial`; fontSize--; } while (ctx.measureText(text).width > maxWidth && fontSize > 8); ctx.fillText(text, x, y);
  };
  ctx.fillStyle = "#fdfcf9"; ctx.fillRect(0, 0, width, height); ctx.strokeStyle = "#111"; ctx.lineWidth = 2; ctx.strokeRect(2, 2, width - 4, height - 4); ctx.textAlign = "center";
  if (form.logo.startsWith("data:image/")) {
    const crest = new Image(); crest.src = form.logo; await crest.decode(); ctx.drawImage(crest, 43, 28, 108, 126); ctx.drawImage(crest, 969, 28, 108, 126);
  }
  ctx.fillStyle = "#050505"; ctx.font = '900 58px "Arial Black", "Arial Narrow", Arial'; ctx.fillText((form.host || "HOST CLUB").toUpperCase(), 560, 68);
  ctx.fillStyle = form.primary; ctx.font = '900 52px "Arial Black", "Arial Narrow", Arial'; ctx.fillText("GIRLS BLITZ", 560, 119);
  ctx.fillStyle = form.accent; ctx.beginPath(); ctx.moveTo(290, 126); ctx.lineTo(830, 126); ctx.lineTo(814, 143); ctx.lineTo(830, 160); ctx.lineTo(290, 160); ctx.lineTo(306, 143); ctx.closePath(); ctx.fill();
  const date = form.date ? new Date(`${form.date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }).toUpperCase() : "EVENT DATE";
  ctx.fillStyle = "#fff"; ctx.font = '900 20px "Arial Narrow", "Trebuchet MS", Arial'; ctx.fillText(date, 560, 151); ctx.fillStyle = "#111"; ctx.font = '900 16px "Arial Narrow", "Trebuchet MS", Arial'; ctx.fillText(`HOSTED BY ${(form.host || "HOST CLUB").toUpperCase()}`, 560, 179);
  rounded(10, 184, 1100, 44, 7, form.primary); ctx.fillStyle = "#fff"; ctx.font = '900 25px "Arial Black", "Arial Narrow", Arial'; ctx.fillText(`${form.age || "AGE GROUP"} BLITZ`, 560, 215);
  rounded(10, 232, 1100, 43, 7, "#fff", "#9bae9f");
  const facts = [{ icon: "◷", text: `${form.start} – ${end}` }, { icon: "◉", text: `${gameLength} MIN GAMES` }, { icon: "⏱", text: `${form.gap} MIN BREAK BETWEEN ROUNDS` }, { icon: "▦", text: `PITCHES P1–P${form.pitches}` }, { icon: "✓", text: `${form.games} GAMES PER TEAM` }];
  facts.forEach((fact, index) => { const cell = 1100 / facts.length; if (index) { ctx.strokeStyle = "#b3c0b5"; ctx.beginPath(); ctx.moveTo(10 + index * cell, 238); ctx.lineTo(10 + index * cell, 269); ctx.stroke(); } const centre = 10 + index * cell + cell / 2; ctx.fillStyle = form.primary; ctx.font = '900 17px "Trebuchet MS", Arial'; ctx.fillText(fact.icon, centre - 66, 259); ctx.fillStyle = "#111"; ctx.font = '800 11px "Arial Narrow", "Trebuchet MS", Arial'; ctx.fillText(fact.text, centre + 10, 258); });
  const columns = rounds <= 4 ? 2 : 3; const rows = Math.max(1, Math.ceil(rounds / columns)); const gap = 9; const gridTop = 283; const gridHeight = 306; const boxWidth = (1100 - gap * (columns - 1)) / columns; const boxHeight = (gridHeight - gap * (rows - 1)) / rows;
  Array.from({ length: rounds }, (_, i) => i + 1).forEach((round, index) => {
    const left = 10 + (index % columns) * (boxWidth + gap); const top = gridTop + Math.floor(index / columns) * (boxHeight + gap);
    rounded(left, top, boxWidth, boxHeight, 7, "#fff", "#79927d");
    const roundLabel = `ROUND ${round}`; const timeLabel = roundTime(round); ctx.font = '900 16px "Arial Narrow", "Trebuchet MS", Arial';
    const headingGap = 9; const headingWidth = ctx.measureText(roundLabel).width + headingGap + ctx.measureText(timeLabel).width; const headingStart = left + (boxWidth - headingWidth) / 2;
    ctx.textAlign = "left"; ctx.fillStyle = "#111"; ctx.fillText(roundLabel, headingStart, top + 21); ctx.fillStyle = form.primary; ctx.fillText(timeLabel, headingStart + ctx.measureText(roundLabel).width + headingGap, top + 21); ctx.textAlign = "center";
    const cellWidth = boxWidth / form.pitches;
    Array.from({ length: form.pitches }, (_, i) => i + 1).forEach(pitch => {
      const x = left + (pitch - 1) * cellWidth; const match = matches.find(item => item.round === round && item.pitch === pitch);
      rounded(x + 2, top + 29, cellWidth - 4, 24, 4, form.primary); ctx.fillStyle = "#fff"; ctx.font = '900 13px "Arial Narrow", "Trebuchet MS", Arial'; ctx.fillText(`P${pitch}`, x + cellWidth / 2, top + 46);
      if (pitch > 1) { ctx.strokeStyle = "#c0cbc2"; ctx.beginPath(); ctx.moveTo(x, top + 56); ctx.lineTo(x, top + boxHeight - 6); ctx.stroke(); }
      if (match) { const centre = x + cellWidth / 2; const bodyMid = top + 54 + (boxHeight - 54) / 2; ctx.fillStyle = "#111"; fitted(teams[match.home]?.name || "", centre, bodyMid - 15, cellWidth - 14, 13); ctx.font = '700 9px "Trebuchet MS", Arial'; ctx.fillStyle = "#546058"; ctx.fillText("VS", centre, bodyMid); ctx.fillStyle = "#111"; fitted(teams[match.away]?.name || "", centre, bodyMid + 17, cellWidth - 14, 13); }
    });
  });
  rounded(10, 598, 1100, 26, 7, form.primary); ctx.fillStyle = "#fff"; ctx.font = '900 16px "Arial Narrow", "Trebuchet MS", Arial'; ctx.fillText("★     CLUB RULES & INFORMATION     ★", 560, 616);
  rounded(10, 627, 1100, 79, 7, "#fff", "#829785"); ctx.strokeStyle = "#a9b7ab"; [373, 742].forEach(x => { ctx.beginPath(); ctx.moveTo(x, 636); ctx.lineTo(x, 697); ctx.stroke(); });
  ctx.textAlign = "left"; ctx.fillStyle = "#111"; ctx.font = '700 10.5px "Trebuchet MS", Arial';
  const rules = (form.rules || "Add optional game rules").split("\n").filter(Boolean).slice(0, 4); rules.forEach((rule, index) => { ctx.fillStyle = form.primary; ctx.font = '900 12px "Trebuchet MS", Arial'; ctx.fillText(index === 1 ? "◷" : index === 2 ? "✓" : "●", 27, 648 + index * 15); ctx.fillStyle = "#111"; ctx.font = '700 10.5px "Trebuchet MS", Arial'; ctx.fillText(rule, 47, 648 + index * 15); });
  ctx.fillStyle = form.primary; ctx.font = '900 12px "Trebuchet MS", Arial'; ctx.fillText("●", 390, 648); ctx.fillText("↻", 390, 665); ctx.fillStyle = "#111"; ctx.font = '700 10.5px "Trebuchet MS", Arial'; ctx.fillText("Respect referees at all times", 410, 648); ctx.fillText("Encourage rotation throughout matches", 410, 665);
  const wrap = (text: string, x: number, y: number, maxWidth: number) => { const words = text.split(" "); let line = ""; let lineY = y; words.forEach(word => { const test = line ? `${line} ${word}` : word; if (ctx.measureText(test).width > maxWidth && line) { ctx.fillText(line, x, lineY); line = word; lineY += 14; } else line = test; }); if (line) ctx.fillText(line, x, lineY); };
  ctx.fillStyle = form.primary; ctx.font = '900 17px "Trebuchet MS", Arial'; ctx.fillText("▣", 762, 650); ctx.fillStyle = "#111"; ctx.font = '700 10.5px "Trebuchet MS", Arial'; wrap(form.info || "Add optional host club information", 790, 648, 290);
  ctx.textAlign = "center"; rounded(10, 713, 1100, 27, 6, form.primary); ctx.fillStyle = "#fff"; ctx.font = '900 14px "Arial Narrow", "Trebuchet MS", Arial'; ctx.fillText("★     THANK YOU FOR YOUR SUPPORT – ENJOY THE DAY!     ★", 560, 732);
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
  const generate = (confirmed = false) => {
    if (matches.length && !confirmed && !confirm("Generate a new draft? This will replace any manual fixture edits you have made.")) return;
    if (form.mode === "custom") {
      if (!matches.length && teams.length > 1) setMatches([{ id: uid(), home: teams[0].id, away: teams[1].id, round: 1, pitch: 1 }]);
      setWarnings([]); setStep("draft"); return;
    }
    const result = buildSchedule(teams, form.games, form.pitches); setMatches(result.matches); setWarnings(result.warnings); setStep("draft");
  };
  const reset = () => { if (confirm("Start a new event? Your current session will be cleared.")) { sessionStorage.clear(); location.reload(); } };
  const steps = [{ id: "setup", n: "1", label: "Event & teams" }, { id: "draft", n: "2", label: "Fixture draft" }, { id: "brand", n: "3", label: "Poster details" }, { id: "poster", n: "4", label: "Preview & export" }] as const;

  return <main className={`step-${step}`}>
    <header className="topbar"><div className="brand-lockup"><div className="mark">BF</div><div><b>Blitz Fixture Maker</b><small>Fast, balanced and match-day ready</small></div></div><button className="text-button" onClick={reset}>Start new event</button></header>
    <section className="hero"><div className="hero-copy"><p>FIXTURES, WITHOUT THE SPREADSHEET</p><h1>Build the blitz.<br/><em>Share the day.</em></h1><span>Create a balanced schedule and a polished, club-branded poster from one simple workspace.</span></div><div className="event-pulse"><div><b>{teams.length}</b><span>Teams</span></div><div><b>{matches.length}</b><span>Fixtures</span></div><small>{matches.length ? `${roundCount} rounds · ${form.pitches} pitches` : "Add your event and teams to begin"}</small></div></section>
    <nav className="tabs" aria-label="Event builder steps">{steps.map((item, index) => { const currentIndex = steps.findIndex(candidate => candidate.id === step); const complete = index < currentIndex; return <button className={`${step === item.id ? "active" : ""} ${complete ? "complete" : ""}`} onClick={() => setStep(item.id)} disabled={item.id !== "setup" && !matches.length} key={item.id}><i>{complete ? "✓" : item.n}</i><span>{item.label}</span><small>{item.id === "setup" ? `${teams.length} teams` : item.id === "draft" ? matches.length ? `${matches.length} games` : "Not generated" : item.id === "brand" ? "Optional" : "Download"}</small></button>})}</nav>
    {step === "setup" && <Setup form={form} set={set} teams={teams} setTeams={setTeams} draft={draft} setDraft={setDraft} addTeam={addTeam} changeTeam={changeTeam} gameLength={gameLength} onContinue={() => generate(false)}/>}
    {step === "draft" && <FixtureDraft form={form} teams={teams} matches={matches} warnings={warnings} roundCount={roundCount} roundTime={roundTime} changeMatch={changeMatch} setMatches={setMatches} regenerate={() => generate(false)} onBack={() => setStep("setup")} onContinue={() => setStep("brand")}/>}
    {step === "brand" && <Brand form={form} set={set} onBack={() => setStep("draft")} onContinue={() => setStep("poster")}/>}
    {step === "poster" && <section className="workspace poster-step"><div className="poster-step-head"><Head n="04" title="Preview & export" sub="Review the finished poster, then download a high-resolution PNG for sharing or printing."/><div className="poster-actions"><button className="ghost" onClick={() => setStep("brand")}>← Poster details</button><button className="primary" onClick={() => exportPosterPng(form, matches, teamMap, roundCount, gameLength, eventEnd, roundTime)}>Download PNG <span>↓</span></button></div></div><div className="posterwrap final-preview"><PosterImage form={form} matches={matches} teams={teamMap} rounds={roundCount} gameLength={gameLength} end={eventEnd} roundTime={roundTime}/></div><div className="poster-footnote"><span>Need to change a game?</span><button className="text-button" onClick={() => setStep("draft")}>Return to fixture draft</button></div></section>}
  </main>;
}

function Setup({ form, set, teams, setTeams, draft, setDraft, addTeam, changeTeam, gameLength, onContinue }: { form: Form; set: <K extends keyof Form>(key: K, value: Form[K]) => void; teams: Team[]; setTeams: React.Dispatch<React.SetStateAction<Team[]>>; draft: string; setDraft: (v: string) => void; addTeam: () => void; changeTeam: (id: string, p: Partial<Team>) => void; gameLength: number; onContinue: () => void }) {
  const [bulkMode, setBulkMode] = useState(false); const [bulkText, setBulkText] = useState("");
  const estimatedMatches = Math.ceil(teams.length * form.games / 2); const estimatedRounds = Math.ceil(estimatedMatches / Math.max(form.pitches, 1));
  const estimatedEnd = clock(toMinutes(form.start) + Math.max(0, estimatedRounds * gameLength + Math.max(0, estimatedRounds - 1) * form.gap));
  const validation: string[] = [];
  if (teams.length < 2) validation.push("Add at least two teams.");
  if (form.pitches < 1) validation.push("At least one pitch is required.");
  if (gameLength < 1) validation.push("Game duration must be at least one minute.");
  if (form.mode === "groups") {
    Array.from({ length: form.groups }, (_, index) => String.fromCharCode(65 + index)).forEach(group => {
      const size = teams.filter(team => team.group === group).length;
      if (size > 0 && form.games > size - 1) validation.push(`Group ${group} needs at least ${form.games + 1} teams for ${form.games} unique games each.`);
      if ((size * form.games) % 2 !== 0) validation.push(`Group ${group} cannot evenly allocate ${form.games} games per team.`);
    });
  }
  const addBulkTeams = () => {
    const names = bulkText.split("\n").map(name => name.trim()).filter(Boolean);
    if (!names.length) return;
    setTeams(items => [...items, ...names.map(name => ({ id: uid(), name, club: detectedClub(name), group: "A" }))]); setBulkText(""); setBulkMode(false);
  };
  return <section className="workspace setup-grid"><div className="panel"><Head n="01" title="Event setup" sub="Choose the format, timing and capacity for the day."/><div className="formgrid"><Field label="Host club"><input placeholder="e.g. Killeeshil GAC" value={form.host} onChange={e => set("host", e.target.value)}/></Field><Field label="Event date"><input type="date" value={form.date} onChange={e => set("date", e.target.value)}/></Field><Field label="Age group"><input placeholder="e.g. U11" value={form.age} onChange={e => set("age", e.target.value)}/></Field><Field label="First game starts"><input type="time" value={form.start} onChange={e => set("start", e.target.value)}/></Field><Field label="Available pitches"><input type="number" min="1" max="8" value={form.pitches} onChange={e => set("pitches", +e.target.value)}/></Field><Field label="Games for each team"><input type="number" min="1" value={form.games} onChange={e => set("games", +e.target.value)}/></Field></div><Choice label="Game format"><button className={form.timing === "straight" ? "on" : ""} onClick={() => set("timing", "straight")}>Straight through</button><button className={form.timing === "halves" ? "on" : ""} onClick={() => set("timing", "halves")}>Two halves</button></Choice><div className="formgrid small">{form.timing === "straight" ? <Field label="Game duration (minutes)"><input type="number" min="1" value={form.duration} onChange={e => set("duration", +e.target.value)}/></Field> : <><Field label="Minutes per half"><input type="number" min="1" value={form.perHalf} onChange={e => set("perHalf", +e.target.value)}/></Field><Field label="Half-time break"><input type="number" min="0" value={form.halfTime} onChange={e => set("halfTime", +e.target.value)}/></Field></>}<Field label="Break between rounds"><input type="number" min="0" value={form.gap} onChange={e => set("gap", +e.target.value)}/></Field></div><Choice label="Schedule type"><button className={form.mode === "groups" ? "on" : ""} onClick={() => set("mode", "groups")}>Balanced groups</button><button className={form.mode === "custom" ? "on" : ""} onClick={() => set("mode", "custom")}>Build manually</button></Choice><div className="setup-summary readiness"><span>Draft readiness</span><b>{teams.length} teams · {form.pitches} pitches · {form.games} games each</b><small>{estimatedMatches} fixtures across approximately {estimatedRounds} rounds · {form.start}–{estimatedEnd}</small></div>{validation.length > 0 && teams.length > 0 && <div className="setup-errors">{validation.map((message, index) => <span key={index}>⚠ {message}</span>)}</div>}</div>
    <div className="panel teams-panel"><Head n={String(teams.length).padStart(2, "0")} title="Participating teams" sub="Add every team here so the format and game count are easy to judge together."/><div className="entry-switch"><button className={!bulkMode ? "active" : ""} onClick={() => setBulkMode(false)}>Add one</button><button className={bulkMode ? "active" : ""} onClick={() => setBulkMode(true)}>Paste a list</button></div>{bulkMode ? <div className="bulk-add"><textarea rows={6} placeholder={"Killeeshil 1\nKilleeshil 2\nMoortown\nCookstown"} value={bulkText} onChange={e => setBulkText(e.target.value)}/><button className="primary" disabled={!bulkText.trim()} onClick={addBulkTeams}>Add {bulkText.split("\n").filter(Boolean).length || ""} teams</button></div> : <div className="team-add"><input aria-label="New team name" placeholder="Type a team name, then press Enter" value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && addTeam()}/><button onClick={addTeam}>+ Add</button></div>}{form.mode === "groups" && <div className="group-tools"><Field label="Number of groups"><input type="number" min="1" max="6" value={form.groups} onChange={e => set("groups", +e.target.value)}/></Field><button className="ghost" onClick={() => setTeams(items => items.map((team, index) => ({ ...team, group: String.fromCharCode(65 + index % form.groups) })))}>Distribute evenly</button></div>}<div className="teamtable"><div className="teamrow heading"><span>Team</span><span>Detected club</span>{form.mode === "groups" && <span>Group</span>}<span/></div>{teams.length === 0 && <div className="empty-state"><div>＋</div><b>No teams added yet</b><span>Add teams one at a time or paste a complete list.</span></div>}{teams.map(team => <div className="teamrow" key={team.id}><input value={team.name} aria-label="Team name" onChange={e => changeTeam(team.id, { name: e.target.value, club: detectedClub(e.target.value) })}/><input value={team.club} aria-label="Detected club" onChange={e => changeTeam(team.id, { club: e.target.value })}/>{form.mode === "groups" && <select aria-label="Team group" value={team.group} onChange={e => changeTeam(team.id, { group: e.target.value })}>{Array.from({ length: form.groups }, (_, i) => <option key={i}>{String.fromCharCode(65 + i)}</option>)}</select>}<button className="remove" aria-label={`Remove ${team.name}`} onClick={() => setTeams(items => items.filter(item => item.id !== team.id))}>×</button></div>)}</div><div className="notice"><span>✓</span><div><b>Same-club protection is on</b><small>Teams with the same detected club name only meet when a balanced alternative is unavailable.</small></div></div><div className="actions mobile-sticky-action"><span className="helper">{validation.length ? "Resolve the highlighted setup issues to continue." : "Everything is ready for a first draft."}</span><button className="primary" disabled={validation.length > 0} onClick={onContinue}>{form.mode === "groups" ? "Generate fixture draft" : "Start fixture draft"} <span>→</span></button></div></div></section>;
}

function FixtureDraft({ form, teams, matches, warnings, roundCount, roundTime, changeMatch, setMatches, regenerate, onBack, onContinue }: { form: Form; teams: Team[]; matches: Match[]; warnings: string[]; roundCount: number; roundTime: (round: number) => string; changeMatch: (id: string, patch: Partial<Match>) => void; setMatches: React.Dispatch<React.SetStateAction<Match[]>>; regenerate: () => void; onBack: () => void; onContinue: () => void }) {
  const [selectedRound, setSelectedRound] = useState(1);
  const allSorted = [...matches].sort((a, b) => a.round - b.round || a.pitch - b.pitch);
  const sorted = selectedRound ? allSorted.filter(match => match.round === selectedRound) : allSorted;
  const gameCounts = Object.fromEntries(teams.map(team => [team.id, matches.filter(match => match.home === team.id || match.away === team.id).length]));
  const duplicateSlots = matches.filter(match => matches.some(other => other.id !== match.id && other.round === match.round && other.pitch === match.pitch)).map(match => match.id);
  const clashes = matches.filter(match => matches.some(other => other.id !== match.id && other.round === match.round && [other.home, other.away].some(id => id === match.home || id === match.away))).map(match => match.id);
  const sameClub = matches.filter(match => teams.find(team => team.id === match.home)?.club.toLowerCase() === teams.find(team => team.id === match.away)?.club.toLowerCase()).length;
  const issueCount = new Set([...duplicateSlots, ...clashes]).size;
  return <section className="workspace draft-step"><div className="draft-header"><Head n="02" title="Review your fixture draft" sub="Edit the spreadsheet until the rounds, pitches and pairings work for your event."/><div className="draft-actions"><button className="ghost" onClick={regenerate}>↻ Regenerate</button><button className="ghost" disabled={teams.length < 2} onClick={() => setMatches(items => [...items, { id: uid(), home: teams[0].id, away: teams[1].id, round: Math.max(roundCount, 1), pitch: 1 }])}>+ Add fixture</button></div></div>
    <div className="draft-summary"><div><b>{matches.length}</b><span>Fixtures</span></div><div><b>{roundCount}</b><span>Rounds</span></div><div><b>{form.pitches}</b><span>Pitches</span></div><div className={issueCount ? "summary-alert" : "summary-ok"}><b>{issueCount || "✓"}</b><span>{issueCount ? "Conflicts to fix" : "No slot conflicts"}</span></div></div>
    {warnings.filter(warning => !warning.includes("same-club")).map((warning, i) => <div className="warning" key={i}>⚠ <span>{warning}</span></div>)}{sameClub > 0 && <div className="warning">⚠ <span>{sameClub} same-club fixture{sameClub === 1 ? "" : "s"} currently in the edited draft.</span></div>}
    <div className="round-filter" aria-label="Filter fixtures by round"><button className={selectedRound === 0 ? "active" : ""} onClick={() => setSelectedRound(0)}>All rounds</button>{Array.from({ length: roundCount }, (_, index) => index + 1).map(round => <button className={selectedRound === round ? "active" : ""} onClick={() => setSelectedRound(round)} key={round}>Round {round}</button>)}</div>
    <div className="fixture-sheet"><div className="sheet-head"><span>#</span><span>Round</span><span>Time</span><span>Pitch</span><span>Team A</span><span></span><span>Team B</span><span></span></div>{sorted.map((match, index) => { const hasIssue = duplicateSlots.includes(match.id) || clashes.includes(match.id); return <div className={`sheet-row ${hasIssue ? "row-issue" : ""}`} key={match.id}><span className="row-number">{String(index + 1).padStart(2, "0")}</span><label><small>Round</small><input aria-label="Round" type="number" min="1" value={match.round} onChange={e => changeMatch(match.id, { round: +e.target.value })}/></label><span className="sheet-time">{roundTime(match.round)}</span><label><small>Pitch</small><select aria-label="Pitch" value={match.pitch} onChange={e => changeMatch(match.id, { pitch: +e.target.value })}>{Array.from({ length: form.pitches }, (_, i) => <option value={i + 1} key={i}>Pitch {i + 1}</option>)}</select></label><label><small>Team A</small><select aria-label="Team A" value={match.home} onChange={e => changeMatch(match.id, { home: e.target.value })}>{teams.map(team => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label><span className="versus">vs</span><label><small>Team B</small><select aria-label="Team B" value={match.away} onChange={e => changeMatch(match.id, { away: e.target.value })}>{teams.map(team => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label><button className="remove" aria-label="Remove fixture" onClick={() => setMatches(items => items.filter(item => item.id !== match.id))}>×</button></div>})}</div>
    <details className="team-balance"><summary><b>Games per team</b><span>Target: {form.games} · Tap to review</span></summary><div>{teams.map(team => <span className={gameCounts[team.id] === form.games ? "balanced" : "unbalanced"} key={team.id}>{team.name}<b>{gameCounts[team.id]}</b></span>)}</div></details>
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

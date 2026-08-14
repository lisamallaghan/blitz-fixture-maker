"use client";

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
  rules: "", info: "", primary: "#174c2b", accent: "#c8191e", logo: "",
};

function buildSchedule(teams: Team[], target: number, pitches: number) {
  const counts = Object.fromEntries(teams.map(team => [team.id, 0]));
  const pool = teams.flatMap((a, index) => teams.slice(index + 1)
    .filter(b => a.group === b.group)
    .map(b => ({ a, b, used: false })));
  const chosen: typeof pool = [];
  while (Object.values(counts).some(value => value < target)) {
    const possible = pool.filter(pair => !pair.used && counts[pair.a.id] < target && counts[pair.b.id] < target);
    if (!possible.length) break;
    possible.sort((x, y) => {
      const score = (pair: typeof x) => (pair.a.club.toLowerCase() === pair.b.club.toLowerCase() ? 100 : 0) + counts[pair.a.id] + counts[pair.b.id];
      return score(x) - score(y);
    });
    const pair = possible[0]; pair.used = true; chosen.push(pair); counts[pair.a.id]++; counts[pair.b.id]++;
  }
  const warnings: string[] = [];
  const short = teams.filter(team => counts[team.id] < target);
  if (short.length) warnings.push(`${short.length} team${short.length === 1 ? "" : "s"} could not reach ${target} games with the current inputs.`);
  const sameClub = chosen.filter(pair => pair.a.club.toLowerCase() === pair.b.club.toLowerCase());
  if (sameClub.length) warnings.push(`${sameClub.length} same-club fixture${sameClub.length === 1 ? " was" : "s were"} unavoidable.`);
  const rounds: { ids: Set<string>; pairs: typeof pool }[] = [];
  chosen.forEach(pair => {
    let round = rounds.find(item => item.pairs.length < pitches && !item.ids.has(pair.a.id) && !item.ids.has(pair.b.id));
    if (!round) { round = { ids: new Set(), pairs: [] }; rounds.push(round); }
    round.pairs.push(pair); round.ids.add(pair.a.id); round.ids.add(pair.b.id);
  });
  return {
    warnings,
    matches: rounds.flatMap((round, roundIndex) => round.pairs.map((pair, pitchIndex) => ({
      id: uid(), home: pair.a.id, away: pair.b.id, round: roundIndex + 1, pitch: pitchIndex + 1,
    }))),
  };
}

export default function Home() {
  const [restored] = useState<null | { form: Form; teams: Team[]; matches: Match[]; warnings: string[] }>(() => {
    try { const saved = sessionStorage.getItem("bfm-v2"); return saved ? JSON.parse(saved) : null; }
    catch { return null; }
  });
  const [form, setForm] = useState<Form>(restored?.form ?? initial);
  const [teams, setTeams] = useState<Team[]>(restored?.teams ?? []);
  const [matches, setMatches] = useState<Match[]>(restored?.matches ?? []);
  const [warnings, setWarnings] = useState<string[]>(restored?.warnings ?? []);
  const [step, setStep] = useState<"setup" | "brand" | "schedule">("setup");
  const [draft, setDraft] = useState("");
  const [dragged, setDragged] = useState<string | null>(null);

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
    if (!dragged) return;
    const source = matches.find(match => match.id === dragged); const target = matches.find(match => match.round === targetRound && match.pitch === targetPitch);
    if (!source) return;
    setMatches(items => items.map(match => {
      if (match.id === source.id) return { ...match, round: targetRound, pitch: targetPitch };
      if (target && match.id === target.id) return { ...match, round: source.round, pitch: source.pitch };
      return match;
    }));
    setDragged(null);
  };

  const drawWrapped = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines = 8) => {
    const paragraphs = text.split("\n"); let currentY = y; let lines = 0;
    paragraphs.forEach(paragraph => {
      const words = paragraph.split(" "); let line = "";
      words.forEach(word => {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxWidth && line) { if (lines < maxLines) ctx.fillText(line, x, currentY); currentY += lineHeight; lines++; line = word; } else line = test;
      });
      if (line && lines < maxLines) { ctx.fillText(line, x, currentY); currentY += lineHeight; lines++; }
    });
  };
  const exportPng = async () => {
    const canvas = document.createElement("canvas"); canvas.width = 1800; canvas.height = 1200;
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#fbfaf6"; ctx.fillRect(0, 0, 1800, 1200); ctx.textAlign = "center";
    if (form.logo) {
      const image = new Image(); image.src = form.logo; await image.decode();
      ctx.drawImage(image, 70, 48, 145, 145); ctx.drawImage(image, 1585, 48, 145, 145);
    }
    ctx.fillStyle = "#111"; ctx.font = "900 66px Arial"; ctx.fillText((form.host || "HOST CLUB").toUpperCase(), 900, 88);
    ctx.fillStyle = form.primary; ctx.font = "900 60px Arial"; ctx.fillText("GIRLS BLITZ", 900, 154);
    ctx.fillStyle = form.accent; ctx.fillRect(500, 178, 800, 54); ctx.fillStyle = "#fff"; ctx.font = "800 28px Arial";
    const date = form.date ? new Date(`${form.date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }).toUpperCase() : "EVENT DATE";
    ctx.fillText(date, 900, 214); ctx.fillStyle = form.primary; ctx.fillRect(30, 255, 1740, 58); ctx.fillStyle = "#fff"; ctx.font = "900 36px Arial"; ctx.fillText(`${form.age || "AGE GROUP"} BLITZ`, 900, 296);
    ctx.fillStyle = "#111"; ctx.font = "700 21px Arial"; ctx.fillText(`${form.start}–${eventEnd}   •   ${gameLength} MIN GAMES   •   ${form.gap} MIN BREAK   •   PITCHES 1–${form.pitches}`, 900, 350);
    const cols = roundCount <= 4 ? 2 : 3, rows = Math.ceil(roundCount / cols), gap = 18, width = (1740 - gap * (cols - 1)) / cols, height = Math.min(218, (555 - gap * (rows - 1)) / Math.max(rows, 1));
    Array.from({ length: roundCount }, (_, i) => i + 1).forEach((round, index) => {
      const row = Math.floor(index / cols), col = index % cols, left = 30 + col * (width + gap), top = 380 + row * (height + gap);
      ctx.fillStyle = "#fff"; ctx.strokeStyle = form.primary; ctx.lineWidth = 3; ctx.fillRect(left, top, width, height); ctx.strokeRect(left, top, width, height);
      ctx.fillStyle = form.primary; ctx.fillRect(left, top, width, 44); ctx.fillStyle = "#fff"; ctx.font = "800 21px Arial"; ctx.fillText(`ROUND ${round}   ${roundTime(round)}`, left + width / 2, top + 30);
      const cellWidth = width / form.pitches;
      Array.from({ length: form.pitches }, (_, i) => i + 1).forEach(pitch => {
        const x = left + (pitch - 1) * cellWidth, match = matches.find(item => item.round === round && item.pitch === pitch);
        ctx.strokeStyle = "#c2ccc3"; ctx.strokeRect(x, top + 44, cellWidth, height - 44); ctx.fillStyle = form.primary; ctx.font = "700 16px Arial"; ctx.fillText(`P${pitch}`, x + cellWidth / 2, top + 70);
        if (match) { ctx.fillStyle = "#111"; ctx.font = "700 14px Arial"; ctx.fillText(teamMap[match.home]?.name || "", x + cellWidth / 2, top + 107); ctx.font = "600 12px Arial"; ctx.fillText("vs", x + cellWidth / 2, top + 133); ctx.font = "700 14px Arial"; ctx.fillText(teamMap[match.away]?.name || "", x + cellWidth / 2, top + 159); }
      });
    });
    ctx.fillStyle = form.primary; ctx.fillRect(30, 965, 1740, 42); ctx.fillStyle = "#fff"; ctx.font = "800 24px Arial"; ctx.fillText("CLUB RULES & INFORMATION", 900, 994);
    ctx.textAlign = "left"; ctx.fillStyle = "#111"; ctx.font = "600 18px Arial"; drawWrapped(ctx, form.rules || "Add optional game rules", 80, 1040, 760, 25, 5); drawWrapped(ctx, form.info || "Add optional host club information", 970, 1040, 750, 25, 5);
    ctx.textAlign = "center"; ctx.fillStyle = form.primary; ctx.fillRect(30, 1150, 1740, 42); ctx.fillStyle = "#fff"; ctx.font = "800 23px Arial"; ctx.fillText("THANK YOU FOR YOUR SUPPORT — ENJOY THE DAY!", 900, 1179);
    const link = document.createElement("a"); link.download = `${(form.age || "blitz").toLowerCase()}-fixtures.png`; link.href = canvas.toDataURL("image/png"); link.click();
  };

  return <main>
    <header className="topbar"><div className="mark">BF</div><div><b>Blitz Fixture Maker</b><small>Build a balanced blitz in minutes</small></div><button className="ghost" onClick={() => { sessionStorage.clear(); location.reload(); }}>New event</button></header>
    <section className="hero"><div><p>FIXTURES, WITHOUT THE SPREADSHEET</p><h1>From team list to<br/><em>match-day ready.</em></h1><span>Set the rules, balance the games, fine-tune the schedule and export a club-branded poster.</span></div><aside><b>{teams.length}</b><span>teams added</span><small>{matches.length ? `${matches.length} fixtures scheduled` : "Start with your event details"}</small></aside></section>
    <nav className="tabs">{([['setup','1','Event & teams'],['brand','2','Brand & information'],['schedule','3','Schedule & poster']] as const).map(([value, number, label]) => <button className={step === value ? "active" : ""} onClick={() => setStep(value)} key={value}><i>{number}</i>{label}</button>)}</nav>

    {step === "setup" && <section className="workspace setup-grid">
      <div className="panel"><Head n="01" title="Event details" sub="See your team count while choosing the format and timing."/><div className="formgrid"><Field label="Host club"><input placeholder="e.g. Killeeshil GAC" value={form.host} onChange={e => set("host", e.target.value)}/></Field><Field label="Date"><input type="date" value={form.date} onChange={e => set("date", e.target.value)}/></Field><Field label="Age group"><input placeholder="e.g. U11" value={form.age} onChange={e => set("age", e.target.value)}/></Field><Field label="First game"><input type="time" value={form.start} onChange={e => set("start", e.target.value)}/></Field><Field label="Number of pitches"><input type="number" min="1" max="8" value={form.pitches} onChange={e => set("pitches", +e.target.value)}/></Field><Field label="Games per team"><input type="number" min="1" value={form.games} onChange={e => set("games", +e.target.value)}/></Field></div><div className="seg"><button className={form.timing === "straight" ? "on" : ""} onClick={() => set("timing", "straight")}>Straight through</button><button className={form.timing === "halves" ? "on" : ""} onClick={() => set("timing", "halves")}>Two halves</button></div><div className="formgrid small">{form.timing === "straight" ? <Field label="Game duration (minutes)"><input type="number" value={form.duration} onChange={e => set("duration", +e.target.value)}/></Field> : <><Field label="Minutes per half"><input type="number" value={form.perHalf} onChange={e => set("perHalf", +e.target.value)}/></Field><Field label="Half-time break"><input type="number" value={form.halfTime} onChange={e => set("halfTime", +e.target.value)}/></Field></>}<Field label="Break between rounds"><input type="number" value={form.gap} onChange={e => set("gap", +e.target.value)}/></Field></div><div className="seg"><button className={form.mode === "groups" ? "on" : ""} onClick={() => set("mode", "groups")}>Round-robin groups</button><button className={form.mode === "custom" ? "on" : ""} onClick={() => set("mode", "custom")}>Custom fixtures</button></div></div>
      <div className="panel teams-panel"><Head n={`${teams.length}`} title="Participating teams" sub="Names such as ‘Killeeshil 1’ and ‘Killeeshil 2’ are linked automatically."/><div className="team-add"><input placeholder="Enter a team name" value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && addTeam()}/><button onClick={addTeam}>Add team</button></div>{form.mode === "groups" && <div className="group-tools"><Field label="Number of groups"><input type="number" min="1" max="6" value={form.groups} onChange={e => set("groups", +e.target.value)}/></Field><button className="ghost" onClick={() => setTeams(items => items.map((team, index) => ({ ...team, group: String.fromCharCode(65 + index % form.groups) })))}>Distribute evenly</button></div>}<div className="teamtable compact-table"><div className="teamrow heading"><span>Team</span><span>Detected club</span>{form.mode === "groups" && <span>Group</span>}<span/></div>{teams.length === 0 && <div className="empty-state"><b>No teams yet</b><span>Add the participating teams to begin building your schedule.</span></div>}{teams.map(team => <div className="teamrow" key={team.id}><input value={team.name} onChange={e => changeTeam(team.id, { name: e.target.value, club: detectedClub(e.target.value) })}/><input value={team.club} onChange={e => changeTeam(team.id, { club: e.target.value })}/>{form.mode === "groups" && <select value={team.group} onChange={e => changeTeam(team.id, { group: e.target.value })}>{Array.from({ length: form.groups }, (_, i) => <option key={i}>{String.fromCharCode(65 + i)}</option>)}</select>}<button className="remove" onClick={() => setTeams(items => items.filter(item => item.id !== team.id))}>×</button></div>)}</div><div className="notice"><b>Same-club protection</b><span>Matching club names only meet when no balanced alternative exists.</span></div><div className="actions"><span/><button className="primary" disabled={teams.length < 2} onClick={() => setStep("brand")}>Continue to branding →</button></div></div>
    </section>}

    {step === "brand" && <section className="workspace brand-grid"><div className="panel brand"><Head n="02" title="Club identity" sub="Everything here is optional and can be changed later."/><label className="upload">{form.logo ? <img src={form.logo} alt="Club crest"/> : <b>Upload club crest</b>}<input type="file" accept="image/*" onChange={e => { const file = e.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onload = () => set("logo", String(reader.result)); reader.readAsDataURL(file); } }}/><small>PNG or JPEG</small></label><div className="colors"><Field label="Primary colour"><input type="color" value={form.primary} onChange={e => set("primary", e.target.value)}/></Field><Field label="Accent colour"><input type="color" value={form.accent} onChange={e => set("accent", e.target.value)}/></Field></div></div><div className="panel"><Head n="✦" title="Rules & host information" sub="Shown in the information section of the final poster."/><Field label="Game rules"><textarea rows={8} placeholder="One rule per line" value={form.rules} onChange={e => set("rules", e.target.value)}/></Field><Field label="Host information"><textarea rows={6} placeholder="Refreshments, parking or other useful information" value={form.info} onChange={e => set("info", e.target.value)}/></Field><div className="actions"><button className="ghost" onClick={() => setStep("setup")}>← Back</button><button className="primary" onClick={form.mode === "groups" ? generate : () => setStep("schedule")}>{form.mode === "groups" ? "Generate balanced schedule" : "Build custom schedule"} →</button></div></div></section>}

    {step === "schedule" && <section className="workspace schedule-v2"><div className="panel board-panel"><div className="board-head"><Head n="03" title="Fine-tune schedule" sub="Drag a fixture to another slot. Drop onto an occupied slot to swap them."/><button className="ghost" onClick={() => teams.length > 1 && setMatches(items => [...items, { id: uid(), home: teams[0].id, away: teams[1].id, round: Math.max(roundCount, 1), pitch: 1 }])}>+ Add match</button></div>{warnings.map((warning, i) => <div className="warning" key={i}>⚠ {warning}</div>)}<div className="schedule-board">{Array.from({ length: Math.max(roundCount, 1) }, (_, i) => i + 1).map(round => <div className="board-round" key={round}><div className="round-label"><b>Round {round}</b><span>{roundTime(round)}</span></div><div className="slots" style={{ gridTemplateColumns: `repeat(${form.pitches}, minmax(145px, 1fr))` }}>{Array.from({ length: form.pitches }, (_, i) => i + 1).map(pitch => { const match = matches.find(item => item.round === round && item.pitch === pitch); return <div className={`slot ${match ? "filled" : ""}`} key={pitch} onDragOver={e => e.preventDefault()} onDrop={() => moveMatch(round, pitch)}><label>Pitch {pitch}</label>{match ? <div className="fixture-card" draggable onDragStart={() => setDragged(match.id)}><span className="drag-handle">⠿ Drag to move</span><div><select aria-label="First team" value={match.home} onChange={e => changeMatch(match.id, { home: e.target.value })}>{teams.map(team => <option value={team.id} key={team.id}>{team.name}</option>)}</select><i>vs</i><select aria-label="Second team" value={match.away} onChange={e => changeMatch(match.id, { away: e.target.value })}>{teams.map(team => <option value={team.id} key={team.id}>{team.name}</option>)}</select></div><button className="remove" onClick={() => setMatches(items => items.filter(item => item.id !== match.id))}>×</button></div> : <span className="drop-hint">Drop fixture here</span>}</div>})}</div></div>)}</div><div className="actions"><button className="ghost" onClick={() => setStep("brand")}>← Branding</button><button className="ghost" onClick={() => setStep("setup")}>Edit event & teams</button></div></div>
      <div className="preview"><div className="previewbar"><div><b>Live poster</b><small>The downloaded PNG contains the same schedule, crest, rules and information.</small></div><button className="primary" onClick={exportPng}>Download PNG ↓</button></div><div className="posterwrap"><Poster form={form} matches={matches} teams={teamMap} rounds={roundCount} gameLength={gameLength} end={eventEnd} roundTime={roundTime}/></div></div></section>}
  </main>;
}

function Poster({ form, matches, teams, rounds, gameLength, end, roundTime }: { form: Form; matches: Match[]; teams: Record<string, Team>; rounds: number; gameLength: number; end: string; roundTime: (r: number) => string }) {
  const date = form.date ? new Date(`${form.date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }).toUpperCase() : "EVENT DATE";
  return <div className="poster" style={{ "--club": form.primary, "--accent": form.accent } as React.CSSProperties}><div className="posterhead">{form.logo && <img src={form.logo} alt=""/>}<div><h2>{(form.host || "HOST CLUB").toUpperCase()}</h2><h3>GIRLS BLITZ</h3><p>{date}</p></div>{form.logo && <img src={form.logo} alt=""/>}</div><div className="age">{form.age || "AGE GROUP"} BLITZ</div><div className="facts"><span>{form.start}–{end}</span><span>{gameLength} MIN GAMES</span><span>{form.gap} MIN BREAK</span><span>PITCHES 1–{form.pitches}</span></div><div className={`rounds r${rounds}`}>{Array.from({ length: rounds }, (_, i) => i + 1).map(round => <article key={round}><h4>ROUND {round} <em>{roundTime(round)}</em></h4><div style={{ gridTemplateColumns: `repeat(${form.pitches}, 1fr)` }}>{Array.from({ length: form.pitches }, (_, i) => i + 1).map(pitch => { const match = matches.find(item => item.round === round && item.pitch === pitch); return <section key={pitch}><b>P{pitch}</b>{match ? <p>{teams[match.home]?.name}<i>vs</i>{teams[match.away]?.name}</p> : <p>—</p>}</section>})}</div></article>)}</div><div className="rules"><b>CLUB RULES & INFORMATION</b><div><p>{form.rules || "Add optional game rules"}</p><p>{form.info || "Add optional host club information"}</p></div></div><footer>THANK YOU FOR YOUR SUPPORT — ENJOY THE DAY!</footer></div>;
}
function Head({ n, title, sub }: { n: string; title: string; sub: string }) { return <div className="head"><i>{n}</i><div><h2>{title}</h2><p>{sub}</p></div></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }

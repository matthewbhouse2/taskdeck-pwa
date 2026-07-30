import React, { useState, useEffect, useRef, useCallback, useContext } from "react";
import { Play, Pause, X, Plus, Calendar as CalIcon, LayoutDashboard, ListPlus, Trash2, Clock, ChevronLeft, ChevronRight, CheckCircle2, Bell, Repeat, Target, BarChart3, Sun, Moon, Trophy, Flame, Award, Lock, Compass, Zap, LogOut } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";

// ---------- design tokens ----------
// red/green/blue/violet carry meaning (behind/on-track/overtime/night) so they stay
// constant across both themes — only the ambient palette (bg/surface/accent/text) shifts.
const GRAD_RED = "#E2603A";
const GRAD_GREEN = "#4C9A5B";
const GRAD_BLUE = "#4FA0BE";
const GRAD_VIOLET = "#7A5B94";

const THEMES = {
  dark: {
    bg: "#150F13",
    surface: "#231721",
    surface2: "#2E1D2A",
    border: "#3D2733",
    text: "#F5E9E2",
    textDim: "#B99AA0",
    textFaint: "#7C5D64",
    cyan: "#C33B4A",
    cyanDim: "#4A1E22",
    amber: "#E0A548",
    amberDim: "#4A3720",
    red: GRAD_RED, redDim: "#4A2318",
    green: GRAD_GREEN, greenDim: "#1F3324",
    blue: GRAD_BLUE,
    violet: GRAD_VIOLET,
  },
  light: {
    bg: "#FBF3EA",
    surface: "#FFFFFF",
    surface2: "#F5E9DD",
    border: "#E6D2C2",
    text: "#2E1A1E",
    textDim: "#6B4F52",
    textFaint: "#9C8285",
    cyan: "#A6222B",
    cyanDim: "#F3D9D5",
    amber: "#C97F1E",
    amberDim: "#F5E3C3",
    red: GRAD_RED, redDim: "#F5DCD2",
    green: GRAD_GREEN, greenDim: "#DCEDDD",
    blue: GRAD_BLUE,
    violet: GRAD_VIOLET,
  },
};
const ThemeContext = React.createContext(THEMES.dark);

const mono = { fontFamily: "'JetBrains Mono', 'Space Mono', monospace" };
const disp = { fontFamily: "'Space Grotesk', 'Inter', sans-serif" };

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
function pad(n) { return String(n).padStart(2, "0"); }
function fmtHMS(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
function fmtHours(seconds) { return (seconds / 3600).toFixed(1); }
function dateKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function todayKey() { return dateKey(new Date()); }
function maxDateKey() { return dateKey(new Date(Date.now() + 31 * 86400000)); }
function maxGoalDateKey() { return dateKey(new Date(Date.now() + 365 * 86400000)); }
function fmtTime12(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${period}`;
}
function fmtDurationLabel(mins) {
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}
function taskDateTime(t) {
  const [y, mo, d] = t.date.split("-").map(Number);
  const [h, m] = (t.time || "00:00").split(":").map(Number);
  return new Date(y, mo - 1, d, h, m, 0);
}
function fmtClockTime(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function getFinishGraceMinutes(durationMinutes) {
  const hours = durationMinutes / 60;
  if (hours < 3) return 15;
  const extraFullHours = Math.floor(hours - 3);
  return 30 + extraFullHours * 10;
}
function isPastDate(dateStr) {
  return dateStr < todayKey();
}
function isTaskComplete(t) {
  return t.status === "done" || (t.status === "quit" && (t.liveElapsed ?? t.elapsedSeconds ?? 0) >= (t.durationMinutes || 0) * 60);
}
const MIN_BUCKET_SAMPLES = 3;
const MIN_OVERALL_SAMPLES = 8;

function timeBucketLabel(timeStr) {
  const h = Number((timeStr || "00:00").split(":")[0]);
  if (h >= 5 && h < 12) return "Morning";
  if (h >= 12 && h < 17) return "Afternoon";
  if (h >= 17 && h < 21) return "Evening";
  return "Night";
}
function fmtHourLabel(hour) {
  const period = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${period}`;
}

function periodStats(tasksOfKind, historyOfKind, startDateStr, endDateStr) {
  const scheduled = tasksOfKind.filter((t) => t.date >= startDateStr && t.date <= endDateStr);
  const completed = scheduled.filter(isTaskComplete);
  const archived = historyOfKind.filter((h) => h.date >= startDateStr && h.date <= endDateStr).reduce((s, h) => s + h.elapsedSeconds, 0);
  const unsettled = scheduled.reduce((s, t) => s + Math.max(0, (t.liveElapsed || t.elapsedSeconds || 0) - (t.lastArchivedElapsed || 0)), 0);
  return {
    scheduledCount: scheduled.length,
    completedCount: completed.length,
    pct: scheduled.length ? Math.round((completed.length / scheduled.length) * 100) : null,
    loggedSeconds: archived + unsettled,
  };
}

function bucketStats(list) {
  const completed = list.filter(isTaskComplete).length;
  return { total: list.length, completed, pct: list.length ? Math.round((completed / list.length) * 100) : 0 };
}

function buildPatterns(tasksOfKind) {
  const historical = tasksOfKind.filter((t) => t.date <= todayKey() && (t.status === "done" || t.status === "quit"));
  const totalSamples = historical.length;

  const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const byWeekday = {};
  historical.forEach((t) => { const wd = taskDateTime(t).getDay(); (byWeekday[wd] = byWeekday[wd] || []).push(t); });
  const weekdayRanking = Object.keys(byWeekday)
    .map((wd) => ({ label: weekdayNames[wd], ...bucketStats(byWeekday[wd]) }))
    .filter((b) => b.total >= MIN_BUCKET_SAMPLES)
    .sort((a, b) => b.pct - a.pct);

  const byTime = {};
  historical.forEach((t) => { const label = timeBucketLabel(t.time); (byTime[label] = byTime[label] || []).push(t); });
  const timeRanking = Object.keys(byTime)
    .map((label) => ({ label, ...bucketStats(byTime[label]) }))
    .filter((b) => b.total >= MIN_BUCKET_SAMPLES)
    .sort((a, b) => b.pct - a.pct);

  const byHour = {};
  historical.forEach((t) => { const h = Number((t.time || "00:00").split(":")[0]); (byHour[h] = byHour[h] || []).push(t); });
  const hourRanking = Object.keys(byHour)
    .map((h) => ({ label: fmtHourLabel(Number(h)), ...bucketStats(byHour[h]) }))
    .filter((b) => b.total >= MIN_BUCKET_SAMPLES)
    .sort((a, b) => b.pct - a.pct);

  const byMonth = {};
  historical.forEach((t) => { const key = t.date.slice(0, 7); (byMonth[key] = byMonth[key] || []).push(t); });
  const monthRanking = Object.keys(byMonth)
    .map((key) => {
      const [y, m] = key.split("-").map(Number);
      return { label: new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" }), ...bucketStats(byMonth[key]) };
    })
    .filter((b) => b.total >= MIN_BUCKET_SAMPLES)
    .sort((a, b) => b.pct - a.pct);

  return { enough: totalSamples >= MIN_OVERALL_SAMPLES, totalSamples, weekdayRanking, timeRanking, hourRanking, monthRanking };
}

// ---------- RPG: XP, levels, streaks, badges ----------
const LEVELS = [
  { level: 1, title: "Hopeful", xp: 0 },
  { level: 2, title: "Voyager", xp: 60 },
  { level: 3, title: "Pathfinder", xp: 150 },
  { level: 4, title: "Ranger", xp: 280 },
  { level: 5, title: "Tracker", xp: 450 },
  { level: 6, title: "Adjudicator", xp: 660 },
  { level: 7, title: "Luminary", xp: 920 },
  { level: 8, title: "Sentinel", xp: 1230 },
  { level: 9, title: "Paragon", xp: 1600 },
  { level: 10, title: "Legend", xp: 2050 },
];

function xpForCompletion(status, elapsedSeconds) {
  if (status === "done" || status === "finished") return 10 + Math.round(elapsedSeconds / 300);
  if (status === "quit") return 3 + Math.round(elapsedSeconds / 600);
  return 0;
}

function calcXP(tasks, history) {
  let xp = 0;
  history.forEach((h) => {
    if (h.status === "done" || h.status === "finished") xp += 10 + Math.round(h.elapsedSeconds / 300);
    else if (h.status === "quit") xp += 3 + Math.round(h.elapsedSeconds / 600);
  });
  const taskItems = tasks.filter((t) => (t.kind || "task") === "task" && t.date <= todayKey());
  const byDate = {};
  taskItems.forEach((t) => { (byDate[t.date] = byDate[t.date] || []).push(t); });
  Object.values(byDate).forEach((list) => { if (list.length > 0 && list.every(isTaskComplete)) xp += 20; });
  return xp;
}

function getLevelInfo(xp) {
  let current = LEVELS[0], next = null;
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i].xp) current = LEVELS[i];
    if (xp < LEVELS[i].xp) { next = LEVELS[i]; break; }
  }
  const pct = next ? Math.round(((xp - current.xp) / (next.xp - current.xp)) * 100) : 100;
  return { current, next, pct, xp };
}

function calcStreaks(tasks) {
  const taskItems = tasks.filter((t) => (t.kind || "task") === "task");
  const byDate = {};
  taskItems.forEach((t) => { (byDate[t.date] = byDate[t.date] || []).push(t); });
  function daySuccess(dateStr) {
    const list = byDate[dateStr];
    if (!list || list.length === 0) return null; // no tasks that day — neutral, doesn't break a streak
    return list.some(isTaskComplete);
  }
  const allDates = Object.keys(byDate).filter((d) => d <= todayKey()).sort();
  let longest = 0, run = 0;
  allDates.forEach((d) => {
    const ok = daySuccess(d);
    if (ok === true) { run++; longest = Math.max(longest, run); }
    else if (ok === false) run = 0;
  });
  let current = 0;
  let cursor = new Date(Date.now() - 86400000);
  for (let i = 0; i < 400; i++) {
    const ok = daySuccess(dateKey(cursor));
    if (ok === true) { current++; cursor = new Date(cursor.getTime() - 86400000); continue; }
    if (ok === null) { cursor = new Date(cursor.getTime() - 86400000); continue; }
    break;
  }
  const todayOk = daySuccess(todayKey());
  if (todayOk === true) current += 1;
  return { current, longest: Math.max(longest, current), todayDone: todayOk === true };
}

function buildBadgeContext(tasks, goals, history, streaks) {
  const completedCount = history.filter((h) => h.status === "done" || h.status === "finished").length;
  const earlyCount = history.filter((h) => (h.status === "done" || h.status === "finished") && Number((h.time || "00:00").split(":")[0]) < 9).length;
  const lateCount = history.filter((h) => (h.status === "done" || h.status === "finished") && Number((h.time || "00:00").split(":")[0]) >= 21).length;
  const extraCount = tasks.filter((t) => (t.kind || "task") === "task" && t.status === "done" && (t.elapsedSeconds || 0) > (t.durationMinutes || 0) * 60).length;
  const goalCompleted = goals.some((g) => {
    const logged = history.filter((h) => h.kind === "goalSession" && h.goalId === g.id).reduce((s, h) => s + h.elapsedSeconds, 0);
    return (g.totalHours || 0) > 0 && logged / ((g.totalHours || 0) * 3600) >= 1;
  });
  const taskItems = tasks.filter((t) => (t.kind || "task") === "task" && t.date <= todayKey());
  const byDate = {};
  taskItems.forEach((t) => { (byDate[t.date] = byDate[t.date] || []).push(t); });
  const perfectDay = Object.values(byDate).some((list) => list.length >= 3 && list.every(isTaskComplete));
  const dates = Object.keys(byDate).sort();
  let comeback = false;
  for (let i = 1; i < dates.length; i++) {
    const prevAllFail = byDate[dates[i - 1]].every((t) => !isTaskComplete(t));
    const curAnyDone = byDate[dates[i]].some(isTaskComplete);
    if (prevAllFail && curAnyDone) { comeback = true; break; }
  }
  return { completedCount, earlyCount, lateCount, extraCount, goalCompleted, perfectDay, comeback, streaks };
}

// ---------- original world content (not affiliated with any existing IP) ----------
const AURA_TYPES = {
  Vanguard: { name: "Vanguard", blurb: "Bold and direct. Amplifies physical presence — strength, speed, resilience.", key: "physical power" },
  Weaver: { name: "Weaver", blurb: "Methodical and creative. Shapes Aura into constructs and tools.", key: "construction" },
  Phantom: { name: "Phantom", blurb: "Cunning and independent. Bends perception — misdirection, subtlety.", key: "perception" },
  Warden: { name: "Warden", blurb: "Steady and protective. Shields, senses, and holds ground for others.", key: "protection" },
  Drifter: { name: "Drifter", blurb: "Unpredictable and adaptable. Rare — techniques that don't play by the usual rules.", key: "the unexpected" },
};

const AURA_QUIZ = [
  { q: "A locked door stands between you and your goal. You:", opts: [["Kick it down", "Vanguard"], ["Pick the lock with something you built", "Weaver"], ["Get someone else to open it for you", "Phantom"], ["Check every angle before touching it", "Warden"], ["Look for a window instead", "Drifter"]] },
  { q: "A friend's in trouble. Your first instinct:", opts: [["Charge in immediately", "Vanguard"], ["Bring the right plan and tool for it", "Weaver"], ["Talk your way past whoever's causing it", "Phantom"], ["Get between them and the danger", "Warden"], ["Do something nobody saw coming", "Drifter"]] },
  { q: "How do you prefer to solve problems?", opts: [["Head-on, with effort", "Vanguard"], ["By building the right solution", "Weaver"], ["By reading people and using that", "Phantom"], ["By preparing carefully first", "Warden"], ["By improvising, rules be damned", "Drifter"]] },
  { q: "What do people rely on you for?", opts: [["Getting things done", "Vanguard"], ["Figuring things out", "Weaver"], ["Reading the room", "Phantom"], ["Having their back", "Warden"], ["Keeping things interesting", "Drifter"]] },
  { q: "Pick a flaw you recognize in yourself:", opts: [["Impatient", "Vanguard"], ["Overthinks things", "Weaver"], ["Hard to read, even for friends", "Phantom"], ["Overprotective", "Warden"], ["Impossible to predict, even for yourself", "Drifter"]] },
  { q: "In a group, you're usually the one who:", opts: [["Takes the first swing", "Vanguard"], ["Brings the right gear", "Weaver"], ["Knows something everyone else missed", "Phantom"], ["Makes sure no one's left behind", "Warden"], ["Does something nobody asked for", "Drifter"]] },
  { q: "What matters most to you?", opts: [["Strength", "Vanguard"], ["Craft", "Weaver"], ["Understanding", "Phantom"], ["Loyalty", "Warden"], ["Freedom", "Drifter"]] },
];

// per-type technique tree: 5 auto unlocks + 3 branch choices (2 options each) + 1 capstone
const TECHNIQUE_TREES = {
  Vanguard: {
    auto: { 2: ["Iron Step", "Steadier footing — harder to knock off balance."], 3: ["Quickstrike", "A faster first move."], 5: ["Unbroken", "Keeps going past the point most would stop."], 7: ["Second Wind", "Recovers momentum mid-task."], 9: ["Iron Will", "Pushes through when it matters most."] },
    branch: { 4: [["Crushing Blow", "Raw, overwhelming power."], ["Fleet Assault", "Speed and precision over force."]], 6: [["Aftershock", "Power that lingers after the first strike."], ["Afterimage", "Fast enough to seem like two places at once."]], 8: [["Wall Breaker", "Force that goes through, not around."], ["Blitz", "Speed that never lets up."]] },
    capstone: ["Vanguard's Reckoning", "Full power, held back for nothing."],
  },
  Weaver: {
    auto: { 2: ["First Thread", "Shapes raw Aura into something useful."], 3: ["Steady Hands", "Precision under pressure."], 5: ["Blueprint", "Plans three steps ahead."], 7: ["Refinement", "Makes the good better."], 9: ["Mastercraft", "Nothing wasted, nothing left to chance."] },
    branch: { 4: [["Forge", "Built for strength."], ["Filigree", "Built for subtlety."]], 6: [["Bastion", "A construct that holds the line."], ["Trigger", "A construct that reacts before you do."]], 8: [["Grand Design", "One big solution for one big problem."], ["Toolkit", "Many small ones, ready for anything."]] },
    capstone: ["Weaver's Masterwork", "A construct built for exactly this moment."],
  },
  Phantom: {
    auto: { 2: ["Soft Step", "Goes unnoticed when it matters."], 3: ["Read", "Sees more than people mean to show."], 5: ["Patience", "Waits for the exact right moment."], 7: ["Leverage", "Turns what people don't know into an advantage."], 9: ["Unshakeable Composure", "Never gives the game away."] },
    branch: { 4: [["Misdirect", "Redirects attention on command."], ["Mask", "Hides true intent completely."]], 6: [["Sleight", "Small deceptions, big effect."], ["Veil", "Disappears entirely, on cue."]], 8: [["Puppeteer", "Steers the whole situation."], ["Ghost", "Was never really there."]] },
    capstone: ["Phantom's Gambit", "The reveal only comes once they've already lost."],
  },
  Warden: {
    auto: { 2: ["Steady Ground", "Holds a position, calm under pressure."], 3: ["Sharp Eye", "Notices trouble before it arrives."], 5: ["Second Sense", "Feels when something's wrong."], 7: ["Steady Hand", "Calm enough to guide others through it."], 9: ["Unbreakable Watch", "Never lets the guard down."] },
    branch: { 4: [["Bulwark", "Protects the one who needs it most."], ["Perimeter", "Protects everyone in range."]], 6: [["Unyielding", "Immovable, no matter the pressure."], ["Reach", "Extends protection further than expected."]], 8: [["Fortress", "Total defense, no gaps."], ["Counterguard", "Defends and answers back."]] },
    capstone: ["Warden's Line", "The line that does not break."],
  },
  Drifter: {
    auto: { 2: ["Off-Script", "Never quite does the expected thing."], 3: ["Loose Ends", "Leaves options open others would've closed."], 5: ["No Pattern", "Impossible to read, even in a rhythm."], 7: ["Improvise", "Makes a plan out of nothing."], 9: ["Unwritten", "The rules just don't apply the same way."] },
    branch: { 4: [["Wildcard", "Unpredictable on offense."], ["Slip", "Unpredictable on evasion."]], 6: [["Curveball", "Bends the rules of engagement."], ["Backdoor", "Finds the exception nobody planned for."]], 8: [["Rule Breaker", "Does the thing that shouldn't work."], ["Long Shot", "Bets on the unlikely — and wins."]] },
    capstone: ["Drifter's Exception", "The one outcome nobody accounted for."],
  },
};

const SPECIALIZATIONS = [
  { id: "pathfinder_corps", name: "Pathfinder Corps", blurb: "Exploration and discovery. For those who thrive on variety and new ground." },
  { id: "vanguard_corps", name: "Vanguard Corps", blurb: "Direct action. For those who favor big, decisive pushes." },
  { id: "circle_analysts", name: "Circle Analysts", blurb: "Strategy and precision. For those who favor consistency and control." },
  { id: "wayward_order", name: "Wayward Order", blurb: "Independence, unconventional methods. For those who go their own way." },
];

const COMPANIONS = [
  { id: "rin", name: "Rin", blurb: "Earnest and energetic, searching for a mentor who vanished years ago.", arc: "The Long Way Home" },
  { id: "kael", name: "Kael", blurb: "Quiet and deadly-skilled, trying to outrun his family's expectations.", arc: "Breaking the Chain" },
  { id: "mira", name: "Mira", blurb: "Sharp and focused, hunting the people who wronged her clan.", arc: "The Long Reckoning" },
  { id: "toma", name: "Toma", blurb: "Warm and steady, just wants to help the people who need it.", arc: "First, Do No Harm" },
  { id: "sable", name: "Sable", blurb: "Unpredictable and a little mysterious — knows more than they let on.", arc: "Loose Ends" },
];

// chapters map 1:1 onto the existing badges, in unlock order, with a {companion} template slot
const CHAPTERS = [
  { badgeId: "first_step", title: "The Road Out", line: "You and {companion} take the first step together." },
  { badgeId: "week_one", title: "Finding Rhythm", line: "A week in, and the road's starting to feel familiar." },
  { badgeId: "perfect_day", title: "A Day Without Cracks", line: "Everything, for once, goes exactly right." },
  { badgeId: "comeback", title: "Not Done Yet", line: "{companion} didn't expect you to get back up. Neither did you." },
  { badgeId: "early_riser", title: "Before First Light", line: "Some of the best ground gets covered before anyone else is awake." },
  { badgeId: "night_owl", title: "After Hours", line: "The work that gets done when everyone else has stopped." },
  { badgeId: "goal_slayer", title: "The Long Haul, Finished", line: "A road that took months ends exactly where you meant it to." },
  { badgeId: "overachiever", title: "Further Than Asked", line: "{companion} notices — you're the type to go past what's required." },
  { badgeId: "momentum", title: "Thirty Days Deep", line: "This isn't a streak anymore. It's just who you are now." },
  { badgeId: "century", title: "A Hundred Small Victories", line: "{companion}'s story, and yours, reach a road that opens up wider than before." },
];

function suggestSpecialization(badgeCtx, streaks) {
  if (badgeCtx.extraCount >= 5) return "wayward_order";
  if (badgeCtx.goalCompleted) return "vanguard_corps";
  if (streaks.longest >= 14) return "circle_analysts";
  return "pathfinder_corps";
}

const BADGES = [
  { id: "first_step", name: "First Steps", desc: "Complete your first task", check: (c) => c.completedCount >= 1, progress: (c) => [Math.min(c.completedCount, 1), 1] },
  { id: "week_one", name: "Week One", desc: "Reach a 7-day streak", check: (c) => c.streaks.longest >= 7, progress: (c) => [Math.min(c.streaks.longest, 7), 7] },
  { id: "momentum", name: "Momentum", desc: "Reach a 30-day streak", check: (c) => c.streaks.longest >= 30, progress: (c) => [Math.min(c.streaks.longest, 30), 30] },
  { id: "century", name: "Century Club", desc: "Complete 100 tasks", check: (c) => c.completedCount >= 100, progress: (c) => [Math.min(c.completedCount, 100), 100] },
  { id: "early_riser", name: "Early Riser", desc: "Finish 5 tasks before 9am", check: (c) => c.earlyCount >= 5, progress: (c) => [Math.min(c.earlyCount, 5), 5] },
  { id: "night_owl", name: "Night Owl", desc: "Finish 5 tasks after 9pm", check: (c) => c.lateCount >= 5, progress: (c) => [Math.min(c.lateCount, 5), 5] },
  { id: "goal_slayer", name: "Goal Slayer", desc: "Reach 100% on a goal", check: (c) => c.goalCompleted, progress: (c) => [c.goalCompleted ? 1 : 0, 1] },
  { id: "overachiever", name: "Overachiever", desc: "Log extra time on 10 tasks", check: (c) => c.extraCount >= 10, progress: (c) => [Math.min(c.extraCount, 10), 10] },
  { id: "perfect_day", name: "Perfect Day", desc: "100% on a day with 3+ tasks", check: (c) => c.perfectDay, progress: (c) => [c.perfectDay ? 1 : 0, 1] },
  { id: "comeback", name: "Comeback", desc: "Bounce back after a missed day", check: (c) => c.comeback, progress: (c) => [c.comeback ? 1 : 0, 1] },
];

function getStatusMeta(status, C) {
  const map = {
    pending: { label: "Scheduled", color: C.textDim },
    running: { label: "In progress", color: C.cyan },
    paused: { label: "Paused", color: C.amber },
    done: { label: "Complete", color: GRAD_GREEN },
    quit: { label: "Ended early", color: GRAD_RED },
    finished: { label: "Finished", color: GRAD_GREEN },
  };
  return map[status] || map.pending;
}

function generateOccurrenceDates(startDateStr, repeat, repeatLength, horizonDateStr) {
  if (repeat === "none") return [startDateStr];
  const [y, mo, d] = startDateStr.split("-").map(Number);
  const start = new Date(y, mo - 1, d);
  const lengthDays = repeatLength === "1w" ? 7 : repeatLength === "2w" ? 14 : 30;
  let horizon;
  if (horizonDateStr) {
    const [hy, hm, hd] = horizonDateStr.split("-").map(Number);
    horizon = new Date(hy, hm - 1, hd);
  } else {
    horizon = new Date(Date.now() + 31 * 86400000);
  }
  let end = new Date(start.getTime() + lengthDays * 86400000);
  if (end > horizon) end = horizon;

  const dates = [];
  let cursor = new Date(start);
  let i = 0;
  while (cursor <= end && i < 90) {
    const day = cursor.getDay();
    if (repeat === "daily") dates.push(dateKey(cursor));
    else if (repeat === "weekdays") { if (day >= 1 && day <= 5) dates.push(dateKey(cursor)); }
    else if (repeat === "weekly") { if (day === start.getDay()) dates.push(dateKey(cursor)); }
    cursor = new Date(cursor.getTime() + 86400000);
    i++;
  }
  return dates;
}

// ---------- completion gradient: red (0%) -> green (100%) -> blue (150%+, overtime) ----------
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
}
function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
}
function lerpColor(hexA, hexB, t) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  return rgbToHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
}
function getGradientColor(pct) {
  const clamped = Math.max(0, pct);
  if (clamped <= 100) return lerpColor(GRAD_RED, GRAD_GREEN, clamped / 100);
  const over = Math.min(1, (clamped - 100) / 50); // 150% = fully blue
  return lerpColor(GRAD_GREEN, GRAD_BLUE, over);
}

function playBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) {}
}

// subtle ambient texture: a faint scattering of flecks, tiled — abstract, not literal imagery
function textureBackground(mode) {
  const isDark = mode === "dark";
  const fillHex = isDark ? "#F5E9E2" : "#A6222B";
  const op = isDark ? 0.035 : 0.05;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><circle cx='8' cy='8' r='1.3' fill='${fillHex}' fill-opacity='${op}'/><circle cx='38' cy='24' r='1' fill='${fillHex}' fill-opacity='${op}'/><circle cx='52' cy='50' r='1.6' fill='${fillHex}' fill-opacity='${op}'/><circle cx='18' cy='44' r='0.8' fill='${fillHex}' fill-opacity='${op}'/><circle cx='58' cy='10' r='0.9' fill='${fillHex}' fill-opacity='${op}'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
// ambient mood tint that shifts with the real time of day — dawn/day/dusk/night
function timeOfDayTint(mode, hour) {
  const isDark = mode === "dark";
  let tint;
  if (hour >= 5 && hour < 8) tint = isDark ? "rgba(224,140,90,0.10)" : "rgba(224,140,90,0.16)";
  else if (hour >= 8 && hour < 17) tint = isDark ? "rgba(195,59,74,0.045)" : "rgba(166,34,43,0.05)";
  else if (hour >= 17 && hour < 20) tint = isDark ? "rgba(224,165,72,0.12)" : "rgba(201,127,30,0.15)";
  else tint = isDark ? "rgba(122,58,110,0.16)" : "rgba(122,91,148,0.10)";
  return `radial-gradient(circle at 85% -10%, ${tint}, transparent 55%)`;
}
function ambientBackgroundStyle(mode, hour) {
  return {
    backgroundImage: `${timeOfDayTint(mode, hour)}, ${textureBackground(mode)}`,
    backgroundRepeat: "no-repeat, repeat",
    backgroundSize: "auto, 64px 64px",
  };
}

// shared style helpers
function cardStyle(C) { return { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }; }
function inputStyle(C) { return { background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: "8px 10px", fontSize: 13, outline: "none" }; }
function primaryBtnStyle(C) { return { background: C.cyanDim, color: C.cyan, border: `1px solid ${C.cyan}55`, borderRadius: 8, cursor: "pointer", ...mono, fontSize: 11, fontWeight: 700, padding: "9px 14px" }; }
function ghostBtnStyle(C) { return { background: "none", border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 8, cursor: "pointer", ...mono, fontSize: 11, padding: "9px 14px" }; }
function dashedButtonStyle(C) { return { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px", border: `1px dashed ${C.border}`, borderRadius: 10, color: C.textDim, background: "transparent", cursor: "pointer", ...mono, fontSize: 12 }; }
function resetBtnStyle(C) { return { ...mono, fontSize: 10, color: C.textFaint, background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 8px", cursor: "pointer" }; }

export default function App({ onSignOut }) {
  const [tasks, setTasks] = useState([]);
  const [goals, setGoals] = useState([]);
  const [history, setHistory] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [now, setNow] = useState(Date.now());
  const [toasts, setToasts] = useState([]);
  const [notifPerm, setNotifPerm] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  const [quitModalFor, setQuitModalFor] = useState(null);
  const [timeUpModalFor, setTimeUpModalFor] = useState(null);
  const [resetConfirmFor, setResetConfirmFor] = useState(null);
  const [themeMode, setThemeMode] = useState("dark");
  const [seenLevel, setSeenLevel] = useState(1);
  const [seenBadges, setSeenBadges] = useState([]);
  const [rpgLoaded, setRpgLoaded] = useState(false);
  const [celebrationQueue, setCelebrationQueue] = useState([]);
  const [auraType, setAuraType] = useState(null);
  const [specializationPath, setSpecializationPath] = useState(null);
  const [companionId, setCompanionId] = useState(null);
  const [techniqueChoices, setTechniqueChoices] = useState({});
  const [journeyLoaded, setJourneyLoaded] = useState(false);
  const tickRef = useRef(null);
  const saveTasksTimer = useRef(null);
  const saveGoalsTimer = useRef(null);
  const saveHistoryTimer = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const themeRes = await window.storage.get("theme", false);
        if (themeRes && themeRes.value) setThemeMode(themeRes.value === "light" ? "light" : "dark");
      } catch (e) {}
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get("rpg_progress", false);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          setSeenLevel(parsed.seenLevel || 1);
          setSeenBadges(parsed.seenBadges || []);
        }
      } catch (e) {}
      finally { setRpgLoaded(true); }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get("journey_progress", false);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          setAuraType(parsed.auraType || null);
          setSpecializationPath(parsed.specializationPath || null);
          setCompanionId(parsed.companionId || null);
          setTechniqueChoices(parsed.techniqueChoices || {});
        }
      } catch (e) {}
      finally { setJourneyLoaded(true); }
    })();
  }, []);

  useEffect(() => {
    if (!journeyLoaded) return;
    const t = setTimeout(async () => {
      try { await window.storage.set("journey_progress", JSON.stringify({ auraType, specializationPath, companionId, techniqueChoices }), false); } catch (e) {}
    }, 300);
    return () => clearTimeout(t);
  }, [auraType, specializationPath, companionId, techniqueChoices, journeyLoaded]);

  const toggleTheme = () => {
    setThemeMode((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      window.storage.set("theme", next, false).catch(() => {});
      return next;
    });
  };

  const C = THEMES[themeMode];

  useEffect(() => {
    (async () => {
      try {
        const [tRes, gRes, hRes] = await Promise.allSettled([
          window.storage.get("tasks", false),
          window.storage.get("goals", false),
          window.storage.get("history", false),
        ]);
        if (tRes.status === "fulfilled" && tRes.value) setTasks(JSON.parse(tRes.value.value));
        if (gRes.status === "fulfilled" && gRes.value) setGoals(JSON.parse(gRes.value.value));
        if (hRes.status === "fulfilled" && hRes.value) setHistory(JSON.parse(hRes.value.value));
      } catch (e) {}
      finally { setLoaded(true); }
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (saveTasksTimer.current) clearTimeout(saveTasksTimer.current);
    saveTasksTimer.current = setTimeout(async () => {
      try { await window.storage.set("tasks", JSON.stringify(tasks), false); } catch (e) {}
    }, 400);
    return () => clearTimeout(saveTasksTimer.current);
  }, [tasks, loaded]);

  useEffect(() => {
    if (!loaded) return;
    if (saveGoalsTimer.current) clearTimeout(saveGoalsTimer.current);
    saveGoalsTimer.current = setTimeout(async () => {
      try { await window.storage.set("goals", JSON.stringify(goals), false); } catch (e) {}
    }, 400);
    return () => clearTimeout(saveGoalsTimer.current);
  }, [goals, loaded]);

  useEffect(() => {
    if (!loaded) return;
    if (saveHistoryTimer.current) clearTimeout(saveHistoryTimer.current);
    saveHistoryTimer.current = setTimeout(async () => {
      try { await window.storage.set("history", JSON.stringify(history), false); } catch (e) {}
    }, 400);
    return () => clearTimeout(saveHistoryTimer.current);
  }, [history, loaded]);

  useEffect(() => {
    if (!rpgLoaded) return;
    const t = setTimeout(async () => {
      try { await window.storage.set("rpg_progress", JSON.stringify({ seenLevel, seenBadges }), false); } catch (e) {}
    }, 400);
    return () => clearTimeout(t);
  }, [seenLevel, seenBadges, rpgLoaded]);

  useEffect(() => {
    if (!loaded || !rpgLoaded) return;
    const xp = calcXP(tasks, history);
    const levelInfo = getLevelInfo(xp);
    const streaks = calcStreaks(tasks);
    const badgeCtx = buildBadgeContext(tasks, goals, history, streaks);
    const unlocked = BADGES.filter((b) => b.check(badgeCtx));

    const newItems = [];
    if (levelInfo.current.level > seenLevel) newItems.push({ type: "level", level: levelInfo.current });
    const newBadgeIds = [];
    unlocked.forEach((b) => {
      if (!seenBadges.includes(b.id)) { newItems.push({ type: "badge", badge: b }); newBadgeIds.push(b.id); }
    });
    if (newItems.length > 0) {
      setCelebrationQueue((prev) => [...prev, ...newItems]);
      if (levelInfo.current.level > seenLevel) setSeenLevel(levelInfo.current.level);
      if (newBadgeIds.length > 0) setSeenBadges((prev) => [...prev, ...newBadgeIds]);
    }
  }, [tasks, goals, history, loaded, rpgLoaded]); // eslint-disable-line

  useEffect(() => {
    tickRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tickRef.current);
  }, []);

  const pushToast = useCallback((title, body) => {
    const id = uid();
    setToasts((prev) => [...prev, { id, title, body }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000);
  }, []);

  const notify = useCallback((title, body, beep) => {
    pushToast(title, body);
    if (beep) playBeep();
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try { new Notification(title, { body }); } catch (e) {}
    }
  }, [pushToast]);

  const requestNotifPermission = () => {
    if (typeof Notification === "undefined") return;
    Notification.requestPermission().then((p) => setNotifPerm(p));
  };

  useEffect(() => {
    if (!loaded) return;
    let changed = false;
    let timeUpId = null;
    const updated = tasks.map((t) => {
      let nt = t;
      if (t.status === "pending" && t.notifyBeforeMinutes != null && !t.notifiedBefore) {
        const target = taskDateTime(t).getTime();
        const notifyAt = target - t.notifyBeforeMinutes * 60000;
        if (now >= notifyAt && now < target + 60000) {
          notify("Coming up", `"${t.title || "Task to meet Goal"}" starts ${t.notifyBeforeMinutes === 0 ? "now" : `in ${t.notifyBeforeMinutes} min`}.`, false);
          nt = { ...nt, notifiedBefore: true };
          changed = true;
        }
      }
      if (t.status === "running" && t.runStartedAt && !t.notifiedTimeUp) {
        const plannedSeconds = (t.durationMinutes || 0) * 60;
        const elapsed = (t.elapsedSeconds || 0) + (now - t.runStartedAt) / 1000;
        if (elapsed >= plannedSeconds) {
          notify("Time's up", `"${t.title || "Task to meet Goal"}" has reached its planned duration.`, true);
          nt = { ...nt, notifiedTimeUp: true, status: "paused", elapsedSeconds: plannedSeconds, runStartedAt: null };
          changed = true;
          timeUpId = t.id;
        }
      }
      // accountability: haven't started by grace period after the set start time
      if (t.date === todayKey() && t.status === "pending" && !t.accountabilityStartNotified) {
        const startAt = taskDateTime(t).getTime();
        if (now >= startAt + 15 * 60000) {
          notify("Off schedule", `You planned to start "${t.title}" at ${fmtTime12(t.time)} — still time to get to it today.`, false);
          nt = { ...nt, accountabilityStartNotified: true };
          changed = true;
        }
      }
      // accountability: haven't finished by grace period after the originally planned finish time
      const kindNow = t.kind || "task";
      const isTerminal = kindNow === "goalSession" ? t.status === "finished" : (t.status === "done" || t.status === "quit");
      if (t.date === todayKey() && !isTerminal && !t.accountabilityFinishNotified) {
        const startAt = taskDateTime(t).getTime();
        const plannedFinishAt = startAt + (t.durationMinutes || 0) * 60000;
        const graceMin = getFinishGraceMinutes(t.durationMinutes || 0);
        if (now >= plannedFinishAt + graceMin * 60000) {
          notify("Off schedule", `You'd planned to finish "${t.title || "Task to meet Goal"}" by ${fmtClockTime(plannedFinishAt)} — no rush, just a nudge to check in.`, false);
          nt = { ...nt, accountabilityFinishNotified: true };
          changed = true;
        }
      }
      return nt;
    });
    if (changed) setTasks(updated);
    if (timeUpId) setTimeUpModalFor(timeUpId);
  }, [now, loaded]); // eslint-disable-line

  const liveTasks = tasks.map((t) => {
    if (t.status === "running" && t.runStartedAt) {
      const extra = (now - t.runStartedAt) / 1000;
      return { ...t, liveElapsed: (t.elapsedSeconds || 0) + extra };
    }
    return { ...t, liveElapsed: t.elapsedSeconds || 0 };
  });

  const archiveSession = useCallback((task, finalPatch) => {
    const priorArchived = task.lastArchivedElapsed || 0;
    const finalElapsed = finalPatch.elapsedSeconds != null ? finalPatch.elapsedSeconds : (task.elapsedSeconds || 0);
    const segmentSeconds = Math.max(0, finalElapsed - priorArchived);
    if (segmentSeconds <= 0) return;
    const entry = {
      id: uid(),
      sourceTaskId: task.id,
      kind: task.kind || "task",
      goalId: task.goalId || null,
      title: (task.kind || "task") === "goalSession" ? (task.title || "Task to meet Goal") : task.title,
      date: task.date,
      time: task.time,
      durationMinutes: task.durationMinutes,
      elapsedSeconds: segmentSeconds,
      status: finalPatch.status,
      quitReason: finalPatch.quitReason || null,
      extraSession: !!task.extraSession,
      loggedAt: Date.now(),
    };
    setHistory((prev) => [...prev, entry]);
  }, []);

  const updateTask = useCallback((id, patch) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const goTask = (id) => {
    const target = tasks.find((t) => t.id === id);
    if (!target || isPastDate(target.date)) return;
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === id) return { ...t, status: "running", runStartedAt: Date.now(), actualStartTime: t.actualStartTime || Date.now() };
        if (t.status === "running") {
          const extra = (Date.now() - (t.runStartedAt || Date.now())) / 1000;
          return { ...t, status: "paused", elapsedSeconds: (t.elapsedSeconds || 0) + extra, runStartedAt: null };
        }
        return t;
      })
    );
  };
  const stopTask = (id) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const extra = t.runStartedAt ? (Date.now() - t.runStartedAt) / 1000 : 0;
        return { ...t, status: "paused", elapsedSeconds: (t.elapsedSeconds || 0) + extra, runStartedAt: null };
      })
    );
  };
  const resolveQuit = (id, reason) => {
    const t = tasks.find((tt) => tt.id === id);
    if (!t) { setQuitModalFor(null); return; }
    const extra = t.runStartedAt ? (Date.now() - t.runStartedAt) / 1000 : 0;
    const finalElapsed = (t.elapsedSeconds || 0) + extra;
    const finalStatus = reason === "finished" ? "done" : "quit";
    archiveSession(t, { status: finalStatus, quitReason: reason, elapsedSeconds: finalElapsed });
    updateTask(id, { status: finalStatus, quitReason: reason, elapsedSeconds: finalElapsed, runStartedAt: null, extraSession: false, lastArchivedElapsed: finalElapsed });
    setQuitModalFor(null);
    const gain = xpForCompletion(finalStatus, finalElapsed);
    if (gain > 0) pushToast(finalStatus === "done" ? "Nice work" : "Logged", `+${gain} XP${finalStatus === "done" ? " · task complete" : " · partial credit for showing up"}`);
  };
  const finishGoalSession = (id) => {
    const t = tasks.find((tt) => tt.id === id);
    if (!t) return;
    const extra = t.runStartedAt ? (Date.now() - t.runStartedAt) / 1000 : 0;
    const finalElapsed = (t.elapsedSeconds || 0) + extra;
    archiveSession(t, { status: "finished", elapsedSeconds: finalElapsed });
    updateTask(id, { status: "finished", elapsedSeconds: finalElapsed, runStartedAt: null, extraSession: false, lastArchivedElapsed: finalElapsed });
    const gain = xpForCompletion("finished", finalElapsed);
    if (gain > 0) pushToast("Session complete", `+${gain} XP toward your goal`);
  };
  const renameSession = (id, title) => updateTask(id, { title });
  const addExtraTime = (id) => updateTask(id, { status: "running", runStartedAt: Date.now(), extraSession: true });
  const resolveTimeUp = (id, wantExtra) => {
    const t = tasks.find((tt) => tt.id === id);
    if (!t) { setTimeUpModalFor(null); return; }
    if (wantExtra) {
      updateTask(id, { status: "running", runStartedAt: Date.now(), extraSession: true });
    } else {
      const finalStatus = (t.kind || "task") === "goalSession" ? "finished" : "done";
      archiveSession(t, { status: finalStatus, elapsedSeconds: t.elapsedSeconds });
      updateTask(id, { status: finalStatus, lastArchivedElapsed: t.elapsedSeconds || 0 });
      const gain = xpForCompletion(finalStatus, t.elapsedSeconds || 0);
      if (gain > 0) pushToast("Time's up", `+${gain} XP · nice finish`);
    }
    setTimeUpModalFor(null);
  };
  const deleteTask = (id) => setTasks((prev) => prev.filter((t) => t.id !== id));
  const reopenTask = (id) => updateTask(id, { status: "pending", elapsedSeconds: 0, lastArchivedElapsed: 0, runStartedAt: null, actualStartTime: null, notifiedBefore: false, notifiedTimeUp: false, accountabilityStartNotified: false, accountabilityFinishNotified: false, quitReason: null, extraSession: false });
  const requestReset = (id) => setResetConfirmFor(id);
  const confirmReset = () => { if (resetConfirmFor) reopenTask(resetConfirmFor); setResetConfirmFor(null); };
  const cancelReset = () => setResetConfirmFor(null);

  const addTasks = (rows) => {
    let count = 0;
    const newOnes = [];
    rows.filter((r) => r.title.trim()).forEach((r) => {
      const dates = generateOccurrenceDates(r.date, r.repeat, r.repeatLength);
      const seriesId = r.repeat !== "none" ? uid() : null;
      dates.forEach((d) => {
        newOnes.push({
          id: uid(), kind: "task", seriesId, repeat: r.repeat,
          title: r.title.trim(), date: d, time: r.time,
          durationMinutes: Number(r.durationMinutes) || 25,
          notifyBeforeMinutes: r.notifyBeforeMinutes === "none" ? null : Number(r.notifyBeforeMinutes),
          status: "pending", elapsedSeconds: 0, lastArchivedElapsed: 0, runStartedAt: null, actualStartTime: null, extraSession: false,
          notifiedBefore: false, notifiedTimeUp: false, accountabilityStartNotified: false, accountabilityFinishNotified: false, quitReason: null, createdAt: Date.now(),
        });
        count++;
      });
    });
    if (newOnes.length) setTasks((prev) => [...prev, ...newOnes]);
    return count;
  };

  const createGoal = (meta) => {
    const id = uid();
    setGoals((prev) => [...prev, { id, ...meta, createdAt: Date.now() }]);
    return id;
  };
  const deleteGoal = (id) => {
    setGoals((prev) => prev.filter((g) => g.id !== id));
    setTasks((prev) => prev.filter((t) => !(t.kind === "goalSession" && t.goalId === id)));
  };
  const addGoalSessions = (goalId, rows) => {
    const goal = goals.find((g) => g.id === goalId);
    if (!goal) return 0;
    let count = 0;
    const newOnes = [];
    rows.forEach((r) => {
      const dates = generateOccurrenceDates(r.date, r.repeat, r.repeatLength, goal.endDate);
      const seriesId = r.repeat !== "none" ? uid() : null;
      dates.forEach((d) => {
        newOnes.push({
          id: uid(), kind: "goalSession", goalId, seriesId, repeat: r.repeat,
          title: "", date: d, time: r.time,
          durationMinutes: Number(r.durationMinutes) || 30,
          notifyBeforeMinutes: r.notifyBeforeMinutes === "none" ? null : Number(r.notifyBeforeMinutes),
          status: "pending", elapsedSeconds: 0, lastArchivedElapsed: 0, runStartedAt: null, actualStartTime: null,
          notifiedBefore: false, notifiedTimeUp: false, accountabilityStartNotified: false, accountabilityFinishNotified: false, createdAt: Date.now(),
        });
        count++;
      });
    });
    if (newOnes.length) setTasks((prev) => [...prev, ...newOnes]);
    return count;
  };

  if (!loaded) {
    return (
      <ThemeContext.Provider value={C}>
        <div style={{ background: C.bg, color: C.textDim, minHeight: "500px", display: "flex", alignItems: "center", justifyContent: "center", ...mono, ...ambientBackgroundStyle(themeMode, new Date(now).getHours()) }}>
          loading…
        </div>
      </ThemeContext.Provider>
    );
  }

  const quitTask = tasks.find((t) => t.id === quitModalFor);
  const timeUpTask = tasks.find((t) => t.id === timeUpModalFor);
  const resetTask = tasks.find((t) => t.id === resetConfirmFor);

  return (
    <ThemeContext.Provider value={C}>
    <div style={{ background: C.bg, color: C.text, minHeight: "600px", ...disp, position: "relative", ...ambientBackgroundStyle(themeMode, new Date(now).getHours()) }} className="w-full flex flex-col">
      <Header notifPerm={notifPerm} onEnableNotif={requestNotifPermission} themeMode={themeMode} onToggleTheme={toggleTheme} onSignOut={onSignOut} />
      <ToastStack toasts={toasts} />
      <div className="flex-1 p-4 md:p-6" style={{ maxWidth: 960, margin: "0 auto", width: "100%" }}>
        {tab === "dashboard" && (
          <Dashboard tasks={liveTasks} goals={goals} now={now} onGo={goTask} onStop={stopTask} onQuit={setQuitModalFor} onFinishGoal={finishGoalSession} onRename={renameSession} onReopen={requestReset} onDelete={deleteTask} onAddExtra={addExtraTime} />
        )}
        {tab === "add" && <AddTasks onAdd={addTasks} />}
        {tab === "goals" && (
          <GoalsView goals={goals} tasks={liveTasks} onCreateGoal={createGoal} onAddSessions={addGoalSessions} onGo={goTask} onStop={stopTask} onFinish={finishGoalSession} onRename={renameSession} onReopen={requestReset} onDeleteGoal={deleteGoal} onDeleteSession={deleteTask} />
        )}
        {tab === "calendar" && (
          <CalendarView tasks={liveTasks} goals={goals} onGo={goTask} onStop={stopTask} onQuit={setQuitModalFor} onFinish={finishGoalSession} onRename={renameSession} onReopen={requestReset} onDelete={deleteTask} onAddExtra={addExtraTime} />
        )}
        {tab === "tracker" && <TrackerView tasks={liveTasks} goals={goals} history={history} />}
        {tab === "rewards" && (
          <RewardsView
            tasks={liveTasks} goals={goals} history={history}
            auraType={auraType} onSetAuraType={setAuraType}
            specializationPath={specializationPath} onSetSpecialization={setSpecializationPath}
            companionId={companionId} onSetCompanion={setCompanionId}
            techniqueChoices={techniqueChoices} onSetTechniqueChoice={(lvl, name) => setTechniqueChoices((prev) => ({ ...prev, [lvl]: name }))}
          />
        )}
      </div>
      <TabBar tab={tab} setTab={setTab} />
      {celebrationQueue.length > 0 && (
        <CelebrationModal item={celebrationQueue[0]} onDismiss={() => setCelebrationQueue((prev) => prev.slice(1))} />
      )}
      {quitTask && <QuitModal task={quitTask} onResolve={resolveQuit} onCancel={() => setQuitModalFor(null)} />}
      {timeUpTask && <TimeUpModal task={timeUpTask} onResolve={resolveTimeUp} />}
      {resetTask && <ResetConfirmModal task={resetTask} onConfirm={confirmReset} onCancel={cancelReset} />}
    </div>
    </ThemeContext.Provider>
  );
}

function Header({ notifPerm, onEnableNotif, themeMode, onToggleTheme, onSignOut }) {
  const C = useContext(ThemeContext);
  return (
    <div style={{ borderBottom: `1px solid ${C.border}`, padding: "18px 20px" }} className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div style={{ width: 10, height: 10, borderRadius: 999, background: C.cyan, boxShadow: `0 0 8px ${C.cyan}` }} />
        <span style={{ ...mono, letterSpacing: 1, fontSize: 13, color: C.textDim }}>TASKDECK</span>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={onToggleTheme} className="flex items-center justify-center" style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, color: C.textDim, padding: "5px 7px", cursor: "pointer" }}>
          {themeMode === "dark" ? <Sun size={13} /> : <Moon size={13} />}
        </button>
        {notifPerm !== "unsupported" && notifPerm !== "granted" && (
          <button onClick={onEnableNotif} className="flex items-center gap-1.5" style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, color: C.textDim, padding: "5px 9px", cursor: "pointer", ...mono, fontSize: 10 }}>
            <Bell size={12} /> ENABLE ALERTS
          </button>
        )}
        <span style={{ ...mono, fontSize: 12, color: C.textFaint }}>
          {new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
        </span>
        {onSignOut && (
          <button onClick={onSignOut} className="flex items-center justify-center" style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, color: C.textFaint, padding: "5px 7px", cursor: "pointer" }} title="Sign out">
            <LogOut size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

function ToastStack({ toasts }) {
  const C = useContext(ThemeContext);
  if (!toasts.length) return null;
  return (
    <div style={{ position: "absolute", top: 60, right: 16, zIndex: 50, display: "flex", flexDirection: "column", gap: 8, width: 260 }}>
      {toasts.map((t) => (
        <div key={t.id} style={{ background: C.surface2, border: `1px solid ${C.cyanDim}`, borderRadius: 10, padding: "10px 12px", boxShadow: "0 8px 24px rgba(0,0,0,.4)" }}>
          <div className="flex items-center gap-1.5" style={{ color: C.cyan, ...mono, fontSize: 10, letterSpacing: 0.5 }}>
            <Bell size={11} /> {t.title.toUpperCase()}
          </div>
          <div style={{ fontSize: 12.5, color: C.text, marginTop: 3 }}>{t.body}</div>
        </div>
      ))}
    </div>
  );
}

function TabBar({ tab, setTab }) {
  const C = useContext(ThemeContext);
  const items = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "add", label: "Add tasks", icon: ListPlus },
    { id: "goals", label: "Goals", icon: Target },
    { id: "calendar", label: "Calendar", icon: CalIcon },
    { id: "tracker", label: "Tracker", icon: BarChart3 },
    { id: "rewards", label: "Journey", icon: Compass },
  ];
  return (
    <div style={{ borderTop: `1px solid ${C.border}`, background: C.surface }} className="flex sticky bottom-0">
      {items.map(({ id, label, icon: Icon }) => {
        const active = tab === id;
        return (
          <button key={id} onClick={() => setTab(id)} className="flex-1 flex flex-col items-center gap-1 py-3"
            style={{ color: active ? C.cyan : C.textFaint, background: "transparent", border: "none", cursor: "pointer" }}>
            <Icon size={17} />
            <span style={{ fontSize: 10.5, ...mono }}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------- Quit modal (tasks only) ----------
function QuitModal({ task, onResolve, onCancel }) {
  const C = useContext(ThemeContext);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22, width: "100%", maxWidth: 340 }}>
        <div style={{ fontSize: 14, color: C.textDim, marginBottom: 4 }}>Ending</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{task.title}</div>
        <div style={{ ...mono, fontSize: 11, color: C.textFaint, letterSpacing: 0.5, marginBottom: 10 }}>WHY ARE YOU STOPPING?</div>
        <div className="flex flex-col gap-2">
          <button onClick={() => onResolve(task.id, "finished")} className="flex items-center gap-2 py-2.5 px-3"
            style={{ background: C.greenDim, color: C.green, border: `1px solid ${C.green}44`, borderRadius: 10, cursor: "pointer", ...mono, fontSize: 12.5, fontWeight: 600, textAlign: "left" }}>
            <CheckCircle2 size={15} /> Finished task
          </button>
          <button onClick={() => onResolve(task.id, "interrupted")} className="flex items-center gap-2 py-2.5 px-3"
            style={{ background: C.redDim, color: C.red, border: `1px solid ${C.red}44`, borderRadius: 10, cursor: "pointer", ...mono, fontSize: 12.5, fontWeight: 600, textAlign: "left" }}>
            <X size={15} /> Something else came up
          </button>
        </div>
        <button onClick={onCancel} style={{ marginTop: 14, background: "none", border: "none", color: C.textFaint, cursor: "pointer", fontSize: 12, width: "100%", ...mono }}>
          CANCEL
        </button>
      </div>
    </div>
  );
}

// ---------- Time's-up prompt ----------
function TimeUpModal({ task, onResolve }) {
  const C = useContext(ThemeContext);
  const isGoal = (task.kind || "task") === "goalSession";
  const displayTitle = isGoal ? (task.title || "Task to meet Goal") : task.title;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }} onClick={() => onResolve(task.id, false)}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22, width: "100%", maxWidth: 340 }}>
        <div style={{ ...mono, fontSize: 11, color: C.amber, letterSpacing: 1, marginBottom: 6 }}>● TIME'S UP</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>{displayTitle}</div>
        <div style={{ fontSize: 13, color: C.textDim, marginBottom: 16 }}>You've hit the planned duration. Keep going with extra time?</div>
        <div className="flex flex-col gap-2">
          <button onClick={() => onResolve(task.id, true)} className="flex items-center gap-2 py-2.5 px-3"
            style={{ background: `${C.blue}22`, color: C.blue, border: `1px solid ${C.blue}55`, borderRadius: 10, cursor: "pointer", ...mono, fontSize: 12.5, fontWeight: 600, textAlign: "left" }}>
            <Plus size={15} /> Yes, add extra time
          </button>
          <button onClick={() => onResolve(task.id, false)} className="flex items-center gap-2 py-2.5 px-3"
            style={{ background: C.greenDim, color: C.green, border: `1px solid ${C.green}44`, borderRadius: 10, cursor: "pointer", ...mono, fontSize: 12.5, fontWeight: 600, textAlign: "left" }}>
            <CheckCircle2 size={15} /> No, I'm done
          </button>
        </div>
        <div style={{ ...mono, fontSize: 10.5, color: C.textFaint, marginTop: 12, lineHeight: 1.4 }}>
          You can still start extra time later today from the task's row.
        </div>
      </div>
    </div>
  );
}

// ---------- Reset confirmation ----------
function ResetConfirmModal({ task, onConfirm, onCancel }) {
  const C = useContext(ThemeContext);
  const isGoal = (task.kind || "task") === "goalSession";
  const title = isGoal ? (task.title || "Task to meet Goal") : task.title;
  const hasLoggedTime = (task.elapsedSeconds || 0) > 0;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22, width: "100%", maxWidth: 340 }}>
        <div style={{ fontSize: 14, color: C.textDim, marginBottom: 4 }}>Reset this one?</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>{title}</div>
        <div style={{ fontSize: 13, color: C.textDim, marginBottom: 16, lineHeight: 1.5 }}>
          This puts it back to Scheduled and clears its current timer.
          {hasLoggedTime ? " The time you already logged has been saved to your history and won't be lost." : ""}
        </div>
        <div className="flex gap-2">
          <button onClick={onConfirm} className="flex-1" style={{ background: C.redDim, color: C.red, border: `1px solid ${C.red}44`, borderRadius: 10, cursor: "pointer", ...mono, fontSize: 12.5, fontWeight: 600, padding: "10px 0" }}>RESET IT</button>
          <button onClick={onCancel} className="flex-1" style={{ background: "none", color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 10, cursor: "pointer", ...mono, fontSize: 12.5, fontWeight: 600, padding: "10px 0" }}>CANCEL</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Celebration ----------
function CelebrationModal({ item, onDismiss }) {
  const C = useContext(ThemeContext);
  const isLevel = item.type === "level";
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 110, padding: 20 }} onClick={onDismiss}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: `linear-gradient(160deg, ${C.surface2}, ${C.surface})`, border: `1px solid ${C.cyan}55`, borderRadius: 18, padding: 28, width: "100%", maxWidth: 340, textAlign: "center" }}>
        <div style={{ width: 64, height: 64, borderRadius: 999, background: C.cyanDim, border: `1px solid ${C.cyan}55`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          {isLevel ? <Trophy size={28} color={C.cyan} /> : <Award size={28} color={C.cyan} />}
        </div>
        <div style={{ ...mono, fontSize: 11, color: C.cyan, letterSpacing: 1.5, marginBottom: 6 }}>{isLevel ? "LEVEL UP" : "BADGE UNLOCKED"}</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>{isLevel ? `Level ${item.level.level} · ${item.level.title}` : item.badge.name}</div>
        <div style={{ fontSize: 13, color: C.textDim, marginBottom: 20 }}>{isLevel ? "Your dedication is paying off." : item.badge.desc}</div>
        <button onClick={onDismiss} style={{ background: C.cyanDim, color: C.cyan, border: `1px solid ${C.cyan}55`, borderRadius: 10, cursor: "pointer", ...mono, fontSize: 12.5, fontWeight: 700, padding: "10px 20px" }}>
          NICE!
        </button>
      </div>
    </div>
  );
}

// ---------- Dashboard ----------
function Dashboard({ tasks, goals, now, onGo, onStop, onQuit, onFinishGoal, onRename, onReopen, onDelete, onAddExtra }) {
  const C = useContext(ThemeContext);
  const tKey = todayKey();
  const isGoalKind = (t) => (t.kind || "task") === "goalSession";
  const todays = tasks.filter((t) => t.date === tKey && !isGoalKind(t)).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  const todaysGoalSessions = tasks.filter((t) => t.date === tKey && isGoalKind(t)).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  const running = tasks.find((t) => t.status === "running");
  const upcoming = tasks
    .filter((t) => t.date > tKey && t.status === "pending" && !isGoalKind(t))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .slice(0, 5);

  let goalInfo = null;
  if (running && isGoalKind(running)) {
    const g = goals.find((gg) => gg.id === running.goalId);
    if (g) {
      const sessions = tasks.filter((t) => isGoalKind(t) && t.goalId === g.id);
      const loggedSeconds = sessions.reduce((s, t) => s + (t.liveElapsed || 0), 0);
      const targetSeconds = (g.totalHours || 0) * 3600;
      const pct = targetSeconds > 0 ? Math.round((loggedSeconds / targetSeconds) * 100) : 0;
      goalInfo = { title: g.title, loggedSeconds, targetSeconds, pct };
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {running ? (
        <LiveTimerCard task={running} onStop={onStop} onQuit={onQuit} onFinishGoal={onFinishGoal} onRename={onRename} goalInfo={goalInfo} now={now} />
      ) : (
        <div style={{ background: C.surface, border: `1px dashed ${C.border}`, borderRadius: 14, padding: 24, textAlign: "center", color: C.textFaint }}>
          <Clock size={22} style={{ marginBottom: 8 }} />
          <div style={{ ...mono, fontSize: 13 }}>No task running. Hit Go on something below.</div>
        </div>
      )}

      <div>
        <SectionLabel>Today · {todays.length} task{todays.length !== 1 ? "s" : ""}</SectionLabel>
        {todays.length === 0 ? (
          <EmptyNote text="Nothing scheduled for today yet." />
        ) : (
          <div className="flex flex-col gap-2 mt-2">
            {todays.map((t) => (
              <TaskRow key={t.id} task={t} onGo={onGo} onStop={onStop} onQuit={onQuit} onFinish={onFinishGoal} onRename={onRename} onReopen={onReopen} onDelete={onDelete} onAddExtra={onAddExtra} />
            ))}
          </div>
        )}
      </div>

      {goals.length > 0 && (
        <div>
          <SectionLabel>Goal sessions today · {todaysGoalSessions.length}</SectionLabel>
          {todaysGoalSessions.length === 0 ? (
            <EmptyNote text="No goal sessions scheduled for today." />
          ) : (
            <div className="flex flex-col gap-2 mt-2">
              {todaysGoalSessions.map((t) => (
                <TaskRow key={t.id} task={t} onGo={onGo} onStop={onStop} onQuit={onQuit} onFinish={onFinishGoal} onRename={onRename} onReopen={onReopen} onDelete={onDelete} onAddExtra={onAddExtra} />
              ))}
            </div>
          )}
        </div>
      )}

      {upcoming.length > 0 && (
        <div>
          <SectionLabel>Coming up</SectionLabel>
          <div className="flex flex-col gap-2 mt-2">
            {upcoming.map((t) => (
              <div key={t.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px" }} className="flex items-center justify-between">
                <div>
                  <div style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
                    {t.title}
                    {t.repeat && t.repeat !== "none" && <Repeat size={11} color={C.textFaint} />}
                  </div>
                  <div style={{ ...mono, fontSize: 11, color: C.textFaint }}>{t.date} · {fmtTime12(t.time)}</div>
                </div>
                <span style={{ ...mono, fontSize: 11, color: C.textDim }}>{fmtDurationLabel(t.durationMinutes)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }) {
  const C = useContext(ThemeContext);
  return <div style={{ ...mono, fontSize: 11, letterSpacing: 1.5, color: C.textFaint, textTransform: "uppercase" }}>{children}</div>;
}
function EmptyNote({ text }) {
  const C = useContext(ThemeContext);
  return <div style={{ color: C.textFaint, fontSize: 13, marginTop: 8 }}>{text}</div>;
}

function LiveTimerCard({ task, onStop, onQuit, onFinishGoal, onRename, goalInfo, now }) {
  const C = useContext(ThemeContext);
  const isGoal = (task.kind || "task") === "goalSession";
  const targetSeconds = (task.durationMinutes || 0) * 60;
  const elapsed = task.liveElapsed || 0;
  const remaining = targetSeconds - elapsed;
  const overtime = remaining < 0;
  const pct = Math.min(100, (elapsed / targetSeconds) * 100);
  const dueAt = now + remaining * 1000;

  const extraLabel = task.extraSession;
  const cardColor = extraLabel ? C.blue : overtime ? C.amber : C.cyan;
  const cardBorder = extraLabel ? `${C.blue}55` : overtime ? C.amberDim : C.cyanDim;

  return (
    <div style={{ background: `linear-gradient(160deg, ${C.surface2}, ${C.surface})`, border: `1px solid ${cardBorder}`, borderRadius: 16, padding: 24 }}>
      <div style={{ ...mono, fontSize: 11, color: cardColor, letterSpacing: 1.5, marginBottom: 6 }}>
        {extraLabel ? "● EXTRA TIME" : overtime ? "● TIME'S UP" : "● LIVE"}{isGoal ? " · GOAL SESSION" : ""}
      </div>
      {isGoal ? (
        <input
          value={task.title}
          placeholder="Task to meet Goal"
          onChange={(e) => onRename(task.id, e.target.value)}
          style={{ background: "transparent", border: "none", outline: "none", color: C.text, fontSize: 20, fontWeight: 600, marginBottom: 4, width: "100%", padding: 0 }}
        />
      ) : (
        <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 14 }}>{task.title}</div>
      )}
      {isGoal && goalInfo && (
        <div style={{ ...mono, fontSize: 11.5, color: C.textFaint, marginBottom: 10 }}>
          toward "{goalInfo.title}" · {fmtHours(goalInfo.loggedSeconds)}h / {(goalInfo.targetSeconds / 3600).toFixed(1)}h · {goalInfo.pct}%
        </div>
      )}
      {task.actualStartTime && (
        <div style={{ ...mono, fontSize: 11.5, color: C.textFaint, marginBottom: 10 }}>
          Started {fmtClockTime(task.actualStartTime)} · {overtime ? "was due" : "due"} {fmtClockTime(dueAt)}
        </div>
      )}
      <div style={{ ...mono, fontSize: 44, fontWeight: 700, color: extraLabel ? C.blue : overtime ? C.amber : C.text, lineHeight: 1 }}>
        {overtime ? "+" : ""}{fmtHMS(Math.abs(remaining))}
      </div>
      <div style={{ ...mono, fontSize: 12, color: C.textFaint, marginTop: 4 }}>
        {extraLabel ? "logging extra time beyond the plan" : overtime ? "over planned duration" : `remaining of ${fmtDurationLabel(task.durationMinutes)}`}
      </div>
      <div style={{ height: 6, background: C.border, borderRadius: 999, marginTop: 16, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: extraLabel ? C.blue : overtime ? C.amber : C.cyan, transition: "width .3s" }} />
      </div>
      <div className="flex gap-2 mt-5">
        <ActionBtn color={C.amber} bg={C.amberDim} icon={Pause} label="Stop" onClick={() => onStop(task.id)} />
        {isGoal ? (
          <ActionBtn color={C.green} bg={C.greenDim} icon={CheckCircle2} label="Finish" onClick={() => onFinishGoal(task.id)} />
        ) : (
          <ActionBtn color={C.red} bg={C.redDim} icon={X} label="Quit" onClick={() => onQuit(task.id)} />
        )}
      </div>
    </div>
  );
}

function ActionBtn({ color, bg, icon: Icon, label, onClick }) {
  return (
    <button onClick={onClick} className="flex-1 flex items-center justify-center gap-2 py-2.5"
      style={{ background: bg, color, border: `1px solid ${color}44`, borderRadius: 10, cursor: "pointer", ...mono, fontSize: 12, fontWeight: 600 }}>
      <Icon size={14} /> {label.toUpperCase()}
    </button>
  );
}

function TaskRow({ task, onGo, onStop, onQuit, onFinish, onRename, onReopen, onDelete, onAddExtra }) {
  const C = useContext(ThemeContext);
  const kind = task.kind || "task";
  const isGoalSession = kind === "goalSession";
  const st = task.extraSession ? { label: "Extra time", color: C.blue } : getStatusMeta(task.status, C);
  const elapsedMin = Math.floor((task.liveElapsed || 0) / 60);
  const plannedSeconds = (task.durationMinutes || 0) * 60;
  const overtimeSeconds = Math.max(0, (task.liveElapsed || 0) - plannedSeconds);
  const editable = isGoalSession && (task.status === "pending" || task.status === "running" || task.status === "paused");
  const locked = isPastDate(task.date);

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px" }} className="flex items-center justify-between gap-3">
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: st.color, flexShrink: 0 }} />
          {editable ? (
            <input
              value={task.title}
              placeholder="Task to meet Goal"
              onChange={(e) => onRename && onRename(task.id, e.target.value)}
              style={{ background: "transparent", border: "none", outline: "none", color: C.text, fontSize: 14, flex: 1, minWidth: 0, padding: 0 }}
            />
          ) : (
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {isGoalSession ? (task.title || "Task to meet Goal") : task.title}
            </span>
          )}
          {task.repeat && task.repeat !== "none" && <Repeat size={11} color={C.textFaint} style={{ flexShrink: 0 }} />}
          {task.notifyBeforeMinutes != null && <Bell size={11} color={C.textFaint} style={{ flexShrink: 0 }} />}
        </div>
        <div style={{ ...mono, fontSize: 11, color: C.textFaint, marginTop: 2 }}>
          {fmtTime12(task.time)} · {fmtDurationLabel(task.durationMinutes)}
          {task.status !== "pending" && ` · ${elapsedMin}m logged`}
          {task.status === "quit" && task.quitReason === "interrupted" && (
            (task.liveElapsed || task.elapsedSeconds || 0) >= plannedSeconds ? " · interrupted (full time logged)" : " · interrupted"
          )}
          {task.status === "done" && overtimeSeconds > 0 && ` · +${Math.round(overtimeSeconds / 60)}m extra`}
        </div>
      </div>
      <div className="flex items-center gap-1.5" style={{ flexShrink: 0 }}>
        {locked && (task.status === "pending" || task.status === "paused") && (
          <span style={{ ...mono, fontSize: 10, color: C.textFaint, letterSpacing: 0.5 }}>MISSED</span>
        )}
        {!locked && (task.status === "pending" || task.status === "paused") && (
          <IconBtn color={C.cyan} onClick={() => onGo(task.id)}><Play size={14} /></IconBtn>
        )}
        {task.status === "running" && (
          <IconBtn color={C.amber} onClick={() => onStop(task.id)}><Pause size={14} /></IconBtn>
        )}
        {isGoalSession
          ? (task.status === "running" || task.status === "paused") && (
              <IconBtn color={C.green} onClick={() => onFinish && onFinish(task.id)}><CheckCircle2 size={14} /></IconBtn>
            )
          : (task.status === "running" || task.status === "paused") && (
              <IconBtn color={C.red} onClick={() => onQuit(task.id)}><X size={14} /></IconBtn>
            )}
        {!isGoalSession && task.status === "done" && !locked && (
          <button onClick={() => onAddExtra && onAddExtra(task.id)} style={{ ...resetBtnStyle(C), color: C.blue, borderColor: `${C.blue}55` }}>+ EXTRA</button>
        )}
        {(task.status === "done" || task.status === "quit" || task.status === "finished") && !locked && (
          <button onClick={() => onReopen(task.id)} style={resetBtnStyle(C)}>RESET</button>
        )}
        <IconBtn color={C.textFaint} onClick={() => onDelete(task.id)}><Trash2 size={13} /></IconBtn>
      </div>
    </div>
  );
}

function IconBtn({ color, onClick, children }) {
  return (
    <button onClick={onClick} style={{ color, background: "transparent", border: "none", cursor: "pointer", padding: 6, display: "flex" }}>
      {children}
    </button>
  );
}

// ---------- Add Tasks ----------
function AddTasks({ onAdd }) {
  const C = useContext(ThemeContext);
  const blankRow = () => ({
    id: uid(), title: "", date: todayKey(), time: "09:00", durationMinutes: 25,
    repeat: "none", repeatLength: "1w", notifyBeforeMinutes: "none",
  });
  const [rows, setRows] = useState([blankRow()]);
  const [justAdded, setJustAdded] = useState(0);

  const updateRow = (id, patch) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () => setRows((prev) => [...prev, blankRow()]);
  const removeRow = (id) => setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));

  const submit = () => {
    const count = onAdd(rows);
    if (count > 0) {
      setJustAdded(count);
      setRows([blankRow()]);
      setTimeout(() => setJustAdded(0), 3000);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionLabel>Schedule new tasks</SectionLabel>
      <div style={{ color: C.textFaint, fontSize: 13, marginTop: -6 }}>
        One-off or routine — fill in as many rows as you like, up to a month out.
        Anything that'll take longer than a week belongs in the <b style={{ color: C.textDim }}>Goals</b> tab instead.
      </div>

      <div className="flex flex-col gap-3">
        {rows.map((r) => (
          <div key={r.id} style={cardStyle(C)} className="flex flex-col gap-2.5">
            <input placeholder="Task name…" value={r.title} onChange={(e) => updateRow(r.id, { title: e.target.value })} style={inputStyle(C)} />

            <div className="flex gap-2 flex-wrap">
              <LabeledField label="Date">
                <input type="date" value={r.date} min={todayKey()} max={maxDateKey()} onChange={(e) => updateRow(r.id, { date: e.target.value })} style={inputStyle(C)} />
              </LabeledField>
              <LabeledField label="Time">
                <input type="time" value={r.time} onChange={(e) => updateRow(r.id, { time: e.target.value })} style={inputStyle(C)} />
              </LabeledField>
              <LabeledField label="Duration (min)">
                <input type="number" min={5} step={5} value={r.durationMinutes} onChange={(e) => updateRow(r.id, { durationMinutes: e.target.value })} style={{ ...inputStyle(C), width: 76 }} />
              </LabeledField>
            </div>

            <div className="flex gap-2 flex-wrap items-end">
              <LabeledField label="Type">
                <select value={r.repeat} onChange={(e) => updateRow(r.id, { repeat: e.target.value })} style={inputStyle(C)}>
                  <option value="none">One-off</option>
                  <option value="daily">Routine · Daily</option>
                  <option value="weekdays">Routine · Weekdays</option>
                  <option value="weekly">Routine · Weekly</option>
                </select>
              </LabeledField>
              {r.repeat !== "none" && (
                <LabeledField label="Repeat for">
                  <select value={r.repeatLength} onChange={(e) => updateRow(r.id, { repeatLength: e.target.value })} style={inputStyle(C)}>
                    <option value="1w">1 week</option>
                    <option value="2w">2 weeks</option>
                    <option value="1m">1 month</option>
                  </select>
                </LabeledField>
              )}
              <LabeledField label="Notify before">
                <select value={r.notifyBeforeMinutes} onChange={(e) => updateRow(r.id, { notifyBeforeMinutes: e.target.value })} style={inputStyle(C)}>
                  <option value="none">Off</option>
                  <option value="0">At start time</option>
                  <option value="5">5 min before</option>
                  <option value="10">10 min before</option>
                  <option value="15">15 min before</option>
                  <option value="30">30 min before</option>
                  <option value="60">1 hour before</option>
                </select>
              </LabeledField>
              <button onClick={() => removeRow(r.id)} style={{ color: C.textFaint, background: "none", border: "none", cursor: "pointer", padding: "6px", marginLeft: "auto" }}>
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <button onClick={addRow} style={dashedButtonStyle(C)}><Plus size={14} /> ADD ANOTHER ROW</button>
      <button onClick={submit} className="flex items-center justify-center gap-2 py-3"
        style={{ background: C.cyanDim, color: C.cyan, border: `1px solid ${C.cyan}55`, borderRadius: 10, cursor: "pointer", ...mono, fontSize: 13, fontWeight: 700 }}>
        <ListPlus size={16} /> ADD TO SCHEDULE
      </button>
      {justAdded > 0 && <div style={{ color: C.green, fontSize: 12, textAlign: "center", ...mono }}>Added {justAdded} task{justAdded !== 1 ? "s" : ""} ✓</div>}
    </div>
  );
}

function LabeledField({ label, children }) {
  const C = useContext(ThemeContext);
  return (
    <div className="flex flex-col gap-1">
      <span style={{ ...mono, fontSize: 9, color: C.textFaint, letterSpacing: 1, textTransform: "uppercase" }}>{label}</span>
      {children}
    </div>
  );
}

// ---------- Goals ----------
function GoalsView({ goals, tasks, onCreateGoal, onAddSessions, onGo, onStop, onFinish, onRename, onReopen, onDeleteGoal, onDeleteSession }) {
  const C = useContext(ThemeContext);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", startDate: todayKey(), endDate: "", totalHours: "" });
  const [expandedGoal, setExpandedGoal] = useState(null);

  const canCreate = form.title.trim() && form.startDate && form.endDate && form.endDate > form.startDate && Number(form.totalHours) > 0;

  const submitGoal = () => {
    const id = onCreateGoal({ title: form.title.trim(), startDate: form.startDate, endDate: form.endDate, totalHours: Number(form.totalHours) });
    setForm({ title: "", startDate: todayKey(), endDate: "", totalHours: "" });
    setCreating(false);
    setExpandedGoal(id);
  };

  return (
    <div className="flex flex-col gap-5">
      <SectionLabel>Goals</SectionLabel>
      <div style={{ color: C.textFaint, fontSize: 13, marginTop: -8 }}>For anything that'll take longer than a week. Set a total hour target, then schedule the sessions that work toward it.</div>

      {!creating ? (
        <button onClick={() => setCreating(true)} style={dashedButtonStyle(C)}><Plus size={14} /> NEW GOAL</button>
      ) : (
        <div style={cardStyle(C)} className="flex flex-col gap-2.5">
          <input placeholder="Goal name… e.g. Learn Spanish" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={inputStyle(C)} />
          <div className="flex gap-2 flex-wrap">
            <LabeledField label="Start"><input type="date" min={todayKey()} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} style={inputStyle(C)} /></LabeledField>
            <LabeledField label="End"><input type="date" min={form.startDate} max={maxGoalDateKey()} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} style={inputStyle(C)} /></LabeledField>
            <LabeledField label="Target hours"><input type="number" min={1} step={0.5} value={form.totalHours} onChange={(e) => setForm({ ...form, totalHours: e.target.value })} style={{ ...inputStyle(C), width: 84 }} /></LabeledField>
          </div>
          <div className="flex gap-2">
            <button disabled={!canCreate} onClick={submitGoal} style={{ ...primaryBtnStyle(C), opacity: canCreate ? 1 : 0.4, cursor: canCreate ? "pointer" : "default" }}>CREATE GOAL</button>
            <button onClick={() => setCreating(false)} style={ghostBtnStyle(C)}>CANCEL</button>
          </div>
        </div>
      )}

      {goals.length === 0 && !creating && <EmptyNote text="No goals yet." />}

      <div className="flex flex-col gap-3">
        {goals.map((g) => {
          const sessions = tasks.filter((t) => (t.kind || "task") === "goalSession" && t.goalId === g.id);
          const loggedSeconds = sessions.reduce((s, t) => s + (t.liveElapsed || 0), 0);
          const targetSeconds = (g.totalHours || 0) * 3600;
          const pct = targetSeconds > 0 ? Math.min(999, Math.round((loggedSeconds / targetSeconds) * 100)) : 0;
          const isExpanded = expandedGoal === g.id;
          const listedSessions = sessions.slice().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

          return (
            <div key={g.id} style={cardStyle(C)}>
              <div className="flex items-center justify-between">
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{g.title}</div>
                  <div style={{ ...mono, fontSize: 11, color: C.textFaint }}>{g.startDate} → {g.endDate}</div>
                </div>
                <IconBtn color={C.textFaint} onClick={() => onDeleteGoal(g.id)}><Trash2 size={14} /></IconBtn>
              </div>
              <div style={{ height: 6, background: C.border, borderRadius: 999, overflow: "hidden", marginTop: 10 }}>
                <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, background: C.cyan }} />
              </div>
              <div style={{ ...mono, fontSize: 11, color: C.textDim, marginTop: 6 }}>{fmtHours(loggedSeconds)}h / {g.totalHours}h logged · {pct}%</div>

              <button onClick={() => setExpandedGoal(isExpanded ? null : g.id)} style={{ ...ghostBtnStyle(C), marginTop: 12 }}>
                {isExpanded ? "HIDE SESSIONS" : "MANAGE SESSIONS"}
              </button>

              {isExpanded && (
                <div className="flex flex-col gap-3 mt-3">
                  <GoalSessionForm goal={g} onAdd={(rows) => onAddSessions(g.id, rows)} />
                  {listedSessions.length === 0 ? (
                    <EmptyNote text="No sessions scheduled yet." />
                  ) : (
                    <div className="flex flex-col gap-2">
                      {listedSessions.map((t) => (
                        <TaskRow key={t.id} task={t} onGo={onGo} onStop={onStop} onFinish={onFinish} onRename={onRename} onReopen={onReopen} onDelete={onDeleteSession} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GoalSessionForm({ goal, onAdd }) {
  const C = useContext(ThemeContext);
  const blankRow = () => ({ id: uid(), date: goal.startDate, time: "09:00", durationMinutes: 30, repeat: "none", repeatLength: "1w", notifyBeforeMinutes: "none" });
  const [rows, setRows] = useState([blankRow()]);
  const [added, setAdded] = useState(0);

  const updateRow = (id, patch) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () => setRows((prev) => [...prev, blankRow()]);
  const removeRow = (id) => setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  const submit = () => {
    const count = onAdd(rows);
    if (count > 0) {
      setAdded(count);
      setRows([blankRow()]);
      setTimeout(() => setAdded(0), 3000);
    }
  };

  return (
    <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }} className="flex flex-col gap-2.5">
      <div style={{ ...mono, fontSize: 10, color: C.textFaint, letterSpacing: 1 }}>SESSION TIMES WITHIN THIS GOAL</div>
      {rows.map((r) => (
        <div key={r.id} className="flex gap-2 flex-wrap items-end">
          <LabeledField label="Date"><input type="date" min={goal.startDate} max={goal.endDate} value={r.date} onChange={(e) => updateRow(r.id, { date: e.target.value })} style={inputStyle(C)} /></LabeledField>
          <LabeledField label="Time"><input type="time" value={r.time} onChange={(e) => updateRow(r.id, { time: e.target.value })} style={inputStyle(C)} /></LabeledField>
          <LabeledField label="Duration (min)"><input type="number" min={5} step={5} value={r.durationMinutes} onChange={(e) => updateRow(r.id, { durationMinutes: e.target.value })} style={{ ...inputStyle(C), width: 70 }} /></LabeledField>
          <LabeledField label="Type">
            <select value={r.repeat} onChange={(e) => updateRow(r.id, { repeat: e.target.value })} style={inputStyle(C)}>
              <option value="none">One-off</option>
              <option value="daily">Daily</option>
              <option value="weekdays">Weekdays</option>
              <option value="weekly">Weekly</option>
            </select>
          </LabeledField>
          {r.repeat !== "none" && (
            <LabeledField label="Repeat for">
              <select value={r.repeatLength} onChange={(e) => updateRow(r.id, { repeatLength: e.target.value })} style={inputStyle(C)}>
                <option value="1w">1 week</option><option value="2w">2 weeks</option><option value="1m">1 month</option>
              </select>
            </LabeledField>
          )}
          <LabeledField label="Notify">
            <select value={r.notifyBeforeMinutes} onChange={(e) => updateRow(r.id, { notifyBeforeMinutes: e.target.value })} style={inputStyle(C)}>
              <option value="none">Off</option><option value="0">At start</option><option value="5">5m</option><option value="10">10m</option><option value="15">15m</option><option value="30">30m</option><option value="60">1h</option>
            </select>
          </LabeledField>
          <IconBtn color={C.textFaint} onClick={() => removeRow(r.id)}><Trash2 size={13} /></IconBtn>
        </div>
      ))}
      <div className="flex gap-2">
        <button onClick={addRow} style={ghostBtnStyle(C)}>+ ROW</button>
        <button onClick={submit} style={primaryBtnStyle(C)}>ADD SESSIONS</button>
      </div>
      {added > 0 && <div style={{ color: C.green, fontSize: 11, ...mono }}>Added {added} session{added !== 1 ? "s" : ""} ✓</div>}
    </div>
  );
}

// ---------- Calendar ----------
function buildDayColors(tasks, goals) {
  const taskByDate = {};
  const goalSessionsByDate = {};
  tasks.forEach((t) => {
    const kind = t.kind || "task";
    if (kind === "task") (taskByDate[t.date] = taskByDate[t.date] || []).push(t);
    else if (kind === "goalSession") (goalSessionsByDate[t.date] = goalSessionsByDate[t.date] || []).push(t);
  });

  const dayTaskColor = {};
  Object.keys(taskByDate).forEach((date) => {
    const list = taskByDate[date];
    const total = list.length;
    const completed = list.filter(isTaskComplete).length;
    let pct;
    if (completed < total) {
      pct = (completed / total) * 100;
    } else {
      const ratios = list.map((t) => {
        const planned = (t.durationMinutes || 0) * 60;
        const over = Math.max(0, (t.liveElapsed || t.elapsedSeconds || 0) - planned);
        return planned > 0 ? Math.min(1, over / planned) : 0;
      });
      const avgOver = ratios.reduce((a, b) => a + b, 0) / ratios.length;
      pct = 100 + avgOver * 50;
    }
    dayTaskColor[date] = getGradientColor(pct);
  });

  const dayGoalColor = {};
  Object.keys(goalSessionsByDate).forEach((date) => {
    const goalIds = [...new Set(goalSessionsByDate[date].map((s) => s.goalId))];
    const pcts = goalIds.map((gid) => {
      const g = goals.find((gg) => gg.id === gid);
      if (!g) return 0;
      const targetSeconds = (g.totalHours || 0) * 3600;
      if (targetSeconds <= 0) return 0;
      const loggedSeconds = tasks
        .filter((t) => (t.kind || "task") === "goalSession" && t.goalId === gid)
        .reduce((s, t) => s + (t.liveElapsed || t.elapsedSeconds || 0), 0);
      return (loggedSeconds / targetSeconds) * 100;
    });
    const avgPct = pcts.reduce((a, b) => a + b, 0) / pcts.length;
    dayGoalColor[date] = getGradientColor(avgPct);
  });

  return { dayTaskColor, dayGoalColor };
}

function ToggleChip({ active, label, dotColor, onClick }) {
  const C = useContext(ThemeContext);
  return (
    <button onClick={onClick} className="flex items-center gap-1.5" style={{
      ...mono, fontSize: 11, padding: "6px 12px", borderRadius: 999,
      border: `1px solid ${active ? dotColor : C.border}`,
      background: active ? `${dotColor}22` : "transparent",
      color: active ? dotColor : C.textFaint, cursor: "pointer",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: active ? dotColor : C.textFaint }} />
      {label}
    </button>
  );
}

function CalendarView({ tasks, goals, onGo, onStop, onQuit, onFinish, onRename, onReopen, onDelete, onAddExtra }) {
  const C = useContext(ThemeContext);
  const [viewDate, setViewDate] = useState(new Date());
  const [selected, setSelected] = useState(todayKey());
  const [showTasks, setShowTasks] = useState(true);
  const [showGoals, setShowGoals] = useState(true);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const { dayTaskColor, dayGoalColor } = buildDayColors(tasks, goals);

  const selectedTasks = tasks.filter((t) => t.date === selected).sort((a, b) => (a.time || "").localeCompare(b.time || ""));

  const changeMonth = (delta) => setViewDate(new Date(year, month + delta, 1));
  const weekdayLabels = ["S", "M", "T", "W", "T", "F", "S"];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <button onClick={() => changeMonth(-1)} style={navBtnStyle(C)}><ChevronLeft size={16} /></button>
        <span style={{ ...mono, fontSize: 13, letterSpacing: 1 }}>
          {viewDate.toLocaleDateString(undefined, { month: "long", year: "numeric" }).toUpperCase()}
        </span>
        <button onClick={() => changeMonth(1)} style={navBtnStyle(C)}><ChevronRight size={16} /></button>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <ToggleChip active={showTasks} label="Tasks" dotColor={C.cyan} onClick={() => setShowTasks((v) => !v)} />
          <ToggleChip active={showGoals} label="Goals" dotColor={C.blue} onClick={() => setShowGoals((v) => !v)} />
        </div>
        <div style={{ ...mono, fontSize: 9.5, color: C.textFaint }}>RED → BEHIND · GREEN → ON TRACK · BLUE → EXTRA TIME</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {weekdayLabels.map((w, i) => <div key={i} style={{ textAlign: "center", ...mono, fontSize: 10, color: C.textFaint }}>{w}</div>)}
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const key = dateKey(new Date(year, month, d));
          const isToday = key === todayKey();
          const isSelected = key === selected;
          const tColor = showTasks ? dayTaskColor[key] : null;
          const gColor = showGoals ? dayGoalColor[key] : null;
          return (
            <button key={i} onClick={() => setSelected(key)} style={{
              aspectRatio: "1", background: isSelected ? C.cyanDim : C.surface,
              border: `1px solid ${isSelected ? C.cyan : isToday ? C.textFaint : C.border}`,
              borderRadius: 8, color: isSelected ? C.cyan : C.text, cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, padding: 3,
            }}>
              <span style={{ fontSize: 12, ...mono }}>{d}</span>
              <div style={{ display: "flex", width: "100%", height: 4, borderRadius: 2, overflow: "hidden" }}>
                {tColor && <div style={{ flex: 1, background: tColor }} />}
                {gColor && <div style={{ flex: 1, background: gColor }} />}
              </div>
            </button>
          );
        })}
      </div>

      <div>
        <SectionLabel>{selected === todayKey() ? "Today" : selected} · {selectedTasks.length} task{selectedTasks.length !== 1 ? "s" : ""}</SectionLabel>
        {selectedTasks.length === 0 ? (
          <EmptyNote text="Nothing scheduled. Add a task or goal session for this day." />
        ) : (
          <div className="flex flex-col gap-2 mt-2">
            {selectedTasks.map((t) => (
              <TaskRow key={t.id} task={t} onGo={onGo} onStop={onStop} onQuit={onQuit} onFinish={onFinish} onRename={onRename} onReopen={onReopen} onDelete={onDelete} onAddExtra={onAddExtra} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function navBtnStyle(C) { return { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: "6px 10px", cursor: "pointer" }; }

// ---------- Tracker ----------
function TrackerView({ tasks, goals, history }) {
  const C = useContext(ThemeContext);
  const [timeGranularity, setTimeGranularity] = useState("window");
  const [patternView, setPatternView] = useState("list");
  const taskItems = tasks.filter((t) => (t.kind || "task") === "task");
  const taskHistory = history.filter((h) => (h.kind || "task") === "task");

  const today = new Date();
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay());
  const twoWeeksStart = new Date(today.getTime() - 13 * 86400000);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const todayStr = todayKey();

  const weekStats = periodStats(taskItems, taskHistory, dateKey(weekStart), todayStr);
  const twoWeekStats = periodStats(taskItems, taskHistory, dateKey(twoWeeksStart), todayStr);
  const monthStats = periodStats(taskItems, taskHistory, dateKey(monthStart), todayStr);
  const patterns = buildPatterns(taskItems);
  const recentSessions = [...history].sort((a, b) => b.loggedAt - a.loggedAt).slice(0, 8);

  const goalsSummary = goals.map((g) => {
    const segs = history.filter((h) => h.kind === "goalSession" && h.goalId === g.id);
    const archived = segs.reduce((s, h) => s + h.elapsedSeconds, 0);
    const liveSessions = tasks.filter((t) => (t.kind || "task") === "goalSession" && t.goalId === g.id);
    const unsettled = liveSessions.reduce((s, t) => s + Math.max(0, (t.liveElapsed || t.elapsedSeconds || 0) - (t.lastArchivedElapsed || 0)), 0);
    const loggedSeconds = archived + unsettled;
    const targetSeconds = (g.totalHours || 0) * 3600;
    const pct = targetSeconds > 0 ? Math.round((loggedSeconds / targetSeconds) * 100) : 0;
    return { id: g.id, title: g.title, loggedSeconds, targetSeconds, pct };
  });

  return (
    <div className="flex flex-col gap-6">
      <SectionLabel>Your tracker</SectionLabel>

      <div className="flex gap-2 flex-wrap">
        <StatCard label="This week" stats={weekStats} />
        <StatCard label="Last 2 weeks" stats={twoWeekStats} />
        <StatCard label="This month" stats={monthStats} />
      </div>

      {goals.length > 0 && (
        <div>
          <SectionLabel>Goals progress</SectionLabel>
          <div className="flex flex-col gap-2 mt-2">
            {goalsSummary.map((g) => (
              <div key={g.id} style={cardStyle(C)}>
                <div className="flex items-center justify-between">
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{g.title}</div>
                  <span style={{ ...mono, fontSize: 12, color: getGradientColor(g.pct) }}>{g.pct}%</span>
                </div>
                <div style={{ height: 5, background: C.border, borderRadius: 999, overflow: "hidden", marginTop: 8 }}>
                  <div style={{ height: "100%", width: `${Math.min(100, g.pct)}%`, background: getGradientColor(g.pct) }} />
                </div>
                <div style={{ ...mono, fontSize: 10.5, color: C.textFaint, marginTop: 6 }}>{fmtHours(g.loggedSeconds)}h / {(g.targetSeconds / 3600).toFixed(1)}h</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <SectionLabel>Time distribution</SectionLabel>
        <div style={{ ...cardStyle(C), marginTop: 8 }}>
          <TimeDistributionPie history={history} />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <SectionLabel>Patterns</SectionLabel>
          {patterns.enough && (
            <div className="flex gap-1.5">
              <ToggleChip active={patternView === "list"} label="List" dotColor={C.cyan} onClick={() => setPatternView("list")} />
              <ToggleChip active={patternView === "chart"} label="Charts" dotColor={C.cyan} onClick={() => setPatternView("chart")} />
            </div>
          )}
        </div>
        {!patterns.enough ? (
          <EmptyNote text={`Still collecting data — log a few more tasks (${patterns.totalSamples}/${MIN_OVERALL_SAMPLES}) and I'll start surfacing your patterns.`} />
        ) : patternView === "list" ? (
          <div className="flex flex-col gap-4 mt-2">
            <RankingList title="By day of week" items={patterns.weekdayRanking} />
            <RankingList
              header={
                <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                  <div style={{ ...mono, fontSize: 11, color: C.textFaint, letterSpacing: 1, textTransform: "uppercase" }}>By time of day</div>
                  <div className="flex gap-1.5">
                    <ToggleChip active={timeGranularity === "window"} label="Windows" dotColor={C.cyan} onClick={() => setTimeGranularity("window")} />
                    <ToggleChip active={timeGranularity === "hour"} label="By hour" dotColor={C.cyan} onClick={() => setTimeGranularity("hour")} />
                  </div>
                </div>
              }
              items={timeGranularity === "hour" ? patterns.hourRanking : patterns.timeRanking}
            />
            <RankingList title="By month" items={patterns.monthRanking} />
          </div>
        ) : (
          <div className="flex flex-col gap-5 mt-2">
            <div>
              <div style={{ ...mono, fontSize: 11, color: C.textFaint, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>By day of week</div>
              <div style={cardStyle(C)}><PatternBarChart items={patterns.weekdayRanking} /></div>
            </div>
            <div>
              <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                <div style={{ ...mono, fontSize: 11, color: C.textFaint, letterSpacing: 1, textTransform: "uppercase" }}>By time of day</div>
                <div className="flex gap-1.5">
                  <ToggleChip active={timeGranularity === "window"} label="Windows" dotColor={C.cyan} onClick={() => setTimeGranularity("window")} />
                  <ToggleChip active={timeGranularity === "hour"} label="By hour" dotColor={C.cyan} onClick={() => setTimeGranularity("hour")} />
                </div>
              </div>
              <div style={cardStyle(C)}><PatternBarChart items={timeGranularity === "hour" ? patterns.hourRanking : patterns.timeRanking} /></div>
            </div>
            <div>
              <div style={{ ...mono, fontSize: 11, color: C.textFaint, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>By month</div>
              <div style={cardStyle(C)}><PatternBarChart items={patterns.monthRanking} /></div>
            </div>
          </div>
        )}
      </div>

      <div>
        <SectionLabel>Recent activity</SectionLabel>
        {recentSessions.length === 0 ? (
          <EmptyNote text="Nothing logged yet." />
        ) : (
          <div className="flex flex-col gap-1.5 mt-2">
            {recentSessions.map((h) => {
              const st = getStatusMeta(h.status, C);
              return (
                <div key={h.id} style={{ ...cardStyle(C), padding: "8px 12px" }} className="flex items-center justify-between gap-3">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: 999, background: st.color, flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {h.title || (h.kind === "goalSession" ? "Task to meet Goal" : "Untitled task")}
                      </span>
                    </div>
                    <div style={{ ...mono, fontSize: 10.5, color: C.textFaint, marginTop: 2 }}>
                      {h.date} · {fmtTime12(h.time)} · {Math.round(h.elapsedSeconds / 60)}m logged
                      {h.quitReason === "interrupted" ? " · interrupted" : ""}
                    </div>
                  </div>
                  <span style={{ ...mono, fontSize: 9.5, color: st.color, textTransform: "uppercase", flexShrink: 0 }}>{st.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Rewards ----------
function techniqueSlotsInOrder(tree, techniqueChoices) {
  return [2, 3, 4, 5, 6, 7, 8, 9, 10].map((lvl) => {
    if (tree.auto[lvl]) return { level: lvl, name: tree.auto[lvl][0], desc: tree.auto[lvl][1], isBranch: false, isCapstone: false };
    if (tree.branch[lvl]) {
      const chosenName = techniqueChoices[lvl];
      const chosen = chosenName ? tree.branch[lvl].find((o) => o[0] === chosenName) : null;
      return { level: lvl, name: chosen ? chosen[0] : null, desc: chosen ? chosen[1] : "Choose your path at this level", isBranch: true, chosen: !!chosen };
    }
    return { level: lvl, name: tree.capstone[0], desc: tree.capstone[1], isBranch: false, isCapstone: true };
  });
}

function TechniqueRow({ slot, currentLevel }) {
  const C = useContext(ThemeContext);
  const locked = currentLevel < slot.level;
  const awaitingChoice = slot.isBranch && !locked && !slot.chosen;
  return (
    <div style={{ ...cardStyle(C), padding: "10px 14px", opacity: locked ? 0.55 : 1, borderColor: awaitingChoice ? C.cyan : C.border }} className="flex items-center justify-between gap-3">
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: locked ? C.textDim : C.text }}>
          {locked ? `Locked` : awaitingChoice ? "New technique ready" : slot.name}
        </div>
        <div style={{ ...mono, fontSize: 10.5, color: C.textFaint, marginTop: 2 }}>{locked ? `Unlocks at Level ${slot.level}` : slot.desc}</div>
      </div>
      {locked ? <Lock size={13} color={C.textFaint} /> : slot.isCapstone ? <Award size={14} color={C.cyan} /> : null}
    </div>
  );
}

function AuraQuizModal({ onComplete, onCancel }) {
  const C = useContext(ThemeContext);
  const [step, setStep] = useState(0);
  const [scores, setScores] = useState({});
  const q = AURA_QUIZ[step];
  const choose = (type) => {
    const next = { ...scores, [type]: (scores[type] || 0) + 1 };
    if (step + 1 >= AURA_QUIZ.length) {
      let best = null, bestScore = -1;
      Object.keys(AURA_TYPES).forEach((t) => { const s = next[t] || 0; if (s > bestScore) { bestScore = s; best = t; } });
      onComplete(best);
    } else {
      setScores(next);
      setStep(step + 1);
    }
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 110, padding: 20 }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, width: "100%", maxWidth: 360 }}>
        <div style={{ ...mono, fontSize: 10, color: C.textFaint, letterSpacing: 1 }}>QUESTION {step + 1} OF {AURA_QUIZ.length}</div>
        <div className="flex gap-1" style={{ marginTop: 10, marginBottom: 18 }}>
          {AURA_QUIZ.map((_, i) => <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? C.cyan : C.border }} />)}
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>{q.q}</div>
        <div className="flex flex-col gap-2">
          {q.opts.map(([label, type]) => (
            <button key={label} onClick={() => choose(type)} style={{ textAlign: "left", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, padding: "10px 14px", cursor: "pointer", fontSize: 13 }}>
              {label}
            </button>
          ))}
        </div>
        <button onClick={onCancel} style={{ marginTop: 16, background: "none", border: "none", color: C.textFaint, cursor: "pointer", fontSize: 12, width: "100%", ...mono }}>CANCEL</button>
      </div>
    </div>
  );
}

function TechniqueBranchModal({ level, options, onChoose, onCancel }) {
  const C = useContext(ThemeContext);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 110, padding: 20 }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, width: "100%", maxWidth: 360 }}>
        <div style={{ ...mono, fontSize: 10, color: C.cyan, letterSpacing: 1 }}>LEVEL {level} · NEW TECHNIQUE</div>
        <div style={{ fontSize: 15, fontWeight: 600, margin: "8px 0 16px" }}>Choose your path</div>
        <div className="flex flex-col gap-2">
          {options.map(([name, desc]) => (
            <button key={name} onClick={() => onChoose(name)} style={{ textAlign: "left", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", cursor: "pointer" }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: C.text }}>{name}</div>
              <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 3 }}>{desc}</div>
            </button>
          ))}
        </div>
        <button onClick={onCancel} style={{ marginTop: 16, background: "none", border: "none", color: C.textFaint, cursor: "pointer", fontSize: 12, width: "100%", ...mono }}>DECIDE LATER</button>
      </div>
    </div>
  );
}

function SpecializationModal({ suggested, onChoose, onCancel }) {
  const C = useContext(ThemeContext);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 110, padding: 20 }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, width: "100%", maxWidth: 360 }}>
        <div style={{ ...mono, fontSize: 10, color: C.textFaint, letterSpacing: 1 }}>CHOOSE YOUR SPECIALIZATION</div>
        <div style={{ fontSize: 12.5, color: C.textDim, margin: "8px 0 16px" }}>
          Based on how you've been using the app, we'd suggest <b style={{ color: C.text }}>{SPECIALIZATIONS.find((s) => s.id === suggested)?.name}</b> — but it's your call.
        </div>
        <div className="flex flex-col gap-2">
          {SPECIALIZATIONS.map((s) => (
            <button key={s.id} onClick={() => onChoose(s.id)} style={{ textAlign: "left", background: C.surface2, border: `1px solid ${s.id === suggested ? C.cyan : C.border}`, borderRadius: 10, padding: "12px 14px", cursor: "pointer" }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: C.text }}>
                {s.name}{s.id === suggested && <span style={{ ...mono, fontSize: 9, color: C.cyan, marginLeft: 6 }}>SUGGESTED</span>}
              </div>
              <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 3 }}>{s.blurb}</div>
            </button>
          ))}
        </div>
        <button onClick={onCancel} style={{ marginTop: 16, background: "none", border: "none", color: C.textFaint, cursor: "pointer", fontSize: 12, width: "100%", ...mono }}>CANCEL</button>
      </div>
    </div>
  );
}

function CompanionPickerModal({ current, onChoose, onCancel }) {
  const C = useContext(ThemeContext);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 110, padding: 20 }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, width: "100%", maxWidth: 360 }}>
        <div style={{ ...mono, fontSize: 10, color: C.textFaint, letterSpacing: 1 }}>WHOSE STORY WILL YOU FOLLOW?</div>
        <div className="flex flex-col gap-2" style={{ marginTop: 14, maxHeight: 400, overflowY: "auto" }}>
          {COMPANIONS.map((cm) => (
            <button key={cm.id} onClick={() => onChoose(cm.id)} style={{ textAlign: "left", background: C.surface2, border: `1px solid ${cm.id === current ? C.cyan : C.border}`, borderRadius: 10, padding: "12px 14px", cursor: "pointer" }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: C.text }}>{cm.name} · <span style={{ fontWeight: 400, color: C.textDim }}>{cm.arc}</span></div>
              <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 3 }}>{cm.blurb}</div>
            </button>
          ))}
        </div>
        <button onClick={onCancel} style={{ marginTop: 16, background: "none", border: "none", color: C.textFaint, cursor: "pointer", fontSize: 12, width: "100%", ...mono }}>CANCEL</button>
      </div>
    </div>
  );
}

function RewardsView({ tasks, goals, history, auraType, onSetAuraType, specializationPath, onSetSpecialization, companionId, onSetCompanion, techniqueChoices, onSetTechniqueChoice }) {
  const C = useContext(ThemeContext);
  const [quizOpen, setQuizOpen] = useState(false);
  const [branchModalLevel, setBranchModalLevel] = useState(null);
  const [specModalOpen, setSpecModalOpen] = useState(false);
  const [companionPickerOpen, setCompanionPickerOpen] = useState(false);

  const xp = calcXP(tasks, history);
  const levelInfo = getLevelInfo(xp);
  const streaks = calcStreaks(tasks);
  const badgeCtx = buildBadgeContext(tasks, goals, history, streaks);
  const unlockedBadges = BADGES.filter((b) => b.check(badgeCtx));

  const tree = auraType ? TECHNIQUE_TREES[auraType] : null;
  const slots = tree ? techniqueSlotsInOrder(tree, techniqueChoices) : [];
  const pendingBranch = slots.find((s) => s.isBranch && !s.chosen && levelInfo.current.level >= s.level);

  const suggestedSpec = suggestSpecialization(badgeCtx, streaks);
  const auraUnlocked = unlockedBadges.length >= 2;
  const companionUnlocked = levelInfo.current.level >= 5;
  const currentSpec = specializationPath ? SPECIALIZATIONS.find((s) => s.id === specializationPath) : null;
  const companion = companionId ? COMPANIONS.find((c) => c.id === companionId) : null;
  const chapterIndex = Math.min(Math.max(0, unlockedBadges.length - 1), CHAPTERS.length - 1);
  const currentChapter = CHAPTERS[chapterIndex];

  return (
    <div className="flex flex-col gap-6">
      <SectionLabel>Your journey</SectionLabel>

      <div style={cardStyle(C)}>
        <div className="flex items-center justify-between">
          <div>
            <div style={{ ...mono, fontSize: 10, color: C.textFaint, letterSpacing: 1, textTransform: "uppercase" }}>Level {levelInfo.current.level}</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>{levelInfo.current.title}</div>
          </div>
          <div style={{ width: 48, height: 48, borderRadius: 999, background: C.cyanDim, border: `1px solid ${C.cyan}55`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Trophy size={22} color={C.cyan} />
          </div>
        </div>
        <div style={{ height: 8, background: C.border, borderRadius: 999, overflow: "hidden", marginTop: 14 }}>
          <div style={{ height: "100%", width: `${levelInfo.pct}%`, background: C.cyan, transition: "width .3s" }} />
        </div>
        <div style={{ ...mono, fontSize: 11, color: C.textFaint, marginTop: 6 }}>
          {levelInfo.next ? `${levelInfo.xp} / ${levelInfo.next.xp} XP · ${levelInfo.next.title} next` : `${levelInfo.xp} XP · max level reached`}
        </div>
      </div>

      <div className="flex gap-2">
        <div style={{ ...cardStyle(C), flex: 1 }}>
          <div className="flex items-center gap-2">
            <Flame size={16} color={streaks.current > 0 ? C.amber : C.textFaint} />
            <span style={{ ...mono, fontSize: 10, color: C.textFaint, letterSpacing: 1, textTransform: "uppercase" }}>Current streak</span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, ...mono, color: streaks.current > 0 ? C.amber : C.text }}>{streaks.current}d</div>
          <div style={{ ...mono, fontSize: 10.5, color: C.textFaint, marginTop: 2 }}>{streaks.todayDone ? "today counted ✓" : "complete something today"}</div>
        </div>
        <div style={{ ...cardStyle(C), flex: 1 }}>
          <div className="flex items-center gap-2">
            <Flame size={16} color={C.textFaint} />
            <span style={{ ...mono, fontSize: 10, color: C.textFaint, letterSpacing: 1, textTransform: "uppercase" }}>Longest streak</span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, ...mono }}>{streaks.longest}d</div>
          <div style={{ ...mono, fontSize: 10.5, color: C.textFaint, marginTop: 2 }}>personal best</div>
        </div>
      </div>

      <div style={cardStyle(C)}>
        {auraType ? (
          <>
            <div className="flex items-center justify-between">
              <div>
                <div style={{ ...mono, fontSize: 10, color: C.textFaint, letterSpacing: 1, textTransform: "uppercase" }}>Your Aura type</div>
                <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{AURA_TYPES[auraType].name}</div>
              </div>
              <Zap size={22} color={C.cyan} />
            </div>
            <div style={{ fontSize: 12.5, color: C.textDim, marginTop: 8 }}>{AURA_TYPES[auraType].blurb}</div>
          </>
        ) : auraUnlocked ? (
          <>
            <div style={{ ...mono, fontSize: 10, color: C.textFaint, letterSpacing: 1, textTransform: "uppercase" }}>Discover your Aura</div>
            <div style={{ fontSize: 12.5, color: C.textDim, marginTop: 6, marginBottom: 12 }}>A short quiz to find out how your Aura manifests.</div>
            <button onClick={() => setQuizOpen(true)} style={primaryBtnStyle(C)}>TAKE THE QUIZ</button>
          </>
        ) : (
          <>
            <div style={{ ...mono, fontSize: 10, color: C.textFaint, letterSpacing: 1, textTransform: "uppercase" }}>Discover your Aura</div>
            <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
              <Lock size={13} color={C.textFaint} />
              <div style={{ fontSize: 12.5, color: C.textFaint }}>Locked until Chapter 2 · "{CHAPTERS[1].title}"</div>
            </div>
          </>
        )}
      </div>

      {auraType && (
        <div>
          <SectionLabel>Techniques</SectionLabel>
          {pendingBranch && (
            <div style={{ ...cardStyle(C), borderColor: C.cyan, marginTop: 8 }} className="flex items-center justify-between">
              <div style={{ fontSize: 12.5 }}>New technique ready at Level {pendingBranch.level}</div>
              <button onClick={() => setBranchModalLevel(pendingBranch.level)} style={primaryBtnStyle(C)}>CHOOSE</button>
            </div>
          )}
          <div className="flex flex-col gap-1.5 mt-2">
            {slots.map((s) => <TechniqueRow key={s.level} slot={s} currentLevel={levelInfo.current.level} />)}
          </div>
        </div>
      )}

      <div style={cardStyle(C)}>
        {levelInfo.current.level < 2 ? (
          <>
            <div style={{ ...mono, fontSize: 10, color: C.textFaint, letterSpacing: 1, textTransform: "uppercase" }}>Specialization</div>
            <div style={{ fontSize: 12.5, color: C.textFaint, marginTop: 6 }}>Reach Level 2 (Voyager) to choose your path.</div>
          </>
        ) : currentSpec ? (
          <>
            <div className="flex items-center justify-between">
              <div>
                <div style={{ ...mono, fontSize: 10, color: C.textFaint, letterSpacing: 1, textTransform: "uppercase" }}>Your path</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{currentSpec.name}</div>
              </div>
              <button onClick={() => setSpecModalOpen(true)} style={ghostBtnStyle(C)}>CHANGE</button>
            </div>
            <div style={{ fontSize: 12.5, color: C.textDim, marginTop: 8 }}>{currentSpec.blurb}</div>
          </>
        ) : (
          <>
            <div style={{ ...mono, fontSize: 10, color: C.textFaint, letterSpacing: 1, textTransform: "uppercase" }}>Choose your specialization</div>
            <div style={{ fontSize: 12.5, color: C.textDim, marginTop: 6, marginBottom: 12 }}>
              Based on how you've been using the app, we'd suggest <b style={{ color: C.text }}>{SPECIALIZATIONS.find((s) => s.id === suggestedSpec)?.name}</b>.
            </div>
            <button onClick={() => setSpecModalOpen(true)} style={primaryBtnStyle(C)}>CHOOSE PATH</button>
          </>
        )}
      </div>

      <div style={cardStyle(C)}>
        {companion ? (
          <>
            <div className="flex items-center justify-between">
              <div>
                <div style={{ ...mono, fontSize: 10, color: C.textFaint, letterSpacing: 1, textTransform: "uppercase" }}>Traveling with</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{companion.name} · {companion.arc}</div>
              </div>
              <button onClick={() => setCompanionPickerOpen(true)} style={ghostBtnStyle(C)}>SWITCH</button>
            </div>
            <div style={{ fontSize: 12.5, color: C.textDim, marginTop: 8 }}>{companion.blurb}</div>
            <div style={{ ...mono, fontSize: 11, color: C.textFaint, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
              Chapter {chapterIndex + 1}: "{currentChapter.title}" — {currentChapter.line.replace("{companion}", companion.name)}
            </div>
          </>
        ) : companionUnlocked ? (
          <>
            <div style={{ ...mono, fontSize: 10, color: C.textFaint, letterSpacing: 1, textTransform: "uppercase" }}>Choose your companion</div>
            <div style={{ fontSize: 12.5, color: C.textDim, marginTop: 6, marginBottom: 12 }}>Pick whose story you'll follow as your journey unfolds.</div>
            <button onClick={() => setCompanionPickerOpen(true)} style={primaryBtnStyle(C)}>PICK A COMPANION</button>
          </>
        ) : (
          <>
            <div style={{ ...mono, fontSize: 10, color: C.textFaint, letterSpacing: 1, textTransform: "uppercase" }}>Choose your companion</div>
            <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
              <Lock size={13} color={C.textFaint} />
              <div style={{ fontSize: 12.5, color: C.textFaint }}>Locked until Level 5 (Tracker)</div>
            </div>
          </>
        )}
      </div>

      <div>
        <SectionLabel>Chapters · {unlockedBadges.length}/{BADGES.length}</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginTop: 8 }}>
          {BADGES.map((b, i) => {
            const unlocked = b.check(badgeCtx);
            const [cur, max] = b.progress(badgeCtx);
            const chapter = CHAPTERS[i];
            return (
              <div key={b.id} style={{ ...cardStyle(C), opacity: unlocked ? 1 : 0.6 }}>
                <div className="flex items-center gap-2">
                  <div style={{ width: 30, height: 30, borderRadius: 999, background: unlocked ? C.cyanDim : C.surface2, border: `1px solid ${unlocked ? C.cyan + "55" : C.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {unlocked ? <Award size={14} color={C.cyan} /> : <Lock size={12} color={C.textFaint} />}
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: unlocked ? C.text : C.textDim }}>{chapter.title}</div>
                </div>
                <div style={{ ...mono, fontSize: 9.5, color: C.textFaint, marginTop: 6 }}>{b.name}</div>
                {!unlocked && <div style={{ ...mono, fontSize: 9.5, color: C.textFaint, marginTop: 2 }}>{cur}/{max}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {quizOpen && <AuraQuizModal onComplete={(type) => { onSetAuraType(type); setQuizOpen(false); }} onCancel={() => setQuizOpen(false)} />}
      {branchModalLevel && tree && (
        <TechniqueBranchModal level={branchModalLevel} options={tree.branch[branchModalLevel]} onChoose={(name) => { onSetTechniqueChoice(branchModalLevel, name); setBranchModalLevel(null); }} onCancel={() => setBranchModalLevel(null)} />
      )}
      {specModalOpen && <SpecializationModal suggested={suggestedSpec} onChoose={(id) => { onSetSpecialization(id); setSpecModalOpen(false); }} onCancel={() => setSpecModalOpen(false)} />}
      {companionPickerOpen && <CompanionPickerModal current={companionId} onChoose={(id) => { onSetCompanion(id); setCompanionPickerOpen(false); }} onCancel={() => setCompanionPickerOpen(false)} />}
    </div>
  );
}

function StatCard({ label, stats }) {
  const C = useContext(ThemeContext);
  const color = stats.pct == null ? C.textFaint : getGradientColor(stats.pct);
  return (
    <div style={{ ...cardStyle(C), flex: "1 1 140px" }}>
      <div style={{ ...mono, fontSize: 10, color: C.textFaint, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color, marginTop: 6, ...mono }}>{stats.pct == null ? "—" : `${stats.pct}%`}</div>
      <div style={{ ...mono, fontSize: 11, color: C.textDim, marginTop: 4 }}>{stats.completedCount}/{stats.scheduledCount} completed</div>
      <div style={{ ...mono, fontSize: 11, color: C.textFaint, marginTop: 2 }}>{fmtHours(stats.loggedSeconds)}h logged</div>
    </div>
  );
}

function ChartTooltip({ active, payload }) {
  const C = useContext(ThemeContext);
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px", fontSize: 11.5, ...mono }}>
      <div style={{ color: C.text, marginBottom: 2 }}>{p.label}</div>
      <div style={{ color: C.textDim }}>{p.pct}% · {p.completed}/{p.total}</div>
    </div>
  );
}

function PatternBarChart({ items }) {
  const C = useContext(ThemeContext);
  if (items.length === 0) return <EmptyNote text="Not enough data yet for this breakdown." />;
  const height = Math.max(140, items.length * 34);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={items} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
        <XAxis type="number" domain={[0, 100]} tick={{ fill: C.textFaint, fontSize: 10.5 }} tickFormatter={(v) => `${v}%`} />
        <YAxis type="category" dataKey="label" width={78} tick={{ fill: C.text, fontSize: 11.5 }} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        <Bar dataKey="pct" radius={[0, 6, 6, 0]} barSize={16}>
          {items.map((it, i) => <Cell key={i} fill={getGradientColor(it.pct)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function TimeDistributionPie({ history }) {
  const C = useContext(ThemeContext);
  const windowColors = { Morning: C.cyan, Afternoon: C.amber, Evening: C.blue, Night: C.violet };
  const totals = { Morning: 0, Afternoon: 0, Evening: 0, Night: 0 };
  history.forEach((h) => { totals[timeBucketLabel(h.time)] += h.elapsedSeconds || 0; });
  const totalSeconds = Object.values(totals).reduce((a, b) => a + b, 0);
  if (totalSeconds <= 0) return <EmptyNote text="Log some time to see where your hours go." />;
  const data = Object.keys(totals).filter((k) => totals[k] > 0).map((k) => ({ name: k, hours: +(totals[k] / 3600).toFixed(1) }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} dataKey="hours" nameKey="name" cx="50%" cy="50%" outerRadius={78} label={(e) => `${e.name} ${e.hours}h`} labelLine={{ stroke: C.textFaint }}>
          {data.map((d, i) => <Cell key={i} fill={windowColors[d.name]} />)}
        </Pie>
        <Tooltip contentStyle={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 11.5 }} labelStyle={{ color: C.text }} itemStyle={{ color: C.text }} formatter={(v) => [`${v}h`, "logged"]} />
        <Legend wrapperStyle={{ fontSize: 11, color: C.textDim }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function RankingList({ title, header, items }) {
  const C = useContext(ThemeContext);
  return (
    <div>
      {header ? header : (
        <div style={{ ...mono, fontSize: 11, color: C.textFaint, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>{title}</div>
      )}
      {items.length === 0 ? (
        <EmptyNote text="Not enough data yet for this breakdown." />
      ) : (
        <div className="flex flex-col gap-1.5">
          {items.map((it, i) => (
            <div key={it.label} style={{ ...cardStyle(C), padding: "8px 12px" }} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span style={{ width: 6, height: 6, borderRadius: 999, background: getGradientColor(it.pct), flexShrink: 0 }} />
                <span style={{ fontSize: 13 }}>{it.label}</span>
                {i === 0 && <span style={{ ...mono, fontSize: 9, color: C.green, marginLeft: 4 }}>BEST</span>}
                {i === items.length - 1 && items.length > 1 && <span style={{ ...mono, fontSize: 9, color: C.red, marginLeft: 4 }}>TOUGHEST</span>}
              </div>
              <div className="flex items-center gap-2">
                <span style={{ ...mono, fontSize: 11, color: C.textFaint }}>{it.completed}/{it.total}</span>
                <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: getGradientColor(it.pct) }}>{it.pct}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

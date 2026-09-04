// Directional payroll laboratory. Reads the deterministic bot report that Production CI already
// generated and models bounded post-week-one staffing overhead WITHOUT changing live gameplay,
// saves, purchase decisions or ad surfaces. If a model looks promising here it still needs a
// second integrated simulation before it can ship, because real deductions can change purchases.
import fs from 'node:fs';
import path from 'node:path';

const input = path.resolve('reports-production', 'bot-report.txt');
if (!fs.existsSync(input)) throw new Error('bot report missing: run npm run bot | tee reports-production/bot-report.txt first');
const text = fs.readFileSync(input, 'utf8');
const lines = text.split(/\r?\n/);

// Data rows begin with day, earnings, served and lost. Everything after the compact afford column
// is treated as purchase text so staff acquisition can be tracked without coupling to bot internals.
const rows = [];
for (const line of lines) {
  const m = line.match(/^\s*(\d+)\s+(\d+(?:\.\d+)?)\s+(\d+)\s+(\d+)\s+(.+)$/);
  if (!m) continue;
  const day = Number(m[1]), earnings = Number(m[2]);
  if (!(day >= 1 && day <= 99) || !Number.isFinite(earnings)) continue;
  rows.push({ day, earnings, tail:m[5] });
}
if (rows.length < 8) throw new Error(`could not parse enough bot days (${rows.length})`);

// Track staff actually owned by the end of each reported day. The directional model scales a
// candidate overhead by up to three role-equivalents: one worker = 1/3 of the headline rate,
// three+ workers = the full headline rate. This is intentionally gentler and more interpretable
// than pretending we already know exact salaries per role.
let staff = 0;
for (const r of rows) {
  const hires = r.tail.match(/hire:(runner|cashier|cleaner)/g) || [];
  staff += hires.length;
  r.staff = staff;
}

const rates = [0, 0.05, 0.08, 0.10];
const results = [];
for (const rate of rates) {
  let gross = 0, overhead = 0;
  const days = [];
  for (const r of rows) {
    gross += r.earnings;
    const active = r.day >= 8 && r.staff > 0;
    const staffFactor = active ? Math.min(1, r.staff / 3) : 0;
    const cost = Math.round(r.earnings * rate * staffFactor);
    overhead += cost;
    days.push({ day:r.day, gross:r.earnings, staff:r.staff, cost, net:r.earnings-cost });
  }
  const d8 = days.find(d => d.day === 8);
  const d10 = days.find(d => d.day === 10);
  const postWeek = days.filter(d => d.day >= 8);
  const avgPostWeekCost = postWeek.length ? postWeek.reduce((s,d)=>s+d.cost,0)/postWeek.length : 0;
  results.push({ rate, gross, overhead, net:gross-overhead, share:gross?overhead/gross:0, avgPostWeekCost, d8, d10, days });
}

let out = '';
out += 'Pet Café — STAFF OVERHEAD WHAT-IF (REPORT ONLY; NO GAMEPLAY MUTATION)\n';
out += 'Model: starts Day 8; scales with staff owned up to 3 role-equivalents; wallet/purchases are NOT replayed.\n\n';
out += 'rate   total gross   overhead   share    avg/day D8+   Day8 gross→net   Day10 gross→net\n';
for (const r of results) {
  const pct = `${Math.round(r.rate*100)}%`.padEnd(7);
  const d8 = r.d8 ? `${r.d8.gross}→${r.d8.net}` : 'n/a';
  const d10 = r.d10 ? `${r.d10.gross}→${r.d10.net}` : 'n/a';
  out += pct + String(Math.round(r.gross)).padEnd(14) + String(r.overhead).padEnd(11) + `${(r.share*100).toFixed(1)}%`.padEnd(9) + String(Math.round(r.avgPostWeekCost)).padEnd(14) + d8.padEnd(17) + d10 + '\n';
}
out += '\nDay-by-day post-week-one sensitivity\n';
out += 'day  staff  gross  5%net  8%net  10%net\n';
for (const base of rows.filter(r => r.day >= 8)) {
  const byRate = new Map(results.map(r => [r.rate, r.days.find(d => d.day === base.day)]));
  out += String(base.day).padEnd(5) + String(base.staff).padEnd(7) + String(base.earnings).padEnd(7) +
    String(byRate.get(.05)?.net ?? '-').padEnd(7) + String(byRate.get(.08)?.net ?? '-').padEnd(7) + String(byRate.get(.10)?.net ?? '-') + '\n';
}

// Guardrail recommendation is intentionally conservative. Day 8 is already a weak checkpoint in
// the current build; a large tax there should be rejected before an integrated simulation exists.
const five = results.find(r => r.rate === .05), eight = results.find(r => r.rate === .08), ten = results.find(r => r.rate === .10);
out += '\nInterpretation guardrail\n';
out += '- This is sensitivity analysis only; it does not claim a payroll model is safe to ship.\n';
out += '- Never pair compulsory overhead with a rewarded button that simply deletes that overhead.\n';
out += `- 5% directional Day-8 cost: ${five?.d8?.cost ?? 'n/a'}; 8%: ${eight?.d8?.cost ?? 'n/a'}; 10%: ${ten?.d8?.cost ?? 'n/a'}.\n`;
out += '- If even 5% meaningfully worsens the already-weak Day-8 economy, keep staff wage-free and monetize optional rush convenience instead.\n';

const output = path.resolve('reports-production', 'payroll-whatif.txt');
fs.writeFileSync(output, out);
console.log(out);

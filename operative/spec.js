// operative/spec.js — what was asked for, against what got built.
//
// The reference sheets carry six numbers and two words. This measures the finished
// trailer against them and reports the difference, including where the building
// came out other than specified and why that was allowed to stand.
import { systemReach } from './checks.js';

export const SHEET = Object.freeze({
  length: { want: 240, unit: 'in', label: "LENGTH 20'-0\"" },
  width: { want: 102, unit: 'in', label: 'WIDTH 8\'-6"' },
  height: { want: 126, unit: 'in', label: 'HEIGHT 10\'-6"' },
  sleeping: { want: 1, unit: 'person', label: 'SLEEPING 1' },
  water: { want: 65, unit: 'gal', label: 'WATER 65 GAL' },
  power: { want: 'off-grid', label: 'POWER OFF-GRID' }
});

const bounds = (els) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const e of els) { const a = e.lo, b = e.hi; for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], a[i]); hi[i] = Math.max(hi[i], b[i]); } }
  return { lo, hi };
};

export function compareToSheet(world) {
  const all = bounds(world.solids());
  const body = bounds(world.all({ kind: ['sheathing', 'deck', 'plate', 'stud'] }));
  const tank = world.get('tank.fresh');
  const gal = tank ? (tank.box.s[0] * tank.box.s[1] * tank.box.s[2]) / 231 : 0;
  const beds = world.all().filter(e => e.meta.role === 'mattress' || e.kind === 'mattress');
  const grid = world.all().filter(e => /shore|utility\.in/.test(e.id)).length === 0;
  const pv = world.all().filter(e => e.meta.pvWatts).reduce((a, e) => a + e.meta.pvWatts, 0);

  const rows = [
    { of: 'length', got: +(body.hi[1] - body.lo[1]).toFixed(1), want: SHEET.length.want, unit: 'in',
      note: 'framing; the propane bottle hangs on the tongue beyond it' },
    { of: 'width', got: +(all.hi[0] - all.lo[0]).toFixed(1), want: SHEET.width.want, unit: 'in',
      note: 'overall, wheels and skin included — this is what the road measures' },
    { of: 'height', got: +(all.hi[2] - all.lo[2]).toFixed(1), want: SHEET.height.want, unit: 'in',
      note: 'under the sheet: width was the binding constraint, not height' },
    { of: 'sleeping', got: beds.length, want: SHEET.sleeping.want, unit: 'person',
      note: beds.length ? `${beds[0].box.s[0]} x ${beds[0].box.s[1]} in — the axle decided the depth` : 'no bed' },
    { of: 'water', got: +gal.toFixed(1), want: SHEET.water.want, unit: 'gal',
      note: 'fresh; the sheet lists no grey capacity, so grey leaves the building' },
    { of: 'power', got: grid ? 'off-grid' : 'shore', want: SHEET.power.want, unit: '',
      note: `${pv} W of array, no shore connection` }
  ];
  for (const r of rows) {
    r.meets = typeof r.want === 'number'
      ? (r.of === 'height' || r.of === 'width' ? r.got <= r.want + 0.6 : r.got >= r.want - 1)
      : r.got === r.want;
    if (typeof r.want === 'number') r.delta = +(r.got - r.want).toFixed(1);
  }

  const systems = ['water', 'waste', 'power', 'propane', 'flue'].map(sys => {
    const reach = systemReach(world, sys);
    const parts = world.all().filter(e => e.system === sys);
    const devices = parts.filter(e => e.kind !== 'run');
    return { system: sys, parts: parts.length, devices: devices.length,
      connected: devices.filter(d => reach.connected.has(d.id)).length };
  });

  const loads = world.all().filter(e => e.meta.watts && e.meta.hoursPerDay);
  const dailyWh = loads.reduce((a, e) => a + e.meta.watts * e.meta.hoursPerDay, 0);
  const bankWh = world.all().filter(e => e.meta.ah).reduce((a, e) => a + e.meta.ah * (e.meta.volts || 12), 0);

  return {
    rows, systems,
    power: { dailyWh: +dailyWh.toFixed(0), bankWh, usableWh: +(bankWh * 0.8).toFixed(0),
             pvWatts: pv, pvDailyWh: +(pv * 4 * 0.75).toFixed(0), loads: loads.length },
    members: world.elements.size,
    open: (world.conditions || []).length
  };
}

// /api/admin/settings – Roy's prices, working days and hours.
import { route, json, fail, readJson } from '../../util.js';
import { requireAdmin } from '../../auth.js';
import { saveSettingsRow } from '../../db.js';
import { loadSettings } from '../../booking-data.js';
import { PROPERTY_TYPES } from '../../catalog.js';
import { clean } from '../../util.js';

export const GET = route(async (request) => {
  await requireAdmin(request);
  return json({ settings: await loadSettings(), propertyTypes: PROPERTY_TYPES });
});

const pence = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Math.round(Number(v) * 100);
  return Number.isFinite(n) && n > 0 && n <= 1_000_000 ? n : null;
};
const int = (v, min, max, dflt) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};

// Body uses pounds (e.g. 45 or "45.50"); stored as pence.
export const PUT = route(async (request) => {
  await requireAdmin(request);
  const b = await readJson(request, 50_000);
  const services = [];
  for (const row of (Array.isArray(b.services) ? b.services : []).slice(0, 40)) {
    const name = clean(row?.name, 80);
    if (!name) continue;
    let id = /^[a-z0-9-]{1,40}$/.test(row.id || '') ? row.id : name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'service';
    while (services.some((s) => s.id === id)) id += '-2';
    services.push({ id, name, price: pence(row.price), active: row.active !== false });
  }
  if (!services.length) return fail('Add at least one service.');
  const working_days = [...new Set((b.working_days || []).map(Number))].filter((d) => d >= 0 && d <= 6).sort();
  const slots = { am: !!b.slots?.am, pm: !!b.slots?.pm };
  if (!working_days.length) return fail('Pick at least one working day.');
  if (!slots.am && !slots.pm) return fail('Turn on at least morning or afternoon.');
  const data = {
    services,
    surcharge_3plus: pence(b.surcharge_3plus) || 0,
    working_days,
    closed_bank_holidays: b.closed_bank_holidays !== false,
    slots,
    capacity_per_slot: int(b.capacity_per_slot, 1, 20, 2),
    min_notice_days: int(b.min_notice_days, 0, 30, 1),
    max_days_ahead: int(b.max_days_ahead, 7, 365, 60),
  };
  await saveSettingsRow(data);
  return json({ settings: data });
});

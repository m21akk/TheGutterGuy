// What can be booked, and the default settings Roy can change in the back office.

// Starting list – Roy can rename, add, remove and price these in Prices & hours.
export const SERVICES = [
  { id: 'gutters', name: 'Gutters vacuumed / cleared' },
  { id: 'fascia', name: 'Fascia & gutter cleaning' },
  { id: 'conservatory', name: 'Conservatory roof cleaning' },
  { id: 'cladding', name: 'Cladding cleaning' },
  { id: 'repairs', name: 'Gutter repairs' },
];

// Property types that can be booked online at a set price.
export const PROPERTY_TYPES = [
  { id: 'terraced', name: 'Terraced' },
  { id: 'semi', name: 'Semi-detached' },
  { id: 'detached', name: 'Detached' },
  { id: 'bungalow', name: 'Bungalow' },
  { id: 'flat', name: 'Flat / apartment' },
];

// These always go to "send a booking request" so Roy can price them.
export const QUOTE_ONLY_PROPERTY = [
  { id: 'commercial', name: 'Commercial' },
  { id: 'other', name: 'Other' },
];

export const STOREYS = ['1', '2', '3+'];

export const SLOT_NAMES = { am: 'Morning (8am–12pm)', pm: 'Afternoon (12pm–5pm)' };

export const DEFAULT_SETTINGS = {
  // Roy's services list. price = pence, or null for "price on request".
  services: SERVICES.map((sv) => ({ ...sv, price: null, active: true })),
  surcharge_3plus: 0,      // extra pence for 3+ storey properties
  working_days: [1, 2, 3, 4, 5, 6], // Monday–Saturday (0 = Sunday … 6 = Saturday)
  closed_bank_holidays: true,       // England & Wales bank holidays
  slots: { am: true, pm: true },
  capacity_per_slot: 2,    // jobs Roy can do in one morning / afternoon
  min_notice_days: 1,      // 1 = earliest booking is tomorrow
  max_days_ahead: 60,
};

export function mergeSettings(saved) {
  const s = { ...DEFAULT_SETTINGS, ...(saved || {}) };
  s.slots = { ...DEFAULT_SETTINGS.slots, ...(saved?.slots || {}) };
  s.services = Array.isArray(saved?.services) && saved.services.length ? saved.services : DEFAULT_SETTINGS.services;
  delete s.prices;
  return s;
}

export const activeServices = (settings) => settings.services.filter((s) => s.active !== false);

// Work out the total for a booking. Returns null if anything needs pricing by Roy.
export function priceFor(settings, propertyId, storeys, serviceIds) {
  if (!PROPERTY_TYPES.some((p) => p.id === propertyId)) return null;
  if (!serviceIds.length) return null;
  let total = 0;
  for (const id of serviceIds) {
    const svc = activeServices(settings).find((s) => s.id === id);
    if (!svc || !Number.isInteger(svc.price) || svc.price <= 0) return null;
    total += svc.price;
  }
  if (storeys === '3+') total += Math.max(0, settings.surcharge_3plus || 0);
  return total;
}

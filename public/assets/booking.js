// Online booking: choose property + services, see the price, pick a free slot, pay with Stripe.
// Jobs without a set price (commercial, repairs…) are sent to Roy as a booking request instead.
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const money = (p) => '£' + (p / 100).toFixed(p % 100 ? 2 : 0);
  const longDate = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const SLOT_SHORT = { am: 'Morning', pm: 'Afternoon' };
  const SLOT_TIME = { am: '8am – 12pm', pm: '12pm – 5pm' };

  const state = { property: null, storeys: null, services: new Set(), date: null, slot: null };
  let opts = null;
  let month = null;
  let photos = [];

  document.getElementById('year').textContent = new Date().getFullYear();

  // ---------- Load options ----------
  async function load() {
    try {
      opts = window.GG_DEMO ? demoOptions() : await (await fetch('/api/booking-options')).json();
      if (!opts.services) throw new Error();
    } catch {
      $('#bcal').innerHTML = '<p class="muted-note">Online booking is unavailable right now – please call Roy on 07460 941982.</p>';
      return;
    }
    const firstFree = Object.keys(opts.availability.days)[0] || opts.availability.first;
    month = new Date(firstFree + 'T12:00:00'); month.setDate(1);
    renderProperty(); renderServices(); renderCalendar(); renderSummary();
  }

  // ---------- Pricing (same rules as the server) ----------
  function servicePrice(id) {
    const p = opts.services.find((s) => s.id === id)?.price;
    return Number.isInteger(p) && p > 0 ? p : null;
  }
  function total() {
    if (!state.property || !state.services.size) return undefined;
    if (!opts.propertyTypes.some((p) => p.id === state.property)) return null;
    let t = 0;
    for (const id of state.services) {
      if (id === 'unsure') return null;
      const p = servicePrice(id);
      if (p === null) return null;
      t += p;
    }
    if (state.storeys === '3+') t += opts.surcharge3plus || 0;
    return t;
  }
  const instant = () => typeof total() === 'number';

  // ---------- Step 1: property ----------
  function renderProperty() {
    const all = [...opts.propertyTypes, ...opts.quoteOnlyPropertyTypes];
    $('#property-chips').innerHTML = all.map((p) =>
      `<label class="chip"><input type="radio" name="property" value="${p.id}" ${state.property === p.id ? 'checked' : ''}><span>${esc(p.name)}</span></label>`).join('');
    $('#property-chips').querySelectorAll('input').forEach((i) => (i.onchange = () => {
      state.property = i.value;
      if (i.value === 'bungalow') state.storeys = '1';
      renderStoreys(); renderServices(); renderSummary();
    }));
    renderStoreys();
  }
  function renderStoreys() {
    $('#storeys-wrap').style.display = state.property === 'bungalow' ? 'none' : '';
    $('#storey-chips').innerHTML = opts.storeys.map((s) =>
      `<label class="chip"><input type="radio" name="storeys" value="${s}" ${state.storeys === s ? 'checked' : ''}><span>${s === '3+' ? '3 or more' : s}</span></label>`).join('');
    $('#storey-chips').querySelectorAll('input').forEach((i) => (i.onchange = () => { state.storeys = i.value; renderSummary(); }));
  }

  // ---------- Step 2: services ----------
  function renderServices() {
    const rows = [...opts.services, { id: 'unsure', name: 'Not sure – I’d like Roy to advise' }];
    $('#service-list').innerHTML = rows.map((s) => {
      let price = '';
      if (s.id !== 'unsure') {
        const p = servicePrice(s.id);
        price = p ? `<span class="pr">${money(p)}</span>` : '<span class="pr ask">Price on request</span>';
      }
      return `<label class="svc ${state.services.has(s.id) ? 'on' : ''}"><input type="checkbox" value="${s.id}" ${state.services.has(s.id) ? 'checked' : ''}><span class="nm">${esc(s.name)}</span>${price}</label>`;
    }).join('');
    $('#service-list').querySelectorAll('input').forEach((i) => (i.onchange = () => {
      i.checked ? state.services.add(i.value) : state.services.delete(i.value);
      i.closest('.svc').classList.toggle('on', i.checked);
      renderSummary();
    }));
  }

  // ---------- Step 3: calendar ----------
  function renderCalendar() {
    const days = opts.availability.days;
    const first = new Date(opts.availability.first + 'T12:00:00');
    const last = new Date(opts.availability.last + 'T12:00:00');
    const y = month.getFullYear(), m = month.getMonth();
    const start = (new Date(y, m, 1).getDay() + 6) % 7; // Monday first
    const count = new Date(y, m + 1, 0).getDate();
    let cells = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<div class="dow">${d}</div>`).join('');
    for (let i = 0; i < start; i++) cells += '<div class="blank"></div>';
    for (let d = 1; d <= count; d++) {
      const key = iso(new Date(y, m, d));
      const free = !!days[key];
      cells += `<button type="button" data-d="${key}" class="${free ? 'free' : ''} ${state.date === key ? 'sel' : ''}" ${free ? '' : 'disabled'} aria-label="${longDate(key)}${free ? '' : ' – unavailable'}">${d}</button>`;
    }
    const prevOk = new Date(y, m, 1) > first;
    const nextOk = new Date(y, m + 1, 1) <= last;
    $('#bcal').innerHTML = `<div class="bcal-head"><button type="button" id="bc-prev" ${prevOk ? '' : 'disabled'} aria-label="Previous month">‹</button>
      <strong>${month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</strong>
      <button type="button" id="bc-next" ${nextOk ? '' : 'disabled'} aria-label="Next month">›</button></div>
      <div class="bcal-grid">${cells}</div>
      ${Object.keys(days).length ? '' : '<p class="muted-note" style="margin-top:12px">No free days at the moment – please call Roy on 07460 941982.</p>'}`;
    $('#bc-prev').onclick = () => { month.setMonth(month.getMonth() - 1); renderCalendar(); };
    $('#bc-next').onclick = () => { month.setMonth(month.getMonth() + 1); renderCalendar(); };
    $('#bcal').querySelectorAll('button[data-d]').forEach((b) => (b.onclick = () => {
      state.date = b.dataset.d;
      const free = days[state.date];
      if (!free[state.slot]) state.slot = free.am ? (free.pm ? null : 'am') : 'pm';
      renderCalendar(); renderSummary();
    }));
    renderSlots();
  }
  function renderSlots() {
    const free = state.date ? opts.availability.days[state.date] || {} : null;
    if (!free) { $('#slot-row').innerHTML = ''; return; }
    $('#slot-row').innerHTML = ['am', 'pm'].map((s) =>
      `<button type="button" data-s="${s}" class="${state.slot === s ? 'sel' : ''}" ${free[s] ? '' : 'disabled'}>${SLOT_SHORT[s]}<small>${free[s] ? SLOT_TIME[s] : 'Fully booked'}</small></button>`).join('');
    $('#slot-row').querySelectorAll('button').forEach((b) => (b.onclick = () => { state.slot = b.dataset.s; renderSlots(); renderSummary(); }));
  }

  // ---------- Summary ----------
  function renderSummary() {
    const allProps = [...opts.propertyTypes, ...opts.quoteOnlyPropertyTypes];
    const prop = allProps.find((p) => p.id === state.property);
    const names = [...state.services].map((id) => (id === 'unsure' ? 'Advice needed' : opts.services.find((s) => s.id === id)?.name));
    const lines = [
      ['Property', prop ? prop.name + (state.storeys && state.property !== 'bungalow' ? `, ${state.storeys} storey` : '') : '–'],
      ['Services', names.length ? names.join(', ') : '–'],
      ['Day', state.date ? longDate(state.date) : '–'],
      ['Time', state.slot ? `${SLOT_SHORT[state.slot]} (${SLOT_TIME[state.slot]})` : '–'],
    ];
    if (state.storeys === '3+' && opts.surcharge3plus && instant()) lines.push(['3+ storeys', '+' + money(opts.surcharge3plus)]);
    $('#sum-lines').innerHTML = lines.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
    const t = total();
    const btn = $('#submit-btn');
    if (t === null) {
      $('#sum-total').textContent = 'Roy will price it';
      $('#sum-total').style.fontSize = '1.05rem';
      btn.textContent = 'Send booking request';
      $('#sum-fine').textContent = 'Roy will email you a price for this job. Accept and pay online to confirm your day.';
    } else {
      $('#sum-total').textContent = typeof t === 'number' ? money(t) : '–';
      $('#sum-total').style.fontSize = '';
      btn.textContent = typeof t === 'number' ? `Pay ${money(t)} & book` : 'Book now';
      $('#sum-fine').textContent = 'Secure payment by Stripe. Card, Apple Pay or Google Pay.';
    }
  }

  // ---------- Photos ----------
  const input = $('#photo-input'), zone = $('#drop-zone'), thumbs = $('#thumbs');
  function shrink(file) {
    return new Promise((resolve, reject) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, 1400 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that photo')); };
      img.src = url;
    });
  }
  function drawThumbs() {
    thumbs.innerHTML = '';
    photos.forEach((src, i) => {
      const f = document.createElement('figure');
      f.innerHTML = '<img alt=""><button type="button" aria-label="Remove photo">×</button>';
      f.querySelector('img').src = src;
      f.querySelector('button').onclick = () => { photos.splice(i, 1); drawThumbs(); };
      thumbs.appendChild(f);
    });
    zone.style.display = photos.length >= 3 ? 'none' : '';
  }
  async function addFiles(files) {
    for (const f of [...files].filter((f) => f.type.startsWith('image/'))) {
      if (photos.length >= 3) break;
      try { photos.push(await shrink(f)); } catch (e) { showError(e.message); }
    }
    drawThumbs();
  }
  zone.onclick = () => input.click();
  zone.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
  zone.ondragover = (e) => e.preventDefault();
  zone.ondrop = (e) => { e.preventDefault(); addFiles(e.dataTransfer.files); };
  input.onchange = () => { addFiles(input.files); input.value = ''; };

  // ---------- Submit ----------
  function showError(msg) {
    const box = $('#form-error');
    box.textContent = msg; box.style.display = 'block';
  }
  $('#book-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#form-error').style.display = 'none';
    if (!opts) return;
    const f = new FormData($('#book-form'));
    const d = Object.fromEntries(['name', 'phone', 'email', 'address', 'town', 'postcode', 'notes', 'website'].map((k) => [k, (f.get(k) || '').trim()]));
    if (!state.property) return showError('Please choose your property type.');
    if (!state.storeys && state.property !== 'bungalow') return showError('Please choose how many storeys.');
    if (!state.services.size) return showError('Please choose what you need.');
    if (!state.date || !state.slot) return showError('Please pick a day and a morning or afternoon.');
    if (!d.name || !d.phone || !d.email || !d.address || !d.postcode) return showError('Please fill in your name, phone, email, address and postcode.');

    const body = { ...d, property_type: state.property, storeys: state.storeys || '1', services: [...state.services], date: state.date, slot: state.slot, photos };
    const btn = $('#submit-btn'); const label = btn.textContent;
    btn.disabled = true; btn.textContent = instant() ? 'Taking you to payment…' : 'Sending…';
    try {
      if (window.GG_DEMO) {
        await new Promise((r) => setTimeout(r, 700));
        if (instant()) {
          $('#book-form').innerHTML = `<div class="success"><div class="tick"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M4 12l5 5L20 6"/></svg></div>
            <h3 style="font-size:1.5rem">Preview: this is where Stripe payment opens</h3>
            <p style="color:var(--muted)">On the real site the customer pays ${esc($('#sum-total').textContent)} on Stripe’s secure page, then sees “You’re booked in” for ${esc(longDate(state.date))} (${SLOT_SHORT[state.slot].toLowerCase()}).</p></div>`;
          $('#summary').style.display = 'none';
          return;
        }
      } else {
        const res = await fetch(instant() ? '/api/book' : '/api/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const out = await res.json().catch(() => ({}));
        if (res.status === 409) { await load(); throw new Error(out.error); }
        if (!res.ok) throw new Error(out.error || 'Something went wrong – please try again or call 07460 941982.');
        if (out.url) { location.href = out.url; return; }
      }
      $('#book-form').innerHTML = `<div class="success"><div class="tick"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M4 12l5 5L20 6"/></svg></div>
        <h3 style="font-size:1.5rem">Thanks – request sent!</h3>
        <p style="color:var(--muted)">Roy will email a price to <strong></strong> for ${esc(longDate(state.date))} (${SLOT_SHORT[state.slot].toLowerCase()}).<br>Accept and pay online to confirm your booking.</p></div>`;
      $('#book-form strong').textContent = d.email;
      $('#summary').style.display = 'none';
      $('#book-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
      showError(err.message);
      btn.disabled = false; btn.textContent = label;
    }
  });

  // ---------- Reviews ----------
  async function loadReviews() {
    if (window.GG_DEMO) return;
    try {
      const { reviews, googleUrl } = await (await fetch('/api/reviews')).json();
      if (googleUrl) $('#google-link').href = googleUrl;
      if (!reviews?.length) return;
      $('#review-list').innerHTML = reviews.slice(0, 3).map((r) => `<blockquote class="review">
        <p>“${esc(r.text.length > 260 ? r.text.slice(0, 257).trimEnd() + '…' : r.text)}”</p>
        <div class="by">★★★★★ · ${r.authorUrl ? `<a href="${esc(r.authorUrl)}" target="_blank" rel="noopener">${esc(r.author)}</a>` : esc(r.author)} · Google${r.when ? ' · ' + esc(r.when) : ''}</div>
      </blockquote>`).join('');
    } catch { /* keep the fallback text */ }
  }

  // ---------- Demo data (preview only) ----------
  function demoOptions() {
    const days = {}; const t = new Date();
    for (let i = 1; i <= 60; i++) {
      const d = new Date(t); d.setDate(t.getDate() + i);
      if (d.getDay() === 0 || [9, 10, 11].includes(i) || (d.getMonth() === 11 && [25, 26, 28].includes(d.getDate()))) continue;
      days[iso(d)] = i % 5 === 0 ? { pm: 1 } : i % 7 === 0 ? { am: 1 } : { am: 2, pm: 2 };
    }
    return {
      services: [{ id: 'gutters', name: 'Gutters vacuumed / cleared', price: 6000 }, { id: 'fascia', name: 'Fascia & gutter cleaning', price: 4500 }, { id: 'conservatory', name: 'Conservatory roof cleaning', price: 7000 }, { id: 'cladding', name: 'Cladding cleaning', price: null }, { id: 'repairs', name: 'Gutter repairs', price: null }],
      propertyTypes: [{ id: 'terraced', name: 'Terraced' }, { id: 'semi', name: 'Semi-detached' }, { id: 'detached', name: 'Detached' }, { id: 'bungalow', name: 'Bungalow' }, { id: 'flat', name: 'Flat / apartment' }],
      quoteOnlyPropertyTypes: [{ id: 'commercial', name: 'Commercial' }, { id: 'other', name: 'Other' }],
      storeys: ['1', '2', '3+'],
      surcharge3plus: 2000,
      availability: { first: iso(new Date(t.getTime() + 864e5)), last: iso(new Date(t.getTime() + 60 * 864e5)), days },
    };
  }

  load(); loadReviews();
})();

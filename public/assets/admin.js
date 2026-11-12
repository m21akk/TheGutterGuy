// Roy's admin: quote requests, sending prices via Stripe, and the job diary.
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const money = (p) => '£' + (p / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const nice = (s, opts = { weekday: 'short', day: 'numeric', month: 'short' }) => (s ? new Date(s.length === 10 ? s + 'T12:00:00' : s).toLocaleDateString('en-GB', opts) : '');
  const STATUS = { new: 'Needs price', quoted: 'Quoted', pending: 'Paying now', paid: 'Booked & paid', completed: 'Done', cancelled: 'Cancelled' };
  const SLOT = { am: 'Morning', pm: 'Afternoon', any: 'Any time' };

  let jobs = [];
  let timeOff = [];
  const isLiveHold = (j) => j.status === 'pending' && j.hold_expires_at && new Date(j.hold_expires_at) > new Date();
  const visible = (j) => j.status !== 'pending' || isLiveHold(j);
  let filter = 'paid';
  let month = new Date(); month.setDate(1);
  let selectedDay = iso(new Date());

  // ---------- API (with a demo mode for previews) ----------
  async function api(path, opts = {}) {
    if (window.GG_DEMO) return demoApi(path, opts);
    const res = await fetch(path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !path.includes('session')) { showLogin(); throw new Error('Please log in'); }
    if (!res.ok) throw new Error(data.error || 'Something went wrong');
    return data;
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3000);
  }

  // ---------- Login ----------
  function showLogin() { $('#login').hidden = false; $('#app').hidden = true; $('#password').focus(); }
  $('#login-form').onsubmit = async (e) => {
    e.preventDefault();
    const err = $('#login-error'); err.style.display = 'none';
    try {
      await api('/api/admin/session', { method: 'POST', body: { password: $('#password').value } });
      start();
    } catch (ex) { err.textContent = ex.message; err.style.display = 'block'; }
  };
  $('#logout').onclick = async () => { await api('/api/admin/session', { method: 'DELETE' }); location.reload(); };

  async function start() {
    $('#login').hidden = true; $('#app').hidden = false;
    await load();
    const m = /job=([0-9a-f-]{36})/.exec(location.hash);
    if (m) openJob(m[1]);
  }

  async function load() {
    const [j, t] = await Promise.all([api('/api/admin/jobs'), api('/api/admin/time-off')]);
    jobs = j.jobs.filter(visible);
    timeOff = t.timeOff || [];
    renderList(); renderDiary(); renderTimeOff();
  }

  // ---------- Tabs ----------
  document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => {
    document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
    ['jobs', 'diary', 'timeoff', 'prices'].forEach((v) => ($('#view-' + v).hidden = b.dataset.view !== v));
    if (b.dataset.view === 'prices') loadPrices();
  }));

  // ---------- Jobs list ----------
  const FILTERS = [['paid', 'Booked'], ['new', 'Needs a price'], ['quoted', 'Awaiting payment'], ['completed', 'Done'], ['all', 'All']];
  function matches(j, f) {
    if (f === 'all') return true;
    if (f === 'quoted') return j.status === 'quoted' || j.status === 'pending';
    return j.status === f;
  }
  function renderList() {
    $('#filters').innerHTML = FILTERS.map(([k, label]) => {
      const n = k === 'all' ? jobs.length : jobs.filter((j) => matches(j, k)).length;
      return `<button data-f="${k}" class="${filter === k ? 'on' : ''}">${label}<b>${n}</b></button>`;
    }).join('');
    $('#filters').querySelectorAll('button').forEach((b) => (b.onclick = () => { filter = b.dataset.f; renderList(); }));

    const q = $('#search').value.trim().toLowerCase();
    const list = jobs.filter((j) => matches(j, filter) &&
      (!q || [j.name, j.postcode, j.phone, j.email, j.address, j.town].join(' ').toLowerCase().includes(q)));
    $('#job-list').innerHTML = list.length ? list.map(card).join('') : `<div class="empty">Nothing here right now.</div>`;
    $('#job-list').querySelectorAll('.job').forEach((el) => (el.onclick = () => openJob(el.dataset.id)));
  }
  $('#search').oninput = renderList;

  function card(j) {
    const when = j.scheduled_date ? `📅 ${nice(j.scheduled_date)}${j.scheduled_slot && j.scheduled_slot !== 'any' ? ' ' + SLOT[j.scheduled_slot] : ''}`
      : j.preferred_date ? `Prefers ${nice(j.preferred_date)}` : `Requested ${nice(j.created_at)}`;
    return `<button class="job" data-id="${j.id}">
      <span class="name">${esc(j.name)} · ${esc(j.postcode)}</span>
      <span class="badge s-${j.status}">${STATUS[j.status]}${j.price_pence ? ' ' + money(j.price_pence) : ''}</span>
      <span class="meta">${esc((j.services || []).join(', '))}</span>
      <span class="meta">${esc(when)}</span>
    </button>`;
  }

  // ---------- Job drawer ----------
  async function openJob(id) {
    const drawer = $('#drawer');
    drawer.innerHTML = '<div class="d-body">Loading…</div>';
    drawer.hidden = false; $('#drawer-bg').hidden = false;
    history.replaceState(null, '', '#job=' + id);
    try {
      const { job } = await api('/api/admin/jobs?id=' + id);
      renderJob(job);
    } catch (e) { drawer.innerHTML = `<div class="d-body">${esc(e.message)}</div>`; }
  }
  function closeJob() { $('#drawer').hidden = true; $('#drawer-bg').hidden = true; history.replaceState(null, '', location.pathname); }
  $('#drawer-bg').onclick = closeJob;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeJob(); });

  function intlPhone(p) { const d = String(p).replace(/\D/g, ''); return d.startsWith('0') ? '44' + d.slice(1) : d; }

  function renderJob(j) {
    const addr = [j.address, j.town, j.postcode].filter(Boolean).join(', ');
    const tomorrow = iso(new Date(Date.now() + 864e5));
    const canQuote = ['new', 'quoted'].includes(j.status);
    const firstName = (j.name || '').split(' ')[0];

    const quoteForm = `
      <div class="field"><label>Price</label><div class="price-input"><span>£</span><input id="q-price" type="number" min="1" step="0.01" inputmode="decimal" value="${j.price_pence ? (j.price_pence / 100).toFixed(2) : ''}" placeholder="0.00"></div></div>
      <div class="row">
        <div class="field"><label>Proposed date <small>(optional)</small></label><input id="q-date" type="date" min="${tomorrow}" value="${j.scheduled_date || j.preferred_date || ''}"></div>
        <div class="field"><label>Pay within</label><select id="q-days">${[3, 7, 14, 30].map((d) => `<option value="${d}" ${d === 7 ? 'selected' : ''}>${d} days</option>`).join('')}</select></div>
      </div>
      <div class="field"><label>Message to customer <small>(optional)</small></label><textarea id="q-msg" placeholder="E.g. Includes front and back gutters plus the conservatory.">${esc(j.quote_message || '')}</textarea></div>
      <button class="btn" id="q-send">${j.status === 'quoted' ? 'Send updated quote' : 'Send quote'}</button>
      <p style="font-size:.85rem;color:var(--muted);margin:10px 0 0">The customer gets an email from Stripe with a “Pay” button. Stripe sends reminders automatically if they don’t pay.</p>`;

    let money_ = '';
    if (j.status === 'quoted') {
      const wa = `https://wa.me/${intlPhone(j.phone)}?text=${encodeURIComponent(`Hi ${firstName}, here's your quote from The Gutter Guy (${money(j.price_pence)}). You can accept and pay securely here: ${j.invoice_url}`)}`;
      money_ = `<div class="quoted-box"><div class="amt">${money(j.price_pence)}</div>
        <div>Quote sent ${nice(j.quoted_at)} · waiting for payment</div>
        <div class="quick"><a class="btn small ghost" href="${esc(j.invoice_url)}" target="_blank" rel="noopener">View quote</a>
        <button class="btn small ghost" id="copy-link">Copy pay link</button>
        <a class="btn small ghost" href="${esc(wa)}" target="_blank" rel="noopener">Send on WhatsApp</a></div></div>
        <details><summary style="cursor:pointer;font-weight:600;margin-bottom:12px">Change the price / re-send</summary>${quoteForm}</details>`;
    } else if (j.status === 'paid' || j.status === 'completed') {
      money_ = `<div class="paid-box"><div class="amt">${money(j.price_pence)} paid</div><div>Paid ${nice(j.paid_at, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></div>`;
    } else if (j.status === 'pending') {
      money_ = `<div class="quoted-box"><div class="amt">${money(j.price_pence)}</div><div>Booked online – the customer is paying now. If they don’t finish within 30 minutes the slot is released.</div></div>`;
    } else if (j.status === 'new') {
      money_ = quoteForm;
    } else {
      money_ = '<p>This job was cancelled.</p>';
    }

    $('#drawer').innerHTML = `
      <div class="d-head"><h2>${esc(j.name)}</h2><span class="badge s-${j.status}">${STATUS[j.status]}</span><button class="icon-btn" id="d-close" aria-label="Close">×</button></div>
      <div class="d-body">
        <div class="d-sec"><h3>Customer</h3>
          <dl class="kv"><dt>Phone</dt><dd>${esc(j.phone)}</dd><dt>Email</dt><dd>${esc(j.email)}</dd><dt>Address</dt><dd>${esc(addr)}</dd></dl>
          <div class="quick">
            <a class="btn small" href="tel:${esc(j.phone.replace(/\s/g, ''))}">Call</a>
            <a class="btn small ghost" href="https://wa.me/${intlPhone(j.phone)}" target="_blank" rel="noopener">WhatsApp</a>
            <a class="btn small ghost" href="mailto:${esc(j.email)}">Email</a>
            <a class="btn small ghost" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}" target="_blank" rel="noopener">Map</a>
          </div>
        </div>
        <div class="d-sec"><h3>The job</h3>
          <dl class="kv">
            <dt>Services</dt><dd>${esc((j.services || []).join(', '))}</dd>
            ${j.property_type ? `<dt>Property</dt><dd>${esc(j.property_type)}${j.storeys ? ', ' + esc(j.storeys) + ' storey' : ''}</dd>` : ''}
            ${j.preferred_date ? `<dt>Prefers</dt><dd>${nice(j.preferred_date, { weekday: 'long', day: 'numeric', month: 'long' })}</dd>` : ''}
            ${j.notes ? `<dt>Notes</dt><dd>${esc(j.notes).replace(/\n/g, '<br>')}</dd>` : ''}
            <dt>Requested</dt><dd>${nice(j.created_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</dd>
          </dl>
          ${(j.photo_urls || []).length ? `<div class="photos" style="margin-top:12px">${j.photo_urls.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="Customer photo"></a>`).join('')}</div>` : ''}
        </div>
        <div class="d-sec"><h3>Quote &amp; payment</h3>${money_}</div>
        ${j.status !== 'cancelled' ? `<div class="d-sec"><h3>Diary</h3>
          <div class="row">
            <div class="field"><label>Job date</label><input id="b-date" type="date" value="${j.scheduled_date || ''}"></div>
            <div class="field"><label>Time</label><select id="b-slot">${['any', 'am', 'pm'].map((s) => `<option value="${s}" ${j.scheduled_slot === s ? 'selected' : ''}>${SLOT[s]}</option>`).join('')}</select></div>
          </div>
          <label class="check"><input type="checkbox" id="b-notify" ${j.status === 'paid' ? 'checked' : ''}> Email ${esc(firstName)} the booking confirmation</label>
          <button class="btn small" id="b-save">Save date</button>
        </div>` : ''}
        <div class="d-sec"><h3>Private notes</h3>
          <textarea id="n-notes" placeholder="Only you can see these">${esc(j.admin_notes || '')}</textarea>
          <div class="quick"><button class="btn small ghost" id="n-save">Save notes</button></div>
        </div>
        <div class="quick" style="margin-bottom:30px">
          ${j.status === 'paid' ? '<button class="btn" id="s-done">✓ Mark job done</button>' : ''}
          ${j.status === 'completed' ? '<button class="btn ghost small" data-status="paid" id="s-undo">Undo “done”</button>' : ''}
          ${['new', 'quoted'].includes(j.status) ? '<button class="btn ghost small" id="s-cancel">Cancel job</button>' : ''}
        </div>
      </div>`;

    $('#d-close').onclick = closeJob;
    const on = (sel, fn) => { const el = $(sel, $('#drawer')); if (el) el.onclick = fn; };

    on('#copy-link', async () => { await navigator.clipboard.writeText(j.invoice_url); toast('Pay link copied'); });

    on('#q-send', async (e) => {
      const price = parseFloat($('#q-price').value);
      if (!(price >= 1)) return toast('Enter a price first');
      if (!confirm(`Send ${j.name} a quote for £${price.toFixed(2)}?`)) return;
      e.target.disabled = true; e.target.textContent = 'Sending…';
      try {
        await api('/api/admin/send-quote', { method: 'POST', body: { id: j.id, price, days_until_due: $('#q-days').value, message: $('#q-msg').value, scheduled_date: $('#q-date').value } });
        toast('Quote sent ✓'); await load(); openJob(j.id);
      } catch (ex) { toast(ex.message); e.target.disabled = false; e.target.textContent = 'Send quote'; }
    });

    const patch = async (body, msg) => {
      try { await api('/api/admin/jobs', { method: 'PATCH', body: { id: j.id, ...body } }); toast(msg); await load(); openJob(j.id); }
      catch (ex) { toast(ex.message); }
    };
    on('#b-save', () => patch({ scheduled_date: $('#b-date').value || null, scheduled_slot: $('#b-slot').value, notify: $('#b-notify').checked && !!$('#b-date').value }, 'Diary updated'));
    on('#n-save', () => patch({ admin_notes: $('#n-notes').value }, 'Notes saved'));
    on('#s-done', () => patch({ status: 'completed' }, 'Marked as done'));
    on('#s-undo', () => patch({ status: 'paid' }, 'Moved back to paid'));
    on('#s-cancel', () => confirm('Cancel this job?') && patch({ status: 'cancelled' }, 'Job cancelled'));
  }

  // ---------- Diary ----------
  function renderDiary() {
    $('#month-label').textContent = month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    const byDay = {};
    jobs.filter((j) => j.scheduled_date && j.status !== 'cancelled').forEach((j) => (byDay[j.scheduled_date] ||= []).push(j));

    const start = new Date(month); start.setDate(1 - ((month.getDay() + 6) % 7)); // Monday first
    const todayIso = iso(new Date());
    const offOn = (key) => timeOff.find((t) => t.start_date <= key && key <= t.end_date);
    let html = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<div class="dow">${d}</div>`).join('');
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const key = iso(d);
      const list = byDay[key] || [];
      const off = offOn(key);
      html += `<button class="day ${d.getMonth() !== month.getMonth() ? 'out' : ''} ${key === todayIso ? 'today' : ''} ${key === selectedDay ? 'sel' : ''} ${off ? 'off' : ''}" data-day="${key}">
        <span class="num">${d.getDate()}</span>${off ? `<span class="off-tag">${off.slot === 'am' ? 'AM off' : off.slot === 'pm' ? 'PM off' : 'Off'}</span>` : ''}
        ${list.map((j) => `<span class="pill s-${j.status}">${j.scheduled_slot === 'am' ? 'AM ' : j.scheduled_slot === 'pm' ? 'PM ' : ''}${esc(j.name.split(' ')[0])} ${esc(j.postcode.split(' ')[0])}</span>`).join('')}
        <span class="dots">${list.map((j) => `<span class="dot s-${j.status}"></span>`).join('')}</span>
      </button>`;
      const nextDay = new Date(d); nextDay.setDate(d.getDate() + 1);
      if (i === 34 && nextDay.getMonth() !== month.getMonth()) break; // 5 weeks is enough
    }
    $('#cal').innerHTML = html;
    $('#cal').querySelectorAll('.day').forEach((b) => (b.onclick = () => { selectedDay = b.dataset.day; renderDiary(); }));

    const dayJobs = byDay[selectedDay] || [];
    const selOff = offOn(selectedDay);
    $('#day-list').innerHTML = `<h3>${nice(selectedDay, { weekday: 'long', day: 'numeric', month: 'long' })}${selOff ? ` · <span style="color:var(--roof)">Time off${selOff.note ? ' – ' + esc(selOff.note) : ''}</span>` : ''}</h3>` +
      (dayJobs.length ? `<div class="job-list">${dayJobs.map(card).join('')}</div>` : '<p style="color:var(--muted)">No jobs booked.</p>');

    const unscheduled = jobs.filter((j) => j.status === 'paid' && !j.scheduled_date);
    $('#needs-date').innerHTML = unscheduled.length ? `<h3>Paid – needs a date (${unscheduled.length})</h3><div class="job-list">${unscheduled.map(card).join('')}</div>` : '';
    document.querySelectorAll('#day-list .job, #needs-date .job').forEach((el) => (el.onclick = () => openJob(el.dataset.id)));
  }
  $('#prev').onclick = () => { month.setMonth(month.getMonth() - 1); renderDiary(); };
  $('#next').onclick = () => { month.setMonth(month.getMonth() + 1); renderDiary(); };
  $('#today').onclick = () => { month = new Date(); month.setDate(1); selectedDay = iso(new Date()); renderDiary(); };
  $('#subscribe').onclick = async () => {
    try {
      const { webcal, https } = await api('/api/admin/calendar-link');
      const d = $('#drawer');
      d.innerHTML = `<div class="d-head"><h2>Add jobs to your phone</h2><button class="icon-btn" id="d-close">×</button></div>
        <div class="d-body">
          <p><b>iPhone:</b> tap the button below and choose <i>Subscribe</i>. Booked jobs will appear in your Calendar app and update by themselves.</p>
          <p><a class="btn" href="${esc(webcal)}">Subscribe on this phone</a></p>
          <p style="margin-top:22px"><b>Google Calendar (Android):</b> on a computer, open Google Calendar → <i>Other calendars</i> → <i>+</i> → <i>From URL</i>, and paste this link:</p>
          <input type="text" readonly value="${esc(https)}" onclick="this.select()">
          <p style="font-size:.85rem;color:var(--muted);margin-top:12px">Keep this link private – anyone with it can see your job list.</p>
        </div>`;
      d.hidden = false; $('#drawer-bg').hidden = false;
      $('#d-close').onclick = closeJob;
    } catch (e) { toast(e.message); }
  };

  // ---------- Time off ----------
  function renderTimeOff() {
    const today = iso(new Date());
    const PART = { all: 'All day', am: 'Morning', pm: 'Afternoon' };
    const fmt = (d) => nice(d, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    $('#to-list').innerHTML = timeOff.length ? timeOff.map((t) => `<div class="to-item ${t.end_date < today ? 'past' : ''}">
        <div><div class="when">${fmt(t.start_date)}${t.end_date !== t.start_date ? ' → ' + fmt(t.end_date) : ''}</div>
        <div class="note">${PART[t.slot] || 'All day'}${t.note ? ' · ' + esc(t.note) : ''}</div></div>
        <span style="flex:1"></span>
        <button class="btn ghost small" data-del="${t.id}">Remove</button></div>`).join('')
      : '<p class="hint" style="margin:0">No time off booked.</p>';
    $('#to-list').querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
      if (!confirm('Remove this time off? Customers will be able to book these dates again.')) return;
      try { await api('/api/admin/time-off?id=' + b.dataset.del, { method: 'DELETE' }); toast('Removed – dates open for booking'); await load(); }
      catch (e) { toast(e.message); }
    }));
  }
  $('#to-start').min = iso(new Date());
  $('#to-start').onchange = () => { $('#to-end').min = $('#to-start').value; if (!$('#to-end').value || $('#to-end').value < $('#to-start').value) $('#to-end').value = $('#to-start').value; };
  $('#to-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('/api/admin/time-off', { method: 'POST', body: { start_date: $('#to-start').value, end_date: $('#to-end').value || $('#to-start').value, slot: $('#to-slot').value, note: $('#to-note').value } });
      const clash = jobs.filter((j) => j.scheduled_date && j.scheduled_date >= $('#to-start').value && j.scheduled_date <= ($('#to-end').value || $('#to-start').value) && ['paid', 'quoted', 'pending'].includes(j.status));
      $('#to-form').reset();
      toast(clash.length ? `Blocked out. Heads up: ${clash.length} job(s) already booked in those dates – check the Diary.` : 'Blocked out – customers can’t book those dates');
      await load();
    } catch (ex) { toast(ex.message); }
  };

  // ---------- Prices & hours ----------
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let svcRows = [];
  const pounds = (p) => (p ? (p / 100).toFixed(p % 100 ? 2 : 0) : '');
  function renderSvcRows() {
    $('#svc-admin').innerHTML = svcRows.map((r, i) => `<div class="svc-row ${r.active === false ? 'off' : ''}">
      <input type="text" data-i="${i}" data-k="name" value="${esc(r.name)}" placeholder="Service name, e.g. Soffit cleaning">
      <div class="cell"><span>£</span><input type="number" min="0" step="0.01" inputmode="decimal" data-i="${i}" data-k="price" value="${esc(r.price)}" placeholder="On request"></div>
      <label class="tog"><input type="checkbox" data-i="${i}" data-k="active" ${r.active === false ? '' : 'checked'}> Bookable</label>
      <button type="button" class="del" data-del="${i}" aria-label="Remove service">×</button>
    </div>`).join('');
    $('#svc-admin').querySelectorAll('input').forEach((inp) => (inp.oninput = inp.onchange = () => {
      const r = svcRows[inp.dataset.i];
      if (inp.dataset.k === 'active') { r.active = inp.checked; inp.closest('.svc-row').classList.toggle('off', !inp.checked); }
      else r[inp.dataset.k] = inp.value;
    }));
    $('#svc-admin').querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => {
      if (!confirm(`Remove “${svcRows[b.dataset.del].name || 'this service'}”?`)) return;
      svcRows.splice(b.dataset.del, 1); renderSvcRows();
    }));
  }
  $('#svc-add').onclick = () => { svcRows.push({ name: '', price: '', active: true }); renderSvcRows(); $('#svc-admin .svc-row:last-child input').focus(); };

  async function loadPrices() {
    try {
      const { settings: st } = await api('/api/admin/settings');
      svcRows = st.services.map((sv) => ({ id: sv.id, name: sv.name, price: pounds(sv.price), active: sv.active !== false }));
      renderSvcRows();
      $('#pr-surcharge').value = pounds(st.surcharge_3plus);
      $('#pr-days').innerHTML = [1, 2, 3, 4, 5, 6, 0].map((d) =>
        `<label class="chip"><input type="checkbox" value="${d}" ${st.working_days.includes(d) ? 'checked' : ''}><span>${DAY_NAMES[d]}</span></label>`).join('');
      $('#pr-am').checked = !!st.slots.am; $('#pr-pm').checked = !!st.slots.pm;
      $('#pr-bh').checked = st.closed_bank_holidays !== false;
      $('#pr-cap').value = st.capacity_per_slot;
      $('#pr-notice').value = String(st.min_notice_days);
      $('#pr-ahead').value = String(st.max_days_ahead);
      if (!$('#pr-ahead').value) $('#pr-ahead').value = '60';
    } catch (e) { toast(e.message); }
  }
  $('#pr-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const { settings: saved } = await api('/api/admin/settings', { method: 'PUT', body: {
        services: svcRows.filter((r) => r.name.trim()),
        surcharge_3plus: $('#pr-surcharge').value,
        working_days: [...document.querySelectorAll('#pr-days input:checked')].map((i) => Number(i.value)),
        slots: { am: $('#pr-am').checked, pm: $('#pr-pm').checked },
        closed_bank_holidays: $('#pr-bh').checked,
        capacity_per_slot: $('#pr-cap').value, min_notice_days: $('#pr-notice').value, max_days_ahead: $('#pr-ahead').value,
      } });
      if (saved?.services) { svcRows = saved.services.map((sv) => ({ id: sv.id, name: sv.name, price: pounds(sv.price), active: sv.active !== false })); renderSvcRows(); }
      toast('Saved – the booking page is updated');
    } catch (ex) { toast(ex.message); }
  };

  // ---------- Demo data (only used in the preview) ----------
  function demoApi(path, opts) {
    const db = (window.__demo ||= (() => {
      const d = (n) => iso(new Date(Date.now() + n * 864e5));
      const now = new Date().toISOString();
      return [
        { id: '11111111-1111-1111-1111-111111111111', status: 'new', name: 'Sarah Jones', phone: '07700 900123', email: 'sarah@example.com', address: '14 Birch Road', town: 'Walsall', postcode: 'WS5 3AB', property_type: 'Semi-detached', storeys: '2', services: ['Gutters vacuumed / cleared', 'Fascia & gutter cleaning'], preferred_date: d(6), notes: 'Overflowing at the front above the porch.', created_at: now, photo_urls: [] },
        { id: '22222222-2222-2222-2222-222222222222', status: 'new', name: 'Dave Patel', phone: '07700 900456', email: 'dave@example.com', address: '3 Mill Lane', town: 'Aldridge', postcode: 'WS9 8QT', property_type: 'Detached', storeys: '2', services: ['Conservatory roof cleaning'], created_at: now, photo_urls: [] },
        { id: '33333333-3333-3333-3333-333333333333', status: 'quoted', name: 'Linda Hughes', phone: '07700 900789', email: 'linda@example.com', address: '27 Park View', town: 'Bloxwich', postcode: 'WS3 2LP', property_type: 'Terraced', storeys: '2', services: ['Gutters vacuumed / cleared'], price_pence: 6500, quoted_at: now, scheduled_date: d(4), scheduled_slot: 'am', invoice_url: 'https://invoice.stripe.com/', created_at: now, photo_urls: [] },
        { id: '44444444-4444-4444-4444-444444444444', status: 'paid', name: 'Mark Evans', phone: '07700 900321', email: 'mark@example.com', address: '9 Church St', town: 'Willenhall', postcode: 'WV13 1AA', property_type: 'Bungalow', storeys: '1', services: ['Gutters vacuumed / cleared', 'Cladding cleaning'], price_pence: 12000, paid_at: now, scheduled_date: d(1), scheduled_slot: 'pm', created_at: now, photo_urls: [] },
        { id: '55555555-5555-5555-5555-555555555555', status: 'paid', name: 'Amira Khan', phone: '07700 900654', email: 'amira@example.com', address: '41 Station Road', town: 'Darlaston', postcode: 'WS10 8BB', property_type: 'Semi-detached', storeys: '2', services: ['Fascia & gutter cleaning'], price_pence: 8500, paid_at: now, created_at: now, photo_urls: [] },
        { id: '66666666-6666-6666-6666-666666666666', status: 'completed', name: 'Gary Smith', phone: '07700 900987', email: 'gary@example.com', address: '2 Oak Close', town: 'Walsall', postcode: 'WS1 4XY', property_type: 'Detached', storeys: '2', services: ['Gutters vacuumed / cleared'], price_pence: 9000, paid_at: now, scheduled_date: d(-3), scheduled_slot: 'am', created_at: now, photo_urls: [] },
      ];
    })());
    const find = (id) => db.find((j) => j.id === id);
    const b = opts.body || {};
    if (path.startsWith('/api/admin/session')) return Promise.resolve({ ok: true, loggedIn: true });
    if (path === '/api/admin/jobs' && !opts.method) return Promise.resolve({ jobs: db });
    if (path.startsWith('/api/admin/jobs?id=')) return Promise.resolve({ job: find(path.split('=')[1]) });
    if (path === '/api/admin/jobs' && opts.method === 'PATCH') { Object.assign(find(b.id), b); delete find(b.id).notify; return Promise.resolve({}); }
    if (path === '/api/admin/send-quote') { Object.assign(find(b.id), { status: 'quoted', price_pence: Math.round(b.price * 100), quoted_at: new Date().toISOString(), scheduled_date: b.scheduled_date || null, quote_message: b.message, invoice_url: 'https://invoice.stripe.com/' }); return Promise.resolve({}); }
    window.__demoOff ||= [{ id: 'to1', start_date: (() => { const d = new Date(Date.now() + 9 * 864e5); return iso(d); })(), end_date: (() => { const d = new Date(Date.now() + 11 * 864e5); return iso(d); })(), slot: 'all', note: 'Holiday' }];
    window.__demoSettings ||= { services: [{ id: 'gutters', name: 'Gutters vacuumed / cleared', price: 6000, active: true }, { id: 'fascia', name: 'Fascia & gutter cleaning', price: 4500, active: true }, { id: 'conservatory', name: 'Conservatory roof cleaning', price: 7000, active: true }, { id: 'cladding', name: 'Cladding cleaning', price: null, active: true }, { id: 'repairs', name: 'Gutter repairs', price: null, active: true }], surcharge_3plus: 2000, working_days: [1, 2, 3, 4, 5, 6], closed_bank_holidays: true, slots: { am: true, pm: true }, capacity_per_slot: 2, min_notice_days: 1, max_days_ahead: 60 };
    if (path.startsWith('/api/admin/time-off') && !opts.method) return Promise.resolve({ timeOff: window.__demoOff });
    if (path.startsWith('/api/admin/time-off') && opts.method === 'POST') { window.__demoOff.push({ id: 'to' + Date.now(), ...b }); window.__demoOff.sort((x, y) => x.start_date.localeCompare(y.start_date)); return Promise.resolve({}); }
    if (path.startsWith('/api/admin/time-off') && opts.method === 'DELETE') { const id = path.split('=')[1]; window.__demoOff = window.__demoOff.filter((t) => t.id !== id); return Promise.resolve({}); }
    if (path === '/api/admin/settings' && !opts.method) return Promise.resolve({ settings: window.__demoSettings });
    if (path === '/api/admin/settings') return Promise.resolve({});
    if (path === '/api/admin/calendar-link') return Promise.resolve({ https: 'https://www.the-gutterguy.co.uk/api/calendar?token=…', webcal: '#' });
    return Promise.resolve({});
  }

  // ---------- Boot ----------
  (async () => {
    try {
      const { loggedIn } = await api('/api/admin/session');
      loggedIn ? start() : showLogin();
    } catch { showLogin(); }
  })();
})();

// Quote request form: shrinks photos in the browser, then sends everything to /api/request.
(function () {
  const form = document.getElementById('quote-form');
  const errorBox = document.getElementById('form-error');
  const btn = document.getElementById('submit-btn');
  const input = document.getElementById('photo-input');
  const zone = document.getElementById('drop-zone');
  const thumbs = document.getElementById('thumbs');
  const MAX = 3;
  let photos = []; // data URLs

  document.getElementById('year').textContent = new Date().getFullYear();
  const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  document.getElementById('preferred_date').min = tomorrow;

  function shrink(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, 1400 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that photo')); };
      img.src = url;
    });
  }

  function drawThumbs() {
    thumbs.innerHTML = '';
    photos.forEach((src, i) => {
      const fig = document.createElement('figure');
      fig.innerHTML = `<img alt="Photo ${i + 1}"><button type="button" aria-label="Remove photo">×</button>`;
      fig.querySelector('img').src = src;
      fig.querySelector('button').onclick = () => { photos.splice(i, 1); drawThumbs(); };
      thumbs.appendChild(fig);
    });
    zone.style.display = photos.length >= MAX ? 'none' : '';
  }

  async function addFiles(files) {
    for (const f of [...files].filter((f) => f.type.startsWith('image/'))) {
      if (photos.length >= MAX) break;
      try { photos.push(await shrink(f)); } catch (e) { showError(e.message); }
    }
    drawThumbs();
  }

  zone.onclick = () => input.click();
  zone.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
  zone.ondragover = (e) => { e.preventDefault(); };
  zone.ondrop = (e) => { e.preventDefault(); addFiles(e.dataTransfer.files); };
  input.onchange = () => { addFiles(input.files); input.value = ''; };

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.style.display = 'block';
    errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.style.display = 'none';
    const fd = new FormData(form);
    const data = Object.fromEntries(fd.entries());
    data.services = fd.getAll('services');
    data.photos = photos;

    if (!data.name.trim() || !data.phone.trim() || !data.email.trim() || !data.address.trim() || !data.postcode.trim()) {
      return showError('Please fill in your name, phone, email, address and postcode.');
    }
    if (!data.services.length) return showError('Please choose at least one service.');

    btn.disabled = true;
    btn.textContent = 'Sending…';
    try {
      if (window.GG_DEMO) { await new Promise((r) => setTimeout(r, 700)); }
      else {
        const res = await fetch('/api/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(out.error || 'Something went wrong – please try again or call 07460 941982.');
      }
      form.innerHTML = `<div class="success"><div class="tick"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M4 12l5 5L20 6"/></svg></div>
        <h3 style="font-size:1.5rem">Thanks – request sent!</h3>
        <p style="color:var(--muted)">Roy will email your quote to <strong></strong>, usually within 24 hours.<br>Need it sooner? Call <a href="tel:07460941982">07460 941982</a>.</p></div>`;
      form.querySelector('strong').textContent = data.email;
      form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
      showError(err.message);
      btn.disabled = false;
      btn.textContent = 'Send my request';
    }
  });
})();

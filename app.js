/* =====================================================
   IncidentHub — App Logic
   Requests go to /api/* which the local proxy.js server
   forwards to AWS API Gateway with CORS headers.
   ===================================================== */

const IS_PROXIED = location.protocol === 'http:' || location.protocol === 'https:';
const API_BASE   = IS_PROXIED ? '' : 'https://8f1hpjb7m5.execute-api.ap-southeast-2.amazonaws.com';
const API_PREFIX = IS_PROXIED ? '/api' : '';

function apiUrl(path) {
  return API_BASE + API_PREFIX + path;
}

/* ─────────────────────────────────────────
   STATE
   ───────────────────────────────────────── */
let incidents      = [];
let activeFilter   = '';
let activeSeverity = 'HIGH';

/* ─────────────────────────────────────────
   VIEW SWITCHING
   ───────────────────────────────────────── */
function showView(name) {
  document.querySelectorAll('.view').forEach(v => {
    v.classList.add('hidden');
    v.classList.remove('active');
  });
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  const view = document.getElementById(`view-${name}`);
  const btn  = document.getElementById(`nav-${name}`);

  if (view) {
    view.classList.remove('hidden');
    // Trigger reflow so animation fires
    void view.offsetWidth;
    view.classList.add('active');
  }
  if (btn) btn.classList.add('active');

  if (name === 'dashboard') loadIncidents();
}

/* ─────────────────────────────────────────
   API STATUS INDICATOR
   ───────────────────────────────────────── */
function setStatus(state, label) {
  const el = document.getElementById('api-status');
  const txt = document.getElementById('status-txt');
  el.className = `api-status ${state}`;
  txt.textContent = label;
}

/* ─────────────────────────────────────────
   LOAD INCIDENTS
   ───────────────────────────────────────── */
async function loadIncidents() {
  const list = document.getElementById('incident-list');
  const empty = document.getElementById('empty-state');

  // Loader
  list.innerHTML = `
    <div class="loading-wrap">
      <div class="ring"></div>
      <span>Fetching from AWS DynamoDB...</span>
    </div>`;
  empty.classList.add('hidden');

  const path = activeFilter
    ? `/incidents?severity=${encodeURIComponent(activeFilter)}`
    : '/incidents';

  try {
    const res = await fetch(apiUrl(path));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    incidents = Array.isArray(data)
      ? data
      : (data.incidents || data.items || data.data || []);

    // Sort newest-first
    incidents.sort((a, b) => {
      const ta = a.timestamp || a.createdAt || a.created_at || '';
      const tb = b.timestamp || b.createdAt || b.created_at || '';
      return tb.localeCompare(ta);
    });

    setStatus('connected', 'AWS Connected');
    renderIncidents();
    updateBento();
  } catch (err) {
    setStatus('error', 'API Error');
    list.innerHTML = `
      <div class="loading-wrap" style="gap:12px">
        <div style="font-size:2rem">⚠️</div>
        <span style="color:var(--c);font-weight:600">Could not reach the API</span>
        <span style="font-size:12px;color:var(--t3)">${esc(err.message)}</span>
        <button class="btn-ghost" onclick="loadIncidents()" style="margin-top:4px">Retry</button>
      </div>`;
    toast('error', 'Connection Failed', `${err.message} — Make sure proxy.js is running on port 3000.`);
  }
}

/* ─────────────────────────────────────────
   RENDER INCIDENT CARDS
   ───────────────────────────────────────── */
function renderIncidents() {
  const list  = document.getElementById('incident-list');
  const empty = document.getElementById('empty-state');
  list.innerHTML = '';

  if (!incidents.length) {
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');

  incidents.forEach((inc, i) => {
    const sev     = (inc.severity || 'LOW').toUpperCase();
    const alerted = ['HIGH', 'CRITICAL'].includes(sev);
    const ts      = relativeTime(inc.timestamp || inc.createdAt || inc.created_at);

    const card = document.createElement('div');
    card.className = 'icard';
    card.style.animationDelay = `${i * 0.045}s`;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Open incident: ${inc.title}`);
    card.onclick = () => openModal(inc);
    card.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') openModal(inc); };

    card.innerHTML = `
      <div class="icard-strip strip-${sev}"></div>
      <div class="icard-body">
        <div class="icard-top">
          <div class="icard-title">${esc(inc.title || 'Untitled')}</div>
          <span class="badge badge-${sev}">${sevDot(sev)} ${sev}</span>
          ${alerted ? `<span class="alert-pip"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> SNS</span>` : ''}
        </div>
        <div class="icard-desc">${esc(inc.description || '')}</div>
        <div class="icard-foot">
          <span class="meta-chip">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            ${esc(inc.reporter || 'Unknown')}
          </span>
          <span class="meta-chip">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ${ts}
          </span>
          <span class="status-tag">${esc(inc.status || 'OPEN')}</span>
        </div>
      </div>
      <div class="icard-arrow">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
      </div>`;

    list.appendChild(card);
  });
}

function sevDot(sev) {
  const size = '8';
  const shapes = {
    CRITICAL: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>`,
    HIGH:     `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/></svg>`,
    MEDIUM:   `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/></svg>`,
    LOW:      `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/></svg>`,
  };
  return shapes[sev] || '';
}

/* ─────────────────────────────────────────
   BENTO STATS
   ───────────────────────────────────────── */
function updateBento() {
  const total  = incidents.length;
  const crit   = incidents.filter(i => (i.severity || '').toUpperCase() === 'CRITICAL').length;
  const high   = incidents.filter(i => (i.severity || '').toUpperCase() === 'HIGH').length;
  const open   = incidents.filter(i => (i.status  || 'OPEN').toUpperCase() === 'OPEN').length;

  countUp('count-total',    total);
  countUp('count-critical', crit);
  countUp('count-high',     high);
  countUp('count-open',     open);

  // Ghost background numbers
  setEl('bento-bg-total', total);
  setEl('bento-bg-crit',  crit);
  setEl('bento-bg-high',  high);
  setEl('bento-bg-open',  open);
}

function countUp(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const from = parseInt(el.textContent) || 0;
  const dur  = 700;
  const t0   = performance.now();
  const tick = now => {
    const p = Math.min((now - t0) / dur, 1);
    const e = 1 - Math.pow(1 - p, 4); // ease-out-quart
    el.textContent = Math.round(from + (target - from) * e);
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

/* ─────────────────────────────────────────
   FILTER
   ───────────────────────────────────────── */
function setFilter(sev) {
  activeFilter = sev;
  document.querySelectorAll('.fpill').forEach(p => {
    p.classList.toggle('active', p.dataset.sev === sev);
  });
  loadIncidents();
}

/* ─────────────────────────────────────────
   SEVERITY SELECTOR
   ───────────────────────────────────────── */
function pickSev(val) {
  activeSeverity = val;
  document.getElementById('f-severity').value = val;
  document.querySelectorAll('.sev-btn').forEach(b => {
    b.classList.toggle('sel', b.dataset.v === val);
  });
}

/* ─────────────────────────────────────────
   SUBMIT INCIDENT
   ───────────────────────────────────────── */
async function submitIncident(e) {
  e.preventDefault();

  const payload = {
    title:       document.getElementById('f-title').value.trim(),
    description: document.getElementById('f-desc').value.trim(),
    severity:    activeSeverity,
    reporter:    document.getElementById('f-reporter').value.trim(),
  };

  if (!payload.title || !payload.description || !payload.reporter) {
    toast('error', 'Missing Fields', 'Please fill in all required fields.');
    return;
  }

  const btn   = document.getElementById('submit-btn');
  const idle  = document.getElementById('btn-idle');
  const busy  = document.getElementById('btn-busy');

  btn.disabled = true;
  idle.style.display = 'none';
  busy.style.display = 'flex';

  try {
    const res = await fetch(apiUrl('/incidents'), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    let data = {};
    try { data = await res.json(); } catch (_) {}

    if (res.ok || res.status === 201) {
      const alerted = ['HIGH', 'CRITICAL'].includes(activeSeverity);
      toast('success', 'Incident Filed',
        alerted
          ? `${activeSeverity} incident logged — SNS alert dispatched to responders.`
          : `${activeSeverity} incident logged to DynamoDB.`
      );
      document.getElementById('report-form').reset();
      document.getElementById('char-count').textContent = '0 / 1000';
      pickSev('HIGH');
      setTimeout(() => showView('dashboard'), 600);
    } else {
      const msg = data.message || data.error || `HTTP ${res.status}`;
      toast('error', 'Submission Failed', msg);
    }
  } catch (err) {
    toast('error', 'Network Error', 'Could not reach the API. Make sure proxy.js is running.');
  } finally {
    btn.disabled = false;
    idle.style.display = 'flex';
    busy.style.display = 'none';
  }
}

/* ─────────────────────────────────────────
   MODAL
   ───────────────────────────────────────── */
function openModal(inc) {
  const sev   = (inc.severity || 'LOW').toUpperCase();
  const alert = ['HIGH', 'CRITICAL'].includes(sev);
  const ts    = relativeTime(inc.timestamp || inc.createdAt || inc.created_at);

  document.getElementById('modal-body').innerHTML = `
    <div class="modal-sev-bar msb-${sev}"></div>
    <div class="modal-inner">
      <div class="modal-head">
        <span class="badge badge-${sev}">${sev}</span>
        ${alert ? `<span class="alert-pip"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> SNS Alerted</span>` : ''}
      </div>
      <div class="modal-title">${esc(inc.title || 'Untitled Incident')}</div>
      <div class="mfield">
        <div class="mfield-label">Description</div>
        <div class="mfield-val">${esc(inc.description || 'No description provided.')}</div>
      </div>
      <div class="mgrid">
        <div class="mfield">
          <div class="mfield-label">Reporter</div>
          <div class="mfield-val">${esc(inc.reporter || 'Unknown')}</div>
        </div>
        <div class="mfield">
          <div class="mfield-label">Status</div>
          <div class="mfield-val"><span class="status-tag">${esc(inc.status || 'OPEN')}</span></div>
        </div>
        <div class="mfield">
          <div class="mfield-label">Reported</div>
          <div class="mfield-val">${ts}</div>
        </div>
        <div class="mfield">
          <div class="mfield-label">SNS Alert</div>
          <div class="mfield-val">${alert ? 'Fired ✓' : 'Not triggered'}</div>
        </div>
      </div>
      <div class="mfield">
        <div class="mfield-label">Incident ID</div>
        <div class="mfield-mono">${esc(inc.incidentId || inc.id || 'N/A')}</div>
      </div>
    </div>`;

  document.getElementById('modal-bg').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modal-bg').classList.add('hidden');
  document.body.style.overflow = '';
}

function maybeCloseModal(e) {
  if (e.target === document.getElementById('modal-bg')) closeModal();
}

/* ─────────────────────────────────────────
   TOAST SYSTEM
   ───────────────────────────────────────── */
function toast(type, title, message, ms = 4500) {
  const stack = document.getElementById('toast-stack');
  const icons = {
    success: `<svg class="ti-success" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    error:   `<svg class="ti-error"   width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    info:    `<svg class="ti-info"    width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  };

  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `
    <div class="toast-ico">${icons[type] || icons.info}</div>
    <div>
      <div class="toast-title">${esc(title)}</div>
      <div class="toast-body">${esc(message)}</div>
    </div>`;

  stack.appendChild(el);

  const dismiss = () => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 240);
  };
  setTimeout(dismiss, ms);
  el.onclick = dismiss;
}

/* ─────────────────────────────────────────
   UTILITIES
   ───────────────────────────────────────── */
function relativeTime(ts) {
  if (!ts) return 'Unknown';
  try {
    const d    = new Date(ts);
    if (isNaN(d)) return ts;
    const diff = (Date.now() - d) / 1000;
    if (diff < 60)     return 'Just now';
    if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (_) { return ts; }
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ─────────────────────────────────────────
   INIT
   ───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Scroll header effect
  const hdr = document.getElementById('header');
  window.addEventListener('scroll', () => {
    hdr.classList.toggle('scrolled', window.scrollY > 8);
  }, { passive: true });

  // Textarea char counter
  const ta = document.getElementById('f-desc');
  const cc = document.getElementById('char-count');
  if (ta && cc) {
    ta.addEventListener('input', () => { cc.textContent = `${ta.value.length} / 1000`; });
  }

  // Escape key closes modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  // Initial data load
  loadIncidents();
});

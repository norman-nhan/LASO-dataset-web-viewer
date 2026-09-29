const $ = (id) => document.getElementById(id);
const state = { catalog: [], filtered: [], index: 0, data: null, aff: 0, rx: -0.35, ry: 0.7, zoom: 0.82 };

async function json(url) {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || response.statusText);
  return body;
}

async function loadCatalog() {
  showLoading(true, `Loading ${$('split').value} split`);
  try {
    const payload = await json(`/api/catalog?split=${$('split').value}`);
    state.catalog = payload.objects;
    $('classFilter').innerHTML = '<option value="">All classes</option>' + payload.classes.map(x => `<option>${escapeHtml(x)}</option>`).join('');
    $('splitLabel').textContent = `${payload.split.toUpperCase()} SPLIT`;
    applyFilters();
  } catch (error) { showError(error); }
}

function applyFilters() {
  const term = $('search').value.trim().toLowerCase(), cls = $('classFilter').value;
  state.filtered = state.catalog.filter(x => (!cls || x.class === cls) && (!term || x.class.toLowerCase().includes(term) || x.shape_id.toLowerCase().includes(term) || x.affordances.some(a => a.includes(term))));
  state.index = Math.min(state.index, Math.max(0, state.filtered.length - 1));
  renderList();
  if (state.filtered.length) loadObject(); else { showLoading(false); $('objectTitle').textContent = 'No matching objects'; }
}

function renderList() {
  $('resultCount').textContent = `${state.filtered.length.toLocaleString()} objects`;
  $('objectList').innerHTML = state.filtered.map((x, i) => `<button class="object-item ${i === state.index ? 'active' : ''}" data-i="${i}"><strong>${escapeHtml(x.class)} · ${x.affordances.length} affordance${x.affordances.length === 1 ? '' : 's'}</strong><small>${escapeHtml(x.shape_id)}</small></button>`).join('');
  $('objectList').querySelectorAll('button').forEach(button => button.onclick = () => { state.index = +button.dataset.i; loadObject(); });
  $('objectList').querySelector('.active')?.scrollIntoView({ block: 'nearest' });
  $('position').textContent = state.filtered.length ? `${state.index + 1} / ${state.filtered.length}` : '0 / 0';
}

async function loadObject() {
  const item = state.filtered[state.index]; if (!item) return;
  renderList(); showLoading(true, 'Loading point cloud');
  try {
    state.data = await json(`/api/object?split=${$('split').value}&shape_id=${encodeURIComponent(item.shape_id)}`);
    state.aff = 0; state.rx = -0.35; state.ry = 0.7; state.zoom = 0.82;
    renderDetails(); draw(); showLoading(false);
  } catch (error) { showError(error); }
}

function renderDetails() {
  const d = state.data, a = d.annotations[state.aff];
  $('objectTitle').textContent = d.class;
  $('shapeId').textContent = d.shape_id;
  $('pointCount').textContent = d.point_count.toLocaleString();
  $('activeCount').textContent = a.active_points.toLocaleString();
  $('coverage').textContent = `${(100 * a.active_points / d.point_count).toFixed(1)}%`;
  $('affordances').innerHTML = d.annotations.map((x, i) => `<button class="chip ${i === state.aff ? 'selected' : ''}" data-i="${i}">${escapeHtml(x.affordance.replaceAll('_', ' '))}</button>`).join('');
  $('affordances').querySelectorAll('button').forEach(b => b.onclick = () => { state.aff = +b.dataset.i; renderDetails(); draw(); });
  $('primaryQuestion').textContent = a.questions[0] || 'No question provided.';
  $('questionCount').textContent = `(${a.questions.length})`;
  $('questions').innerHTML = a.questions.slice(1).map(x => `<li>${escapeHtml(x)}</li>`).join('') || '<li>No variants</li>';
  $('explanations').innerHTML = a.explanations.map(x => `<li>${escapeHtml(x)}</li>`).join('') || '<li>None provided</li>';
  $('answers').innerHTML = a.answers.map(x => `<li>${escapeHtml(x)}</li>`).join('') || '<li>None provided</li>';
  $('center').textContent = d.center.map(x => x.toFixed(4)).join(', ');
  $('scale').textContent = d.scale.toFixed(5);
}

const canvas = $('viewer'), ctx = canvas.getContext('2d');
function draw() {
  if (!state.data) return;
  const rect = canvas.getBoundingClientRect(), ratio = devicePixelRatio || 1;
  if (canvas.width !== Math.round(rect.width * ratio) || canvas.height !== Math.round(rect.height * ratio)) { canvas.width = Math.round(rect.width * ratio); canvas.height = Math.round(rect.height * ratio); }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, rect.width, rect.height);
  const cy = Math.cos(state.ry), sy = Math.sin(state.ry), cx = Math.cos(state.rx), sx = Math.sin(state.rx);
  const size = Math.min(rect.width, rect.height) * 0.42 * state.zoom, mask = state.data.annotations[state.aff].mask, only = $('onlyMask').checked;
  const projected = [];
  state.data.points.forEach((p, i) => {
    if (only && mask[i] <= .5) return;
    const x1 = p[0] * cy + p[2] * sy, z1 = -p[0] * sy + p[2] * cy;
    const y1 = p[1] * cx - z1 * sx, z2 = p[1] * sx + z1 * cx;
    projected.push([rect.width / 2 + x1 * size, rect.height * 0.45 - y1 * size, z2, mask[i] > .5]);
  });
  projected.sort((a,b) => a[2] - b[2]);
  for (const p of projected) {
    const depth = (p[2] + 1) / 2, radius = Math.max(1.2, 2.2 + depth * 1.3) * Math.min(1.35, state.zoom);
    ctx.beginPath(); ctx.arc(p[0], p[1], radius, 0, Math.PI * 2);
    ctx.fillStyle = p[3] ? `rgba(242,116,55,${.72 + depth * .25})` : `rgba(91,125,111,${.28 + depth * .42})`; ctx.fill();
  }
}

let drag = null;
canvas.addEventListener('pointerdown', e => { drag = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => { if (!drag) return; state.ry += (e.clientX-drag[0])*.009; state.rx += (e.clientY-drag[1])*.009; drag=[e.clientX,e.clientY]; draw(); });
canvas.addEventListener('pointerup', () => drag = null);
canvas.addEventListener('wheel', e => { e.preventDefault(); state.zoom = Math.max(.25, Math.min(3.5, state.zoom * Math.exp(-e.deltaY*.001))); draw(); }, {passive:false});
canvas.addEventListener('dblclick', resetView);
function resetView(){ state.rx=-.35;state.ry=.7;state.zoom=.82;draw(); }
function move(delta){ if (!state.filtered.length) return; state.index=(state.index+delta+state.filtered.length)%state.filtered.length;loadObject(); }
function showLoading(on, text='Loading'){ $('loading').classList.toggle('hidden', !on); $('loading').lastChild.textContent=text; }
function showError(error){ showLoading(false); $('objectTitle').textContent='Could not load dataset'; $('primaryQuestion').textContent=error.message; console.error(error); }
function escapeHtml(value){ const d=document.createElement('div');d.textContent=value;return d.innerHTML; }

$('split').onchange = () => { state.index=0; loadCatalog(); };
$('classFilter').onchange = () => { state.index=0; applyFilters(); };
$('search').oninput = () => { state.index=0; applyFilters(); };
$('prev').onclick = () => move(-1); $('next').onclick = () => move(1);
$('resetView').onclick = resetView; $('onlyMask').onchange = draw;
window.addEventListener('resize', draw);
window.addEventListener('keydown', e => { if (document.activeElement.tagName === 'INPUT') return; if(e.key==='ArrowLeft'||e.key==='ArrowUp')move(-1);if(e.key==='ArrowRight'||e.key==='ArrowDown')move(1); });
loadCatalog();

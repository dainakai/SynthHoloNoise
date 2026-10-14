import { getLanguage, setLanguage, t } from './i18n.js';

const $ = id => document.getElementById(id);
let worker, ready = false, busy = false, pending = null, result = null, engineFailed = false;
let inputBytes, inputId = 0, inputName = 'sample-clean.png', isSample = true, serial = 0;
let submittedSettings = null, resultSettings = null, elapsed = null, debounce, inputRead = 0;
let statusState = {key:'initial', values:{}, error:false, details:''};
const requests = new Map();
for (let n = 1; n <= 11; n++) {
  const id = String(n).padStart(3, '0');
  $('preset').add(new Option(id, id, false, n === 11));
}

function renderStatus() {
  const {key, values, error, details} = statusState;
  $('status').textContent = t(key, values) + (key === 'complete' && result?.metadata.resampled ? ` ${t('resampled')}` : '');
  $('status').classList.toggle('error', error);
  $('error-details').hidden = !details;
  $('error-message').textContent = details;
}
function status(key, values = {}, error = false, details = '') {
  statusState = {key, values, error, details};
  $('error-details').open = false;
  renderStatus();
}
function renderEngine() {
  const key = engineFailed ? 'engineError' : busy ? 'engineBusy' : ready ? 'engineReady' : 'engineLoading';
  $('engine-text').textContent = t(key);
  $('engine-badge').dataset.state = engineFailed ? 'error' : busy ? 'busy' : ready ? 'ready' : 'loading';
}
function settings(action = 'generate') {
  const strength = Number($('strength-number').value), seed = Number($('seed').value);
  if ($('strength-number').value === '' || !Number.isFinite(strength) || strength < 0 || strength > 2) throw new Error('invalidStrength');
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 4294967295 || $('seed').value === '') throw new Error('invalidSeed');
  return {preset:$('preset').value, strength, seed, camera:$('camera').value, variant:$('variant').value,
    value_range:$('value-range').value === 'auto' ? null : $('value-range').value.split(',').map(Number),
    input_id:inputId, input_name:inputName, action};
}
function resultIsCurrent() {
  try { return !!result && resultSettings === JSON.stringify(settings()); } catch { return false; }
}
function updateButtons() {
  const usable = ready && !busy && !pending && resultIsCurrent();
  $('generate').disabled = !ready || busy || !inputBytes;
  $('next-frame').disabled = !usable;
  for (const id of ['download','metadata','raw-noise']) $(id).disabled = !usable;
  document.querySelector('.results').setAttribute('aria-busy', String(busy));
  renderEngine();
}
function fmt(value) {
  if (value !== 0 && Math.abs(value) < .001) return value.toExponential(1);
  return Math.abs(value) >= 1000 ? value.toFixed(2) : value === 0 ? '0' : Number(value.toPrecision(5)).toString();
}
function renderResultText() {
  $('input-name').textContent = isSample ? t('sampleName') : inputName;
  $('noisy-preview').alt = t(result ? 'noisyAlt' : 'noisyPendingAlt');
  $('difference-scale').title = t('differenceRangeTitle');
  if (!result) {
    $('frame-info').textContent = t('framePending');
    $('display-scale').textContent = t('displayPending');
    $('difference-scale').textContent = t('differencePending');
    $('stats-unit').textContent = t('statsPending');
    $('download').textContent = t('saveNoisy');
    $('input-info').textContent = isSample ? '1024 × 1024 · uint8' : t('checkingInput');
    return;
  }
  const m = result.metadata;
  $('input-info').textContent = `${m.shape[1]} × ${m.shape[0]} · ${m.dtype}`;
  $('frame-info').textContent = t('frame', {frame:m.frame_index, template:m.template_id});
  $('display-scale').textContent = t('displayRange', {range:result.display_range.map(fmt).join(' – ')});
  $('difference-scale').textContent = t('differenceRange', {limit:fmt(result.difference_limit)});
  $('stats-unit').textContent = t('statsRange', {range:m.value_range.map(fmt).join(' – '), clipped:(m.clipped_fraction * 100).toFixed(3)});
  $('download').textContent = t('saveNoisyFormat', {format:result.extension.toUpperCase()});
}
function clearResult() {
  result = null; resultSettings = null; window.shnLastMetadata = null;
  for (const key of ['mean','std','min','max']) $(`stat-${key}`).textContent = '—';
  for (const id of ['clean-preview','noisy-preview','difference-preview']) $(id).hidden = true;
  $('difference-placeholder').hidden = false;
  renderResultText();
  updateButtons();
}
function run(action = 'generate') {
  clearTimeout(debounce);
  if (!ready || !inputBytes) { pending = action; return; }
  if (busy) { pending = action; updateButtons(); return; }
  pending = null;
  try {
    const config = settings(action), id = ++serial;
    submittedSettings = JSON.stringify({...config, action:'generate'});
    busy = true; updateButtons(); status('computing');
    requests.set(id, {start:performance.now(), settings:submittedSettings});
    worker.postMessage({id, config, bytes:inputBytes});
  } catch (error) { status(error.message, {}, true); updateButtons(); }
}
function show(data, request) {
  result = data; resultSettings = request.settings;
  for (const kind of ['clean','noisy','difference']) {
    $(`${kind}-preview`).src = `data:image/png;base64,${data[kind]}`;
    $(`${kind}-preview`).hidden = false;
  }
  $('difference-placeholder').hidden = true;
  for (const key of ['mean','std','min','max']) $(`stat-${key}`).textContent = fmt(data.metadata.difference[key]);
  elapsed = ((performance.now() - request.start) / 1000).toFixed(2);
  renderResultText();
  status('complete', {elapsed, ...data.metadata});
  // Public result metadata supports reproducibility and integration checks.
  window.shnLastMetadata = structuredClone(data.metadata);
}
function boot() {
  worker = new Worker('./worker.js', {type:'module'});
  worker.onmessage = ({data}) => {
    if (data.type === 'stage') status(data.key, data.values);
    if (data.type === 'ready') {
      ready = true; updateButtons();
      const action = pending || 'generate'; pending = null; run(action);
    }
    if (data.type === 'fatal') {
      ready = false; engineFailed = true; busy = false; pending = null;
      updateButtons(); status('engineFailed', {}, true, data.message);
    }
    if (data.type === 'result' || data.type === 'error') {
      const request = requests.get(data.id);
      requests.delete(data.id);
      if (!pending) {
        if (data.type === 'result') {
          show(data.result, request);
          try { settings(); } catch (error) { status(error.message, {}, true); }
        }
        else { clearResult(); status(data.key || 'computationFailed', {}, true, data.message); }
      }
      busy = false; updateButtons();
      if (pending) { const action = pending; pending = null; run(action); }
    }
  };
  worker.onerror = event => {
    ready = false; engineFailed = true; busy = false; pending = null;
    updateButtons(); status('engineFailed', {}, true, event.message || '');
  };
}
function changed() {
  clearTimeout(debounce);
  try {
    if (JSON.stringify(settings()) === submittedSettings) {
      pending = null;
      updateButtons();
      if (!busy && resultIsCurrent()) status('complete', {elapsed, ...result.metadata});
      return;
    }
  } catch (error) { pending = null; updateButtons(); status(error.message, {}, true); return; }
  updateButtons();
  if (busy) pending = 'generate';
  debounce = setTimeout(() => run(), 200);
}
$('strength').addEventListener('input', () => { $('strength-number').value = $('strength').value; changed(); });
for (const event of ['input','change']) $('strength-number').addEventListener(event, () => { $('strength').value = $('strength-number').value; changed(); });
for (const id of ['preset','seed','camera','variant','value-range']) $(id).addEventListener('change', changed);
$('seed').addEventListener('input', changed);
$('new-seed').onclick = () => { $('seed').value = crypto.getRandomValues(new Uint32Array(1))[0]; changed(); };
$('generate').onclick = () => run();
$('next-frame').onclick = () => run('next');
$('open-file').onclick = () => $('upload').click();
function acceptInput(bytes, name, sample) {
  inputBytes = bytes; inputId++; inputName = name; isSample = sample;
  clearResult();
  run();
}
$('upload').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  const revision = ++inputRead;
  if (file.size > 32 * 1024 * 1024) { status('fileTooLarge', {}, true); event.target.value = ''; return; }
  try {
    const bytes = await file.arrayBuffer();
    if (revision === inputRead) acceptInput(bytes, file.name, false);
  } catch (error) { if (revision === inputRead) status('fileFailed', {}, true, error.message); }
  finally { event.target.value = ''; }
});
async function sample() {
  const revision = ++inputRead;
  try {
    const response = await fetch('./assets/clean.png');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    if (revision !== inputRead) return;
    $('upload').value = ''; $('value-range').value = 'auto';
    acceptInput(bytes, 'sample-clean.png', true);
  } catch (error) { if (revision === inputRead) status('sampleFailed', {}, true, error.message); }
}
$('reset-input').onclick = sample;
function download(blob, name) {
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = name;
  link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
function decoded(text) { return Uint8Array.from(atob(text), c => c.charCodeAt(0)); }
function basename() { const m = result.metadata; return `SHN-${m.preset}-s${m.strength}-seed${m.seed}-frame${m.frame_index}`; }
$('download').onclick = () => { if (resultIsCurrent()) download(new Blob([decoded(result.output)], {type:result.extension === 'png' ? 'image/png' : 'application/octet-stream'}), `${basename()}.${result.extension}`); };
$('metadata').onclick = () => { if (resultIsCurrent()) download(new Blob([JSON.stringify(result.metadata, null, 2) + '\n'], {type:'application/json'}), `${basename()}.json`); };
$('raw-noise').onclick = () => { if (resultIsCurrent()) download(new Blob([decoded(result.raw_noise)], {type:'application/octet-stream'}), `${basename()}-addition.npy`); };
function renderLanguage() {
  for (const option of $('preset').options) option.textContent = t('presetOption', {id:option.value});
  renderEngine(); renderResultText(); renderStatus();
}
document.addEventListener('languagechange', renderLanguage);
for (const button of document.querySelectorAll('[data-language]')) button.onclick = () => setLanguage(button.dataset.language);
setLanguage(getLanguage());
boot(); sample();

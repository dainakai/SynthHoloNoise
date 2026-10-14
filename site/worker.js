import { loadPyodide } from 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.mjs';

const base = new URL('./python/synthholonoise/', import.meta.url);
const stage = (key, values = {}) => self.postMessage({type:'stage', key, values});
async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`File download failed (${response.status}): ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}
let runtime, catalog;
const boot = (async () => {
  stage('loadingPython');
  runtime = await loadPyodide();
  stage('loadingPackages');
  await runtime.loadPackage(['numpy', 'scipy', 'opencv-python', 'pillow']);
  const root = '/home/pyodide/synthholonoise';
  runtime.FS.mkdirTree(`${root}/data/templates`);
  for (const file of ['__init__.py', 'core.py', 'cli.py', 'data/catalog.json']) {
    runtime.FS.writeFile(`${root}/${file}`, await fetchBytes(new URL(file, base)));
  }
  catalog = JSON.parse(runtime.FS.readFile(`${root}/data/catalog.json`, {encoding:'utf8'}));
  runtime.runPython(`
import base64, hashlib, io, json, warnings
import numpy as np
from PIL import Image
from synthholonoise import NoiseGenerator
warnings.filterwarnings('ignore', message='SHN templates were calibrated')
_generator = None
_config_key = None
_input_id = None
_image = None
_input_hash = None

def png_preview(array):
    im = Image.fromarray(array)
    im.thumbnail((640, 640), Image.Resampling.BOX)
    buf = io.BytesIO()
    im.save(buf, format='PNG')
    return base64.b64encode(buf.getvalue()).decode()

def browser_apply():
    global _generator, _config_key, _input_id, _image, _input_hash
    config = json.loads(config_json)
    if _input_id != config['input_id']:
        payload = bytes(input_bytes.to_py())
        _input_hash = hashlib.sha256(payload).hexdigest()
        if config['input_name'].lower().endswith('.npy'):
            candidate = np.load(io.BytesIO(payload), allow_pickle=False)
        else:
            with Image.open(io.BytesIO(payload)) as source:
                candidate = np.asarray(source).copy()
                if candidate.dtype == np.int32 and source.mode == 'I' and config['input_name'].lower().endswith('.png') and candidate.min() >= 0 and candidate.max() <= 65535:
                    candidate = candidate.astype(np.uint16)
        if candidate.ndim != 2:
            raise ValueError('SHN_INVALID_DIMENSIONS')
        if min(candidate.shape) < 2 or max(candidate.shape) > 2048:
            raise ValueError('SHN_INVALID_SIZE')
        _image = candidate
        _input_id = config['input_id']
    key = json.dumps({k: config[k] for k in ['preset','camera','variant','seed','strength','value_range','input_id']}, sort_keys=True)
    if config['action'] != 'next' or _config_key != key:
        _generator = NoiseGenerator(preset=config['preset'], camera=config['camera'], variant=config['variant'], seed=config['seed'], strength=config['strength'])
        _config_key = key
    result = _generator.apply(_image, value_range=config['value_range'], return_details=True)
    result.metadata['input_sha256'] = _input_hash
    result.metadata['input_name'] = config['input_name']
    result.metadata['runtime'] = 'Pyodide 314.0.7'
    lo, hi = np.percentile(np.concatenate([_image.ravel(), result.image.ravel()]), [0.5,99.5])
    if hi <= lo:
        lo, hi = result.metadata['value_range']
    def gray(a):
        return np.clip(np.rint((a.astype(np.float64)-lo)/(hi-lo)*255),0,255).astype(np.uint8)
    limit = float(np.max(np.abs(result.difference)))
    d = result.difference / max(limit, 1e-30)
    white = np.array([247.,247.,247.])
    red = np.array([178.,24.,43.])
    blue = np.array([33.,102.,172.])
    colors = white + np.maximum(d,0)[...,None]*(red-white) + np.maximum(-d,0)[...,None]*(blue-white)
    buf = io.BytesIO()
    if result.image.dtype.kind == 'u':
        Image.fromarray(result.image).save(buf, format='PNG')
        extension = 'png'
    else:
        np.save(buf, result.image, allow_pickle=False)
        extension = 'npy'
    raw = io.BytesIO()
    np.save(raw, result.noise, allow_pickle=False)
    return json.dumps({
        'clean': png_preview(gray(_image)),
        'noisy': png_preview(gray(result.image)),
        'difference': png_preview(np.clip(np.rint(colors),0,255).astype(np.uint8)),
        'display_range': [float(lo),float(hi)], 'difference_limit':limit,
        'output': base64.b64encode(buf.getvalue()).decode(), 'extension': extension,
        'raw_noise': base64.b64encode(raw.getvalue()).decode(),
        'metadata':result.metadata,
    })
`);
  return runtime;
})();

boot.then(() => self.postMessage({type:'ready'})).catch(error => self.postMessage({type:'fatal', message:String(error)}));

self.onmessage = async event => {
  const {id, config, bytes} = event.data;
  try {
    await boot;
    const preset = catalog.presets.find(p => p.id === config.preset);
    const profile = preset.templates.find(p => p.camera === config.camera && p.variant === config.variant);
    const path = `/home/pyodide/synthholonoise/data/${profile.file}`;
    if (!runtime.FS.analyzePath(path).exists) {
      stage('loadingTemplate', {preset:config.preset, size:(profile.bytes/1024/1024).toFixed(1)});
      runtime.FS.writeFile(path, await fetchBytes(new URL(`data/${profile.file}`, base)));
    }
    runtime.globals.set('input_bytes', new Uint8Array(bytes));
    runtime.globals.set('config_json', JSON.stringify(config));
    const result = JSON.parse(runtime.runPython('browser_apply()'));
    runtime.globals.delete('input_bytes');
    self.postMessage({type:'result', id, result});
  } catch (error) {
    self.postMessage({type:'error', id, key:errorKey(String(error)), message:String(error)});
  }
};

// Keep machine-readable stages separate from interface language. Python remains unchanged.
function errorKey(message) {
  if (message.includes('SHN_INVALID_DIMENSIONS')) return 'invalidDimensions';
  if (message.includes('SHN_INVALID_SIZE')) return 'invalidSize';
  if (message.includes('Floating-point images require value_range')) return 'rangeRequired';
  if (message.includes('image dtype must be')) return 'invalidDtype';
  if (message.includes('image contains NaN or infinity')) return 'nonfiniteInput';
  if (message.includes('image values fall outside value_range') || message.includes('value_range exceeds the storage dtype')) return 'inputOutOfRange';
  if (/cannot identify image file|Cannot load file containing pickled data|Object arrays cannot be loaded|Failed to interpret file/.test(message)) return 'invalidFile';
  if (/File download failed|Failed to fetch|NetworkError|Load failed/.test(message)) return 'templateFailed';
  return 'computationFailed';
}

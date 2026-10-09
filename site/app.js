const $ = id => document.getElementById(id);
let worker, ready = false, busy = false, pending = null, result = null;
let inputBytes, inputId = 0, inputName = 'sample-clean.png', serial = 0;
let submittedSettings = null;
const requestTimes = new Map();
for (let n=1; n<=11; n++) {
  const id = String(n).padStart(3,'0');
  $('preset').add(new Option(`Preset ${id}`, id, false, n===11));
}

function status(text, error=false) { $('status').textContent=text; $('status').classList.toggle('error',error); }
function exportEnabled(enabled) { for (const id of ['download','metadata','raw-noise']) $(id).disabled=!enabled; }
function setBusy(value) {
  busy=value;
  $('generate').disabled=!ready||value;
  $('next-frame').disabled=!ready||value||!result;
  exportEnabled(!value&&!!result);
  $('engine-badge').lastChild.textContent=value?' 計算中':(ready?' ブラウザ内で実行中':' 準備中');
}
function settings(action) {
  const strength=Number($('strength-number').value), seed=Number($('seed').value);
  if (!Number.isFinite(strength)||strength<0||strength>2) throw new Error('デモの強度は0〜2で指定してください。');
  if (!Number.isSafeInteger(seed)||seed<0||seed>4294967295||$('seed').value==='') throw new Error('シードは0〜4294967295の整数で指定してください。');
  return {preset:$('preset').value, strength, seed, camera:$('camera').value, variant:$('variant').value,
    value_range:$('value-range').value==='auto'?null:$('value-range').value.split(',').map(Number),
    input_id:inputId,input_name:inputName,action};
}
function run(action='generate') {
  clearTimeout(debounce);
  if (!ready||!inputBytes) { pending=action; return; }
  if (busy) { pending=action; exportEnabled(false); return; }
  try {
    const config=settings(action), id=++serial;
    submittedSettings=JSON.stringify({...config,action:'generate'});
    setBusy(true); status('ノイズを計算しています。');
    requestTimes.set(id,performance.now());
    worker.postMessage({id,config,bytes:inputBytes});
  } catch(error) { result=null;exportEnabled(false);status(error.message,true); }
}
function fmt(value) { if(value!==0&&Math.abs(value)<.001)return value.toExponential(1); return Math.abs(value)>=1000?value.toFixed(2):(value===0?'0':Number(value.toPrecision(5)).toString()); }
function show(data,id) {
  result=data;
  $('clean-preview').src=`data:image/png;base64,${data.clean}`;
  $('noisy-preview').src=`data:image/png;base64,${data.noisy}`;
  $('noisy-preview').alt='SHNを追加した合成ホログラム';
  $('difference-preview').src=`data:image/png;base64,${data.difference}`;
  $('difference-preview').hidden=false; $('difference-placeholder').hidden=true;
  const m=data.metadata;
  for(const key of ['mean','std','min','max']) $(`stat-${key}`).textContent=fmt(m.difference[key]);
  $('input-info').textContent=`${m.shape[1]} × ${m.shape[0]} · ${m.dtype}`;
  $('frame-info').textContent=`フレーム ${m.frame_index} · Template ${m.template_id}`;
  $('display-scale').textContent=`Clean / Noisy 共通の表示範囲：${data.display_range.map(fmt).join('〜')}（表示のみ）`;
  $('difference-scale').textContent=`−${fmt(data.difference_limit)} ← 0 → +${fmt(data.difference_limit)}`;
  $('stats-unit').textContent=`入力単位での差分。値域 ${m.value_range.map(fmt).join('〜')}。範囲外への追加 ${(m.clipped_fraction*100).toFixed(3)}%。`;
  const elapsed=((performance.now()-requestTimes.get(id))/1000).toFixed(2);
  requestTimes.delete(id);
  status(`計算完了 · ${elapsed}秒 · Preset ${m.preset} / 強度 ${m.strength} / シード ${m.seed}。${m.resampled?' 入力サイズに合わせてテンプレートを補間しています。':''}`);
  // Public, read-only result metadata supports reproducibility and integration checks.
  window.shnLastMetadata=structuredClone(m);
}
function boot() {
  worker=new Worker('./worker.js',{type:'module'});
  worker.onmessage=({data})=>{
    if(data.type==='stage') status(data.text);
    if(data.type==='ready') { ready=true;setBusy(false);const action=pending||'generate';pending=null;run(action); }
    if(data.type==='fatal') { ready=false;setBusy(false);status(`実行環境を読み込めませんでした。ネットワーク接続を確認してページを再読み込みしてください。 ${data.message}`,true); }
    if(data.type==='result'||data.type==='error') {
      if(!pending) {
        if(data.type==='result') show(data.result,data.id);
        else { result=null; window.shnLastMetadata=null; status(data.message.split('\n').filter(Boolean).slice(-1)[0],true); }
      }
      setBusy(false);
      if(pending) { const action=pending;pending=null;run(action); }
    }
  };
  worker.onerror=event=>{ready=false;result=null;setBusy(false);status(`実行環境の読み込みに失敗しました。ページを再読み込みしてください。${event.message||''}`,true);};
}
let debounce;
function changed() {
  clearTimeout(debounce);
  try {
    if(JSON.stringify(settings('generate'))===submittedSettings) {
      pending=null;
      return;
    }
  } catch(error) { result=null; exportEnabled(false); status(error.message,true); return; }
  exportEnabled(false);
  if(busy) pending='generate';
  debounce=setTimeout(()=>run(),200);
}
$('strength').addEventListener('input',()=>{$('strength-number').value=$('strength').value;changed();});
$('strength-number').addEventListener('change',()=>{$('strength').value=$('strength-number').value;changed();});
for(const id of ['preset','seed','camera','variant','value-range']) $(id).addEventListener('change',changed);
$('new-seed').onclick=()=>{$('seed').value=crypto.getRandomValues(new Uint32Array(1))[0];changed();};
$('generate').onclick=()=>run(); $('next-frame').onclick=()=>run('next');
$('open-file').onclick=()=>$('upload').click();
$('upload').addEventListener('change',async event=>{
  const file=event.target.files[0]; if(!file)return;
  if(file.size>32*1024*1024){status('ブラウザ版の入力上限は32 MBです。大きな画像にはPython版を使ってください。',true);return;}
  inputBytes=await file.arrayBuffer();inputId++;inputName=file.name;
  $('input-name').textContent=file.name; $('input-info').textContent='画素形式を確認しています';
  result=null;exportEnabled(false);run();
});
async function sample() {
  try {
    const response=await fetch('./assets/clean.png');
    if(!response.ok)throw new Error(`サンプルを取得できません (${response.status})`);
    inputBytes=await response.arrayBuffer();inputId++;inputName='sample-clean.png';
    $('input-name').textContent='サンプル：合成ホログラム';$('upload').value='';$('value-range').value='auto';
    result=null;exportEnabled(false);run();
  } catch(error){status(error.message,true);}
}
$('reset-input').onclick=sample;
function download(blob,name){const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);}
function decoded(text){return Uint8Array.from(atob(text),c=>c.charCodeAt(0));}
function basename(){const m=result.metadata;return `SHN-${m.preset}-s${m.strength}-seed${m.seed}-frame${m.frame_index}`;}
$('download').onclick=()=>{if(result)download(new Blob([decoded(result.output)],{type:result.extension==='png'?'image/png':'application/octet-stream'}),`${basename()}.${result.extension}`);};
$('metadata').onclick=()=>{if(result)download(new Blob([JSON.stringify(result.metadata,null,2)+'\n'],{type:'application/json'}),`${basename()}.json`);};
$('raw-noise').onclick=()=>{if(result)download(new Blob([decoded(result.raw_noise)],{type:'application/octet-stream'}),`${basename()}-addition.npy`);};
boot();sample();

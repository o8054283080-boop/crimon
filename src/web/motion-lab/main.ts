import "./motionLab.css";
import { AutoRigMotionProvider } from "./autoRigProvider.js";
import { createPngSequenceZip, createSpriteSheet } from "./export.js";
import type { CharacterType, FrameCount, MotionFps, MotionGenerationResult, MotionType, OutputSize } from "./types.js";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("アプリの表示先がありません。");
const appRoot = root;

const motions: Array<[MotionType, string]> = [["idle", "待機"], ["attack", "攻撃"], ["heal", "回復"], ["hit", "被弾"], ["buff", "バフ"], ["debuff", "デバフ"], ["defend", "防御"], ["victory", "勝利"], ["defeat", "倒れる"], ["skill", "スキル発動"]];
const characters: Array<[CharacterType, string]> = [["slime", "slime"], ["humanoid", "humanoid"], ["quadruped", "quadruped"], ["floating", "floating"], ["heavy", "heavy"], ["dragon", "dragon"]];
let source: File | null = null; let sourceUrl = ""; let result: MotionGenerationResult | null = null; let playing = false; let timer = 0; let frameIndex = 0; let aborter: AbortController | null = null;

root.innerHTML = `<main class="motion-lab">
  <header class="motion-lab__hero"><a href="../" class="motion-lab__back">← ゲームへ戻る</a><p class="motion-lab__eyebrow">CRIMON ASSET PIPELINE</p><h1>Motion Lab</h1><p>1枚の透明PNGを連続メッシュ化。制御点の動きを面全体へなめらかに伝え、外部送信も利用料もなくモーション素材を生成します。</p></header>
  <div class="motion-lab__grid"><section class="motion-lab__controls">
    <fieldset><legend><b>1</b> 画像入力</legend><label class="motion-lab__drop"><input id="source" type="file" accept="image/png"><span>透明背景PNGを選択</span><small>画像はこの端末のブラウザ内だけで処理します</small></label><div id="source-preview" class="motion-lab__source-preview">未選択</div></fieldset>
    <fieldset><legend><b>2</b> モーション種別</legend><div class="motion-lab__choices" id="motions">${motions.map(([v,l],i)=>`<label><input type="radio" name="motion" value="${v}" ${i===0?"checked":""}><span>${l}</span></label>`).join("")}</div></fieldset>
    <fieldset><legend><b>3</b> キャラクタータイプ</legend><div class="motion-lab__choices" id="characters">${characters.map(([v,l],i)=>`<label><input type="radio" name="character" value="${v}" ${i===0?"checked":""}><span>${l}</span></label>`).join("")}</div></fieldset>
    <fieldset><legend><b>4</b> 生成設定</legend><div class="motion-lab__settings">
      <label>フレーム数<select id="frames"><option>12</option><option>24</option><option selected>36</option></select></label>
      <label>FPS<select id="fps"><option>8</option><option>12</option><option selected>16</option><option>20</option><option>24</option></select></label>
      <label>1フレーム<select id="size"><option>256</option><option selected>384</option><option>512</option></select></label>
    </div></fieldset>
    <fieldset><legend><b>5</b> ローカル生成</legend><p class="motion-lab__note">透明境界から細かな連続メッシュと制御点を組み、顔を守りながら遅延揺れ・重心移動・反動を面全体へ伝えます。安全余白と全フレーム境界検査も自動です。APIキーや通信は不要です。</p><button id="generate" class="motion-lab__primary">無料でモーション生成</button><button id="cancel" class="motion-lab__secondary" hidden>生成を中止</button><p id="status" role="status" aria-live="polite"></p></fieldset>
  </section><section class="motion-lab__result"><div class="motion-lab__result-head"><div><p class="motion-lab__eyebrow">PREVIEW</p><h2>生成結果</h2></div><button id="play" disabled>▶ 再生</button></div><div id="stage" class="motion-lab__stage"><p>生成したフレームがここに表示されます</p></div><div id="info" class="motion-lab__info">フレーム — ・サイズ — ・容量 —</div><div id="film" class="motion-lab__film"></div>
    <div class="motion-lab__exports"><h3>書き出し</h3><button id="sheet" disabled>Sprite sheet PNG</button><button id="sequence" disabled>PNG連番（ZIP）</button><button disabled title="ブラウザ標準APIでは透過アニメーションを安定生成できません">Animated WebP（準備中）</button><p id="export-info"></p></div></section></div></main>`;

const $ = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
const status = $("#status");
$("#source").addEventListener("change", async (event) => {
  const file = (event.currentTarget as HTMLInputElement).files?.[0] ?? null;
  if (!file) return; if (file.type !== "image/png") { status.textContent = "PNG画像を選択してください。"; return; }
  if (sourceUrl) URL.revokeObjectURL(sourceUrl); source = file; sourceUrl = URL.createObjectURL(file);
  $("#source-preview").innerHTML = `<img src="${sourceUrl}" alt="入力画像プレビュー"><span>${file.name} ・ ${formatBytes(file.size)}</span>`;
  try { const bitmap = await createImageBitmap(file); const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height; const ctx=canvas.getContext("2d")!; ctx.drawImage(bitmap,0,0); const alpha=ctx.getImageData(0,0,bitmap.width,bitmap.height).data.some((_,i,a)=>i%4===3&&a[i]<255); bitmap.close(); status.textContent = alpha ? "透過情報を確認しました。" : "注意: 透明なピクセルが見つかりません。"; } catch { status.textContent="画像を読み込めませんでした。"; }
});

$("#generate").addEventListener("click", async () => {
  if (!source) { status.textContent = "先に透明背景PNGを選択してください。"; return; }

  cleanupResult(); aborter = new AbortController(); toggleBusy(true); const frames = Number(($("#frames") as HTMLSelectElement).value) as FrameCount;
  try {
    status.textContent=`自動リグを推定し、${frames}フレームをローカル生成中です。`;
    const provider=new AutoRigMotionProvider();
    result=await provider.generate({image:source,fileName:source.name,motion:checked<MotionType>("motion"),characterType:checked<CharacterType>("character"),frameCount:frames,fps:Number(($("#fps") as HTMLSelectElement).value) as MotionFps,size:Number(($("#size") as HTMLSelectElement).value) as OutputSize,extraInstruction:"",signal:aborter.signal});
    renderResult(); status.textContent="ローカルモーションの生成が完了しました。";
  } catch(error) { status.textContent=error instanceof Error ? error.message : "生成に失敗しました。"; } finally { aborter=null; toggleBusy(false); }
});
$("#cancel").addEventListener("click",()=>aborter?.abort());
$("#play").addEventListener("click",()=>{ playing=!playing; $("#play").textContent=playing?"■ 停止":"▶ 再生"; if(playing) scheduleFrame(); else window.clearTimeout(timer); });
$("#sheet").addEventListener("click",async()=>{ if(!result||!source)return; status.textContent="Sprite sheetを作成中…"; const made=await createSpriteSheet(result); const name=fileBase(source.name); download(made.blob,`${name}_${checked("motion")}_${result.frames.length}f_${result.width}_sheet.png`); $("#export-info").textContent=`${made.columns}列 × ${made.rows}行 / ${formatBytes(made.blob.size)}`; status.textContent="書き出しました。"; });
$("#sequence").addEventListener("click",async()=>{ if(!result||!source)return; status.textContent="PNG連番ZIPを作成中…"; const base=`${fileBase(source.name)}_${checked("motion")}_${result.frames.length}f_${result.width}`; const blob=await createPngSequenceZip(result,base); download(blob,`${base}_png.zip`); $("#export-info").textContent=`PNG ${result.frames.length}枚 / ${formatBytes(blob.size)}`; status.textContent="書き出しました。"; });

function checked<T extends string>(name:string):T { return appRoot.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)!.value as T; }
function toggleBusy(busy:boolean){ ($("#generate") as HTMLButtonElement).disabled=busy; $("#cancel").hidden=!busy; }
function renderResult(){ if(!result)return; frameIndex=0; $("#stage").innerHTML=`<img src="${result.frames[0].url}" alt="生成フレーム 1">`; $("#film").innerHTML=result.frames.map((f,i)=>`<button data-frame="${i}" aria-label="フレーム ${i+1}"><img src="${f.url}" alt=""></button>`).join(""); $("#film").querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>showFrame(Number((b as HTMLElement).dataset.frame)))); const bytes=result.frames.reduce((n,f)=>n+f.blob.size,0),safe=result.clippingPrevented===false?"欠けの恐れあり":"欠けチェック済み"; $("#info").textContent=`${result.frames.length}フレーム ・ ${result.width}×${result.height}px ・ ${formatBytes(bytes)} ・ ${result.loop?"ループ":"非ループ"} ・ ${safe} ・ ${result.provider}`; if(result.clippingPrevented===false)status.textContent="一部の変形が安全余白へ近づきました。小さな出力へ自動収容しています。"; ["#play","#sheet","#sequence"].forEach(s=>(($(s) as HTMLButtonElement).disabled=false)); }
function showFrame(index:number){ if(!result)return; frameIndex=index; const img=$("#stage").querySelector<HTMLImageElement>("img"); if(img){img.src=result.frames[index].url;img.alt=`生成フレーム ${index+1}`;} }
function scheduleFrame(){ if(!playing||!result)return; const fps=Number(($("#fps") as HTMLSelectElement).value); timer=window.setTimeout(()=>{showFrame((frameIndex+1)%result!.frames.length);scheduleFrame();},1000/fps); }
function cleanupResult(){ playing=false; window.clearTimeout(timer); result?.frames.forEach(f=>URL.revokeObjectURL(f.url)); result=null; }
function fileBase(name:string){ return name.replace(/\.png$/i,"").replace(/[^a-zA-Z0-9_-]+/g,"_")||"character"; }
function formatBytes(bytes:number){ return bytes<1024?`${bytes} B`:bytes<1048576?`${(bytes/1024).toFixed(1)} KB`:`${(bytes/1048576).toFixed(2)} MB`; }
function download(blob:Blob,name:string){ const url=URL.createObjectURL(blob); const a=document.createElement("a");a.href=url;a.download=name;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000); }
window.addEventListener("pagehide",()=>{aborter?.abort();cleanupResult();if(sourceUrl)URL.revokeObjectURL(sourceUrl);},{once:true});

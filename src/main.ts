import Phaser from 'phaser';
import './style.css';
import { asset, biomes, journeys, trains, type BiomeId, type TrainId } from './data/catalog';
import { TrainScene, type SceneSnapshot } from './game/TrainScene';
import { TrainAudio } from './game/audio';

const root=document.querySelector<HTMLDivElement>('#app')!;
root.innerHTML=`
<header class="header"><a class="brand" href="./"><span class="brand-icon" aria-hidden="true">🚂</span><span>小小火车站<small>LITTLE TRAIN WORLD</small></span></a><div class="header-tools"><span>今天，去更远的地方看看</span><button id="sound" class="round-button" aria-label="关闭声音" aria-pressed="false">🔊</button></div></header>
<main><div class="intro"><div><span class="eyebrow">小小车轮 · 大大世界</span><h1>下一站，去哪里<span>？</span></h1></div><button id="day" class="day-button" aria-pressed="false" aria-label="切换到夜晚"><span id="day-icon">☀️</span><span id="day-label">白天</span></button></div>
<section class="playground" aria-label="火车驾驶与沿途风景">
 <div class="stage"><div id="game" role="img" aria-label="火车沿着连续拼接的田野、森林、海岸、沙漠和雪山铁路行驶"></div>
 <div class="scene-top"><span id="location" class="location">🏡 田野小镇</span><span id="journey-state" class="state-tag">准备出发</span></div>
 <div class="speech"><span id="speech-icon" aria-hidden="true">👋</span><span id="speech-text" role="status" aria-live="polite">选一辆火车，一起去看看吧！</span><button id="replay" aria-label="再听一次">♬</button></div>
 <div id="door-note" class="door-note" hidden>🚪 车门打开啦</div>
 <div id="loading" class="overlay"><span class="loading-icon">🚂</span><strong>小火车准备中…</strong><p id="loading-text">把风景和车厢装好，就出发。</p><button id="reload" hidden>重新打开</button></div>
 <div id="arrival" class="overlay arrival" hidden><span>🎉</span><strong>到站啦！</strong><p>这一趟，发现了好多新风景。</p><button id="again">再开一趟 →</button></div></div>
 <div class="controls"><div class="control-group"><button id="horn" class="control" data-ready><span class="control-icon horn">📣</span><span>鸣笛</span></button><button id="door" class="control" data-ready aria-pressed="false"><span class="control-icon door">🚪</span><span id="door-label">开车门</span></button></div><button id="go" class="go" data-ready><span id="go-icon">▶</span><span id="go-label">出发啦</span></button><button id="speed" class="control speed" data-ready aria-label="调整行驶速度"><span class="control-icon">🐢</span><span id="speed-label">慢慢开</span></button><div class="progress-box"><span id="route-title">环游小世界</span><div class="progress-track"><i id="progress"></i></div><small id="progress-text">等你出发</small></div></div>
 <div class="route-ribbon" id="route-ribbon" aria-label="本次旅行路段"></div>
</section>
<div class="exploration"><section class="garage" aria-labelledby="garage-title"><div class="section-heading"><h2 id="garage-title">我的火车车库 <span>9 辆</span></h2><small>点一点，换火车</small></div><div class="train-choices">${trains.map((t,i)=>`<button class="choice ${i===0?'selected':''}" data-train="${t.id}" data-ready aria-pressed="${i===0}"><div class="choice-art"><img src="${asset(`${t.id}.png`)}" alt="${t.name}" draggable="false"></div><div class="choice-info"><span><strong>${t.name}</strong><small>${t.note}</small></span><span class="choice-check" aria-hidden="true">✓</span></div></button>`).join('')}</div></section>
<section class="routes" aria-labelledby="routes-title"><div class="section-heading"><h2 id="routes-title">选一条旅行路线</h2></div><div class="journey-choices">${journeys.map((j,i)=>`<button class="journey-choice ${i===0?'selected':''}" data-journey="${j.id}" data-ready aria-pressed="${i===0}"><span class="journey-icon">${j.icon}</span><span><strong>${j.name}</strong><small>${j.stops.length} 段风景 · 一路慢慢看</small></span><span class="journey-arrow">↗</span></button>`).join('')}</div><button id="open-builder" class="build-route" data-ready><span>🧩</span><span><strong>自己拼一条路线</strong><small>把喜欢的风景连起来</small></span><span>＋</span></button><p class="parent-note">不用赶路，也没有输赢。<br>停一停，听听火车，看看世界。</p></section></div>
<footer><span>小手点一点，世界大一点。</span><span>和爸爸妈妈一起，慢慢发现 ♡</span></footer></main>
<dialog id="builder" aria-labelledby="builder-title"><div class="dialog-head"><div><span class="eyebrow">一块接一块，去喜欢的地方</span><h2 id="builder-title">拼出你的小旅程</h2></div><button id="close-builder" class="round-button" aria-label="关闭路线拼接">✕</button></div><p class="builder-hint">点一下风景，就能加一段。最多 8 段。</p><div class="terrain-choices">${Object.entries(biomes).map(([id,b])=>`<button data-biome="${id}"><img src="${asset(`biome-${id}.webp`)}" alt=""><span>${b.icon} ${b.name}</span><b aria-hidden="true">＋</b></button>`).join('')}</div><div class="builder-route" id="builder-route"></div><div class="builder-tools"><button id="undo">↶ 退一步</button><button id="shuffle">⤨ 换个顺序</button><span id="builder-count"></span></div><p id="builder-status" role="status" class="builder-status"></p><button id="apply-route" class="apply-route">就走这条路 →</button></dialog>`;

function el<T extends HTMLElement=HTMLElement>(id:string):T {const node=document.getElementById(id);if(!node)throw new Error(`Missing element: ${id}`);return node as T;}
const audio=new TrainAudio();
let selectedTrain:TrainId='steam',night=false,ready=false,paceIndex=0;
let currentStops:BiomeId[]=[...journeys[0].stops],customStops:BiomeId[]=['countryside','forest','coast'];
let lastBiome:BiomeId='countryside',lastArrived=false,snapshot:SceneSnapshot={moving:false,stopping:false,doorsOpen:false,progress:0,biome:'countryside',chunkIndex:0,arrived:false,speed:0,acceleration:0};
const paces=[{speed:135,name:'慢慢开',icon:'🐢'},{speed:200,name:'快一点',icon:'🐇'},{speed:90,name:'看看风景',icon:'🌿'}];
const buttons=[...document.querySelectorAll<HTMLButtonElement>('[data-ready]')];buttons.forEach(b=>b.disabled=true);
function say(text:string,icon='💬'):void {el('speech-text').textContent=text;el('speech-icon').textContent=icon;audio.speak(text);}
function updateRibbon():void {el('route-ribbon').innerHTML=currentStops.map((id,i)=>`<span class="stop ${i===snapshot.chunkIndex?'active':''}" ${i===snapshot.chunkIndex?'aria-current="step"':''}><span>${biomes[id].icon}</span><span>${biomes[id].name}</span></span>${i<currentStops.length-1?'<i aria-hidden="true">···</i>':''}`).join('');}
function onChange(state:SceneSnapshot):void {
  const previous=snapshot;snapshot=state;audio.setMotion(state.speed,state.acceleration);
  const moving=state.moving||state.stopping;
  el<HTMLButtonElement>('door').disabled=!ready||moving;
  el('door').setAttribute('aria-pressed',String(state.doorsOpen));el('door-label').textContent=state.doorsOpen?'关车门':'开车门';el('door-note').hidden=!state.doorsOpen;
  el('go').classList.toggle('moving',state.moving);el('go-label').textContent=state.moving?'停一停':state.arrived?'再出发':'出发啦';el('go-icon').textContent=state.moving?'Ⅱ':'▶';
  el('journey-state').textContent=state.arrived?'到站啦':state.stopping?'慢慢停下':state.moving?'旅行中':state.progress>0?'休息一下':'准备出发';
  el('progress').style.width=`${state.progress*100}%`;el('progress-text').textContent=state.arrived?'到站啦':`第 ${state.chunkIndex+1} / ${currentStops.length} 段风景`;
  el('location').textContent=`${biomes[state.biome].icon} ${biomes[state.biome].name}`;
  if(previous.chunkIndex!==state.chunkIndex)updateRibbon();
  if(lastBiome!==state.biome){lastBiome=state.biome;say(biomes[state.biome].fact,biomes[state.biome].icon);}
  el('arrival').hidden=!state.arrived;
  if(state.arrived&&!lastArrived){say('到站啦！小小驾驶员，开得真棒！','🎉');audio.tone(523,.2);audio.tone(659,.2,.2);audio.tone(784,.4,.4);}
  lastArrived=state.arrived;
}
function horn():void {if(!ready)return;audio.horn(selectedTrain);scene.honk();el('speech-text').textContent=selectedTrain==='steam'?'呜——小火车来啦！':'嘀——火车来啦！';el('speech-icon').textContent='📣';}
const scene=new TrainScene({
  ready:()=>{ready=true;buttons.forEach(b=>b.disabled=false);el('loading').hidden=true;},
  failed:()=>{el('loading').hidden=false;el('loading-text').textContent='有一张图片没有装好，再试一次吧。';el<HTMLButtonElement>('reload').hidden=false;},
  change:onChange,horn,
});
let game:Phaser.Game;
try {game=new Phaser.Game({type:Phaser.AUTO,parent:'game',backgroundColor:'#b9d7d5',scale:{mode:Phaser.Scale.RESIZE,width:el('game').clientWidth,height:el('game').clientHeight},render:{antialias:true,pixelArt:false,roundPixels:false},audio:{noAudio:true},scene:[scene],fps:{target:60,forceSetTimeOut:false}});}catch {el('loading-text').textContent='画面没有准备好，请换个浏览器或重新打开。';el('reload').hidden=false;}
el('reload').addEventListener('click',()=>location.reload());
el('horn').addEventListener('click',horn);
el('go').addEventListener('click',()=>{const wasMoving=snapshot.moving;audio.enableEngine();scene.toggleRunning();say(wasMoving?'慢慢停下来，看看窗外吧。':'车门关好，坐坐好，我们出发啦！',wasMoving?'🌿':'🚂');});
el('door').addEventListener('click',()=>{if(scene.toggleDoor()){const open=snapshot.doorsOpen;const isWork=selectedTrain==='maintenance'||selectedTrain==='freight';say(open?(isWork?'驾驶室的门打开啦，驾驶员上车。':'车门打开啦，上车后坐坐好。'):'车门关好啦，可以出发了！',open?'🚪':'👌');audio.tone(open?660:440,.15);}});
el('again').addEventListener('click',()=>{scene.restart();say('再开一趟，看看熟悉的风景！','🚂');});
el('speed').addEventListener('click',()=>{paceIndex=(paceIndex+1)%paces.length;const pace=paces[paceIndex];scene.setPace(pace.speed);el('speed-label').textContent=pace.name;el('speed').firstElementChild!.textContent=pace.icon;say(pace.name+'，坐稳啦！',pace.icon);});
el('day').addEventListener('click',()=>{night=!night;scene.setNight(night);el('day').setAttribute('aria-pressed',String(night));el('day').setAttribute('aria-label',night?'切换到白天':'切换到夜晚');el('day-icon').textContent=night?'🌙':'☀️';el('day-label').textContent=night?'夜晚':'白天';say(night?'天黑啦，打开车灯继续旅行。':'太阳出来啦，看看美丽的风景。',night?'🌙':'☀️');});
el('sound').addEventListener('click',()=>{audio.setMuted(!audio.muted);el('sound').textContent=audio.muted?'🔇':'🔊';el('sound').setAttribute('aria-label',audio.muted?'开启声音':'关闭声音');el('sound').setAttribute('aria-pressed',String(audio.muted));if(!audio.muted)audio.speak('声音打开啦。');});
el('replay').addEventListener('click',()=>audio.speak(el('speech-text').textContent??''));
document.querySelectorAll<HTMLButtonElement>('[data-train]').forEach(button=>button.addEventListener('click',()=>{
  selectedTrain=button.dataset.train as TrainId;scene.selectTrain(selectedTrain);
  document.querySelectorAll('[data-train]').forEach(b=>{const active=(b as HTMLElement).dataset.train===selectedTrain;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});
  const train=trains.find(t=>t.id===selectedTrain)!;say(`这是${train.name}。${train.fact}`,'🚂');
}));
function chooseRoute(stops:BiomeId[],name:string,id='custom'):void {
  currentStops=[...stops];lastBiome=currentStops[0];lastArrived=false;scene.setRoute(currentStops);el('route-title').textContent=name;updateRibbon();
  document.querySelectorAll('[data-journey]').forEach(b=>{const active=(b as HTMLElement).dataset.journey===id;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});
  say(`下一趟，${name}！准备好就出发吧。`,'🗺️');
}
document.querySelectorAll<HTMLButtonElement>('[data-journey]').forEach(b=>b.addEventListener('click',()=>{const j=journeys.find(j=>j.id===b.dataset.journey)!;chooseRoute(j.stops,j.name,j.id);}));
const dialog=el<HTMLDialogElement>('builder');
function drawBuilder():void {
  el('builder-route').innerHTML=customStops.map((id,i)=>`<span><b>${biomes[id].icon}</b><small>${i+1}. ${biomes[id].name}</small></span>${i<customStops.length-1?'<i>→</i>':''}`).join('');
  el('builder-count').textContent=`${customStops.length} / 8 段`;
  el<HTMLButtonElement>('undo').disabled=customStops.length===0;el<HTMLButtonElement>('apply-route').disabled=customStops.length<2;
  document.querySelectorAll<HTMLButtonElement>('[data-biome]').forEach(b=>b.disabled=customStops.length>=8);
}
el('open-builder').addEventListener('click',()=>{scene.stopImmediately();audio.stopSpeech();drawBuilder();dialog.showModal();});
el('close-builder').addEventListener('click',()=>dialog.close());
document.querySelectorAll<HTMLButtonElement>('[data-biome]').forEach(b=>b.addEventListener('click',()=>{if(customStops.length<8){customStops.push(b.dataset.biome as BiomeId);drawBuilder();el('builder-status').textContent=`加上了${biomes[b.dataset.biome as BiomeId].name}。`;audio.tone(500+customStops.length*40,.12);}}));
el('undo').addEventListener('click',()=>{customStops.pop();drawBuilder();el('builder-status').textContent=customStops.length<2?'至少拼上两段风景，就能出发。':'';});
el('shuffle').addEventListener('click',()=>{for(let i=customStops.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[customStops[i],customStops[j]]=[customStops[j],customStops[i]];}drawBuilder();});
el('apply-route').addEventListener('click',()=>{if(customStops.length>=2){chooseRoute(customStops,'我的小旅程');dialog.close();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){scene.stopImmediately();audio.setMotion(0,0);audio.stopSpeech();}});
window.addEventListener('pagehide',()=>{audio.setMotion(0,0);audio.stopSpeech();});
if(import.meta.hot)import.meta.hot.dispose(()=>{game?.destroy(true);audio.destroy();});
updateRibbon();


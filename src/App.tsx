import { useEffect, useRef, useState, type MouseEvent } from 'react';
import Phaser from 'phaser';
import { asset, biomes, journeys, trains, type BiomeId, type TrainId } from './data/catalog';
import { TrainAudio } from './game/audio';
import { TrainScene, type SceneSnapshot } from './game/TrainScene';

const initialSnapshot: SceneSnapshot = {
  moving: false,
  stopping: false,
  doorsOpen: false,
  progress: 0,
  biome: 'countryside',
  chunkIndex: 0,
  arrived: false,
  speed: 0,
  acceleration: 0,
};

export function App() {
  const gameHostRef = useRef<HTMLDivElement>(null);
  const garageDialogRef = useRef<HTMLDialogElement>(null);
  const routesDialogRef = useRef<HTMLDialogElement>(null);
  const builderDialogRef = useRef<HTMLDialogElement>(null);
  const audioRef = useRef(new TrainAudio());
  const sceneRef = useRef<TrainScene | null>(null);
  const selectedTrainRef = useRef<TrainId>('steam');
  const currentStopsRef = useRef<BiomeId[]>([...journeys[0].stops]);
  const snapshotRef = useRef<SceneSnapshot>(initialSnapshot);
  const lastBiomeRef = useRef<BiomeId>('countryside');
  const lastArrivedRef = useRef(false);
  const readyRef = useRef(false);
  const nightRef = useRef(false);
  const hornRef = useRef<() => void>(() => {});

  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selectedTrain, setSelectedTrain] = useState<TrainId>('steam');
  const [currentStops, setCurrentStops] = useState<BiomeId[]>([...journeys[0].stops]);
  const [currentRoute, setCurrentRoute] = useState(journeys[0].name);
  const [activeJourneyId, setActiveJourneyId] = useState(journeys[0].id);
  const [customStops, setCustomStops] = useState<BiomeId[]>(['countryside', 'forest', 'coast']);
  const [snapshot, setSnapshot] = useState<SceneSnapshot>(initialSnapshot);
  const [night, setNight] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speech, setSpeech] = useState({ icon: '👋', text: '选一辆火车，一起去看看吧！' });

  function say(text: string, icon = '💬'): void {
    setSpeech({ text, icon });
    audioRef.current.speak(text);
  }

  hornRef.current = () => {
    if (!readyRef.current) return;
    audioRef.current.horn(selectedTrainRef.current);
    sceneRef.current?.honk();
    setSpeech({
      icon: '📣',
      text: selectedTrainRef.current === 'steam' ? '呜——小火车来啦！' : '嘀——火车来啦！',
    });
  };

  useEffect(() => {
    const gameHost = gameHostRef.current;
    if (!gameHost) return;

    const scene = new TrainScene({
      ready: () => {
        readyRef.current = true;
        setReady(true);
        setLoadFailed(false);
      },
      failed: () => {
        setLoadFailed(true);
      },
      change: (state) => {
        const previous = snapshotRef.current;
        snapshotRef.current = state;
        setSnapshot(state);
        audioRef.current.setMotion(state.speed, state.acceleration);

        if (lastBiomeRef.current !== state.biome) {
          lastBiomeRef.current = state.biome;
          say(biomes[state.biome].fact, biomes[state.biome].icon);
        }
        if (previous.chunkIndex !== state.chunkIndex) {
          setCurrentStops([...currentStopsRef.current]);
        }
        if (state.arrived && !lastArrivedRef.current) {
          say('到站啦！小小驾驶员，开得真棒！', '🎉');
          audioRef.current.tone(523, .2);
          audioRef.current.tone(659, .2, .2);
          audioRef.current.tone(784, .4, .4);
        }
        lastArrivedRef.current = state.arrived;
      },
      horn: () => hornRef.current(),
    });

    sceneRef.current = scene;

    let game: Phaser.Game | undefined;
    try {
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: gameHost,
        backgroundColor: '#b9d7d5',
        scale: { mode: Phaser.Scale.RESIZE, width: gameHost.clientWidth, height: gameHost.clientHeight },
        render: { antialias: true, pixelArt: false, roundPixels: false },
        audio: { noAudio: true },
        scene: [scene],
        fps: { target: 60, forceSetTimeOut: false },
      });
    } catch {
      setLoadFailed(true);
    }

    const handleVisibility = () => {
      if (document.hidden) {
        scene.stopImmediately();
        audioRef.current.setMotion(0, 0);
        audioRef.current.stopSpeech();
      }
    };
    const handlePageHide = () => {
      audioRef.current.setMotion(0, 0);
      audioRef.current.stopSpeech();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handlePageHide);
      game?.destroy(true);
      audioRef.current.destroy();
      sceneRef.current = null;
      readyRef.current = false;
    };
  }, []);

  function pauseForPicker(): void {
    sceneRef.current?.stopImmediately();
    audioRef.current.setMotion(0, 0);
    audioRef.current.stopSpeech();
  }

  function openDialog(dialog: HTMLDialogElement | null): void {
    if (dialog && !dialog.open) dialog.showModal();
  }

  function chooseTrain(id: TrainId): void {
    selectedTrainRef.current = id;
    setSelectedTrain(id);
    sceneRef.current?.selectTrain(id);

    const train = trains.find((item) => item.id === id);
    if (train) say(`这是${train.name}。${train.fact}`, '🚂');
    window.setTimeout(() => garageDialogRef.current?.close(), 180);
  }

  function chooseRoute(stops: BiomeId[], name: string, id = 'custom'): void {
    const nextStops = [...stops];
    currentStopsRef.current = nextStops;
    lastBiomeRef.current = nextStops[0];
    lastArrivedRef.current = false;
    setCurrentStops(nextStops);
    setCurrentRoute(name);
    setActiveJourneyId(id);
    sceneRef.current?.setRoute(nextStops);
    say(`下一趟，${name}！准备好就出发吧。`, '🗺️');
  }

  function handleGo(): void {
    audioRef.current.enableEngine();
    sceneRef.current?.accelerate();
    say(snapshotRef.current.arrived ? '再开一趟，看看熟悉的风景！' : '加速啦，坐坐稳！', '🚂');
  }

  function handleBrake(): void {
    sceneRef.current?.brake();
    say('慢慢刹车，准备停稳。', '🛑');
  }

  function handleAgain(): void {
    sceneRef.current?.restart();
    say('再开一趟，看看熟悉的风景！', '🚂');
  }

  function handleDay(): void {
    const nextNight = !nightRef.current;
    nightRef.current = nextNight;
    setNight(nextNight);
    sceneRef.current?.setNight(nextNight);
    say(nextNight ? '天黑啦，打开车灯继续旅行。' : '太阳出来啦，看看美丽的风景。', nextNight ? '🌙' : '☀️');
  }

  function handleSound(): void {
    const nextMuted = !audioRef.current.muted;
    audioRef.current.setMuted(nextMuted);
    setMuted(nextMuted);
    if (!nextMuted) audioRef.current.speak('声音打开啦。');
  }

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>): void {
    if (event.target === event.currentTarget) event.currentTarget.close();
  }

  function handleBuilderBackdropClick(event: MouseEvent<HTMLDialogElement>): void {
    const bounds = event.currentTarget.getBoundingClientRect();
    const outside =
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom;
    if (outside) event.currentTarget.close();
  }

  function addBiome(id: BiomeId): void {
    if (customStops.length >= 8) return;
    const nextStops = [...customStops, id];
    setCustomStops(nextStops);
    setSpeech({ icon: speech.icon, text: `加上了${biomes[id].name}。` });
    audioRef.current.tone(500 + nextStops.length * 40, .12);
  }

  function undoBiome(): void {
    const nextStops = customStops.slice(0, -1);
    setCustomStops(nextStops);
    if (nextStops.length < 2) setSpeech({ icon: speech.icon, text: '至少拼上两段风景，就能出发。' });
  }

  function shuffleBiomes(): void {
    const nextStops = [...customStops];
    for (let i = nextStops.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [nextStops[i], nextStops[j]] = [nextStops[j], nextStops[i]];
    }
    setCustomStops(nextStops);
  }

  const train = trains.find((item) => item.id === selectedTrain) ?? trains[0];
  const journeyState = snapshot.arrived
    ? '到站啦'
    : snapshot.stopping
      ? '慢慢停下'
      : snapshot.moving
        ? '旅行中'
        : snapshot.progress > 0
          ? '休息一下'
          : '准备出发';
  const progressText = snapshot.arrived ? '到站啦' : `第 ${snapshot.chunkIndex + 1} / ${currentStops.length} 段`;

  return (
    <>
      <header className="header">
        <a className="brand" href="./">
          <span className="brand-icon" aria-hidden="true">🚂</span>
          <span>小小火车站<small>LITTLE TRAIN WORLD</small></span>
        </a>
        <div className="header-tools">
          <button
            id="day"
            className="tool-button day-button"
            aria-pressed={night}
            aria-label={night ? '切换到白天' : '切换到夜晚'}
            onClick={handleDay}
          >
            <span id="day-icon" aria-hidden="true">{night ? '🌙' : '☀️'}</span>
            <span id="day-label">{night ? '夜晚' : '白天'}</span>
          </button>
          <button id="sound" className="tool-button sound-button" aria-label={muted ? '开启声音' : '关闭声音'} aria-pressed={muted} onClick={handleSound}>
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      </header>

      <main className="cockpit">
        <section className="playground" aria-label="火车驾驶与沿途风景">
          <div className="stage">
            <div ref={gameHostRef} id="game" role="img" aria-label="火车沿着连续拼接的田野、森林、海岸、沙漠和雪山铁路行驶" />

            <div className="scene-top">
              <span id="location" className="hud-pill location">{biomes[snapshot.biome].icon} {biomes[snapshot.biome].name}</span>
              <div className="progress-box hud-progress">
                <div><strong id="route-title">{currentRoute}</strong><small id="progress-text">{progressText}</small></div>
                <div className="progress-track" aria-hidden="true"><i id="progress" style={{ width: `${snapshot.progress * 100}%` }} /></div>
              </div>
              <span id="journey-state" className="hud-pill state-tag">{journeyState}</span>
            </div>

            <div className="speech">
              <span id="speech-icon" aria-hidden="true">{speech.icon}</span>
              <span id="speech-text" role="status" aria-live="polite">{speech.text}</span>
              <button id="replay" aria-label="再听一次" onClick={() => audioRef.current.speak(speech.text)}>♬</button>
            </div>

            <div className="stage-actions" aria-label="游戏选择">
              <button id="open-garage" className="stage-action" disabled={!ready} onClick={() => { pauseForPicker(); openDialog(garageDialogRef.current); }}>
                <span aria-hidden="true">🚂</span><span><small>现在驾驶</small><strong id="current-train">{train.name}</strong></span><b aria-hidden="true">⌄</b>
              </button>
              <button id="open-routes" className="stage-action" disabled={!ready} onClick={() => { pauseForPicker(); openDialog(routesDialogRef.current); }}>
                <span aria-hidden="true">🗺️</span><span><small>旅行路线</small><strong id="current-route">{currentRoute}</strong></span><b aria-hidden="true">⌄</b>
              </button>
            </div>

            <div id="door-note" className="door-note" hidden={!snapshot.doorsOpen}>🚪 车门打开啦</div>
            <div id="loading" className="overlay" hidden={ready && !loadFailed}>
              <span className="loading-icon">🚂</span><strong>小火车准备中…</strong>
              <p id="loading-text">{loadFailed ? '有一张图片没有装好，再试一次吧。' : '把风景和车厢装好，就出发。'}</p>
              <button id="reload" hidden={!loadFailed} onClick={() => location.reload()}>重新打开</button>
            </div>
            <div id="arrival" className="overlay arrival" hidden={!snapshot.arrived}>
              <span>🎉</span><strong>到站啦！</strong><p>这一趟，发现了好多新风景。</p>
              <button id="again" onClick={handleAgain}>再开一趟 →</button>
            </div>
          </div>

          <div className="route-ribbon" id="route-ribbon" aria-label="本次旅行路段">
            {currentStops.map((id, index) => (
              <FragmentStop key={`${id}-${index}`} id={id} index={index} active={index === snapshot.chunkIndex} last={index === currentStops.length - 1} />
            ))}
          </div>

          <div className="controls">
            <div className="control-cluster">
              <button id="horn" className="control big-control" disabled={!ready} onClick={() => hornRef.current()}>
                <span className="control-icon horn" aria-hidden="true">📣</span><span>鸣笛</span>
              </button>
            </div>
            <button id="go" className={`go ${snapshot.speed > 20 ? 'moving' : ''}`} disabled={!ready} onClick={handleGo}>
              <span id="go-icon" aria-hidden="true">{snapshot.arrived ? '▶' : '▲'}</span><span id="go-label">{snapshot.arrived ? '再出发' : '加速'}</span>
            </button>
            <div className="control-cluster control-cluster-end">
              <button id="brake" className="control big-control brake-button" disabled={!ready} onClick={handleBrake}>
                <span className="control-icon brake" aria-hidden="true">▼</span><span>刹车</span>
              </button>
            </div>
          </div>
        </section>
        <p className="parent-note">没有输赢，慢慢开，和爸爸妈妈一起看看世界。</p>
      </main>

      <dialog ref={garageDialogRef} id="garage-drawer" className="game-sheet" aria-labelledby="garage-title" onClick={handleBackdropClick}>
        <div className="sheet-panel">
          <div className="sheet-handle" aria-hidden="true" />
          <div className="sheet-head">
            <div><span className="eyebrow">选择今天的小火车</span><h2 id="garage-title">我的火车车库</h2></div>
            <button id="close-garage" className="round-button" aria-label="关闭火车车库" onClick={() => garageDialogRef.current?.close()}>✕</button>
          </div>
          <div className="train-choices">
            {trains.map((item) => {
              const active = item.id === selectedTrain;
              return (
                <button key={item.id} className={`choice ${active ? 'selected' : ''}`} disabled={!ready} aria-pressed={active} onClick={() => chooseTrain(item.id)}>
                  <div className="choice-art"><img src={asset(`${item.id}.png`)} alt={item.name} draggable="false" /></div>
                  <div className="choice-info"><span><strong>{item.name}</strong><small>{item.note}</small></span><span className="choice-check" aria-hidden="true">✓</span></div>
                </button>
              );
            })}
          </div>
        </div>
      </dialog>

      <dialog ref={routesDialogRef} id="routes-drawer" className="game-sheet" aria-labelledby="routes-title" onClick={handleBackdropClick}>
        <div className="sheet-panel routes-panel">
          <div className="sheet-handle" aria-hidden="true" />
          <div className="sheet-head">
            <div><span className="eyebrow">下一趟想去哪里</span><h2 id="routes-title">选择旅行路线</h2></div>
            <button id="close-routes" className="round-button" aria-label="关闭路线选择" onClick={() => routesDialogRef.current?.close()}>✕</button>
          </div>
          <div className="journey-choices">
            {journeys.map((journey) => {
              const active = journey.id === activeJourneyId;
              return (
                <button key={journey.id} className={`journey-choice ${active ? 'selected' : ''}`} disabled={!ready} aria-pressed={active} onClick={() => { chooseRoute(journey.stops, journey.name, journey.id); routesDialogRef.current?.close(); }}>
                  <span className="journey-icon" aria-hidden="true">{journey.icon}</span>
                  <span><strong>{journey.name}</strong><small>{journey.stops.length} 段风景 · 一路慢慢看</small></span>
                  <span className="journey-arrow" aria-hidden="true">→</span>
                </button>
              );
            })}
          </div>
          <button id="open-builder" className="build-route" disabled={!ready} onClick={() => { sceneRef.current?.stopImmediately(); audioRef.current.stopSpeech(); routesDialogRef.current?.close(); openDialog(builderDialogRef.current); }}>
            <span aria-hidden="true">🧩</span><span><strong>自己拼一条路线</strong><small>把喜欢的风景连起来</small></span><span aria-hidden="true">＋</span>
          </button>
        </div>
      </dialog>

      <dialog ref={builderDialogRef} id="builder" className="builder-dialog" aria-labelledby="builder-title" onClick={handleBuilderBackdropClick}>
        <div className="dialog-head">
          <div><span className="eyebrow">一块接一块，去喜欢的地方</span><h2 id="builder-title">拼出你的小旅程</h2></div>
          <button id="close-builder" className="round-button" aria-label="关闭路线拼接" onClick={() => builderDialogRef.current?.close()}>✕</button>
        </div>
        <p className="builder-hint">点一下风景，就能加一段。最多 8 段。</p>
        <div className="terrain-choices">
          {Object.entries(biomes).map(([id, biome]) => (
            <button key={id} disabled={customStops.length >= 8} onClick={() => addBiome(id as BiomeId)}>
              <img src={asset(`biome-${id}.webp`)} alt="" /><span>{biome.icon} {biome.name}</span><b aria-hidden="true">＋</b>
            </button>
          ))}
        </div>
        <div className="builder-route" id="builder-route">
          {customStops.map((id, index) => (
            <FragmentBuilderStop key={`${id}-${index}`} id={id} index={index} last={index === customStops.length - 1} />
          ))}
        </div>
        <div className="builder-tools">
          <button id="undo" disabled={customStops.length === 0} onClick={undoBiome}>↶ 退一步</button>
          <button id="shuffle" onClick={shuffleBiomes}>⤨ 换个顺序</button>
          <span id="builder-count">{customStops.length} / 8 段</span>
        </div>
        <p id="builder-status" role="status" className="builder-status">{speech.text.startsWith('加上了') || speech.text.startsWith('至少拼上') ? speech.text : ''}</p>
        <button id="apply-route" className="apply-route" disabled={customStops.length < 2} onClick={() => { chooseRoute(customStops, '我的小旅程'); builderDialogRef.current?.close(); }}>就走这条路 →</button>
      </dialog>
    </>
  );
}

function FragmentStop({ id, index, active, last }: { id: BiomeId; index: number; active: boolean; last: boolean }) {
  return (
    <>
      <span className={`stop ${active ? 'active' : ''}`} aria-current={active ? 'step' : undefined}>
        <span>{biomes[id].icon}</span><span>{biomes[id].name}</span>
      </span>
      {!last && <i aria-hidden="true">···</i>}
    </>
  );
}

function FragmentBuilderStop({ id, index, last }: { id: BiomeId; index: number; last: boolean }) {
  return (
    <>
      <span><b>{biomes[id].icon}</b><small>{index + 1}. {biomes[id].name}</small></span>
      {!last && <i>→</i>}
    </>
  );
}

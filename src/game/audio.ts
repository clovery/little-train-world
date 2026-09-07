export class TrainAudio {
  muted=false;
  private context?:AudioContext;
  private engineGain?:GainNode;
  private engineFilter?:BiquadFilterNode;
  private engineOscillators:OscillatorNode[]=[];

  private getContext():AudioContext {
    this.context??=new AudioContext();
    void this.context.resume();
    return this.context;
  }
  private cachedVoices: SpeechSynthesisVoice[] = [];
  private voicesReady = false;
  /** Set up once, so the first speak() does not fall back to the OS default. */
  primeVoices(): void {
    if (!('speechSynthesis' in window)) return;
    const collect = (): void => {
      this.cachedVoices = window.speechSynthesis.getVoices();
      this.voicesReady = this.cachedVoices.length > 0;
    };
    collect();
    window.speechSynthesis.addEventListener?.('voiceschanged', collect);
  }
  /** Pick a zh-CN voice, falling back to other zh-* locales if the device has none. */
  private pickChineseVoice(): SpeechSynthesisVoice | undefined {
    if (!this.voicesReady) this.cachedVoices = window.speechSynthesis.getVoices() ?? [];
    const voices = this.cachedVoices;
    if (voices.length === 0) return undefined;

    // Gentle, warmer Apple zh-CN voices sound better for kids' narration
    // than the more news-anchor-like Tingting/Eddy/Flo.
    const preferredNames = ['Sandy', 'Shelley', 'Reed', 'Grandma', 'Grandpa', 'Eddy', 'Flo', 'Rocko', 'Tingting'];

    const localCn = voices.filter(v => v.localService && /^zh[-_]CN/i.test(v.lang));
    if (localCn.length > 0) {
      // Try preferred names first (in the curated order above).
      for (const name of preferredNames) {
        const hit = localCn.find(v => v.name.toLowerCase().startsWith(name.toLowerCase()));
        if (hit) return hit;
      }
      return localCn[0];
    }

    // Fallbacks when no local zh-CN voice exists.
    return (
      voices.find(v => /^zh[-_]CN/i.test(v.lang)) ??
      voices.find(v => /^zh[-_]hans/i.test(v.lang)) ??
      voices.find(v => /^zh/i.test(v.lang)) ??
      voices.find(v => /chinese|mandarin|cmn/i.test(v.name))
    );
  }
  speak(text: string): void {
    if (this.muted || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = 'zh-CN';
    speech.rate = 0.82;
    speech.pitch = 1.18;
    const voice = this.pickChineseVoice();
    if (voice) {
      speech.voice = voice;
      speech.lang = voice.lang; // Match the voice's actual locale to avoid mismatched fallback.
    }
    speech.onerror = (event) => console.warn('[speech] error', event);
    if (import.meta.env.DEV) {
      console.info('[speech] speak', { text, voice: voice?.name, lang: voice?.lang ?? speech.lang, local: voice?.localService });
    }
    window.speechSynthesis.speak(speech);
  }
  tone(frequency:number,duration=.45,delay=0):void {
    if(this.muted)return;
    try {
      const context=this.getContext();
      const o=context.createOscillator(),g=context.createGain(),t=context.currentTime+delay;
      o.type='sine';o.frequency.setValueAtTime(frequency,t);o.frequency.linearRampToValueAtTime(frequency*.93,t+duration);
      g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.08,t+.03);g.gain.exponentialRampToValueAtTime(.001,t+duration);
      o.connect(g);g.connect(context.destination);o.start(t);o.stop(t+duration+.02);
    }catch { /* Visual feedback remains available without Web Audio. */ }
  }
  horn(kind:string):void {const frequency=kind==='steam'?390:kind==='freight'?250:620;this.tone(frequency,.65);this.tone(frequency*1.3,.45,.2);}
  /** Must be called from a user gesture so browsers permit continuous audio. */
  enableEngine():void {
    if(this.muted||this.engineGain)return;
    try {
      const context=this.getContext();
      const gain=context.createGain();gain.gain.value=.0001;
      const filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=420;filter.Q.value=.7;
      gain.connect(filter);filter.connect(context.destination);
      const low=context.createOscillator();low.type='sawtooth';low.frequency.value=42;low.connect(gain);low.start();
      const harmonic=context.createOscillator();harmonic.type='triangle';harmonic.frequency.value=84;harmonic.connect(gain);harmonic.start();
      this.engineGain=gain;this.engineFilter=filter;this.engineOscillators=[low,harmonic];
    }catch { /* The game remains fully usable when Web Audio is unavailable. */ }
  }
  setMotion(speed:number,acceleration:number):void {
    const context=this.context,gain=this.engineGain,filter=this.engineFilter;
    if(!context||!gain||!filter)return;
    const ratio=Math.max(0,Math.min(1,speed/210));
    const effort=Math.max(0,Math.min(1,acceleration/34));
    const now=context.currentTime;
    gain.gain.setTargetAtTime(this.muted?.0001:.0001+ratio*(.018+effort*.008),now,.08);
    filter.frequency.setTargetAtTime(260+ratio*620+effort*130,now,.1);
    this.engineOscillators[0]?.frequency.setTargetAtTime(39+ratio*34,now,.08);
    this.engineOscillators[1]?.frequency.setTargetAtTime(78+ratio*76,now,.08);
  }
  setMuted(value:boolean):void {this.muted=value;if(value){this.stopSpeech();this.setMotion(0,0);void this.context?.suspend();}else void this.context?.resume();}
  stopSpeech():void {if('speechSynthesis' in window)window.speechSynthesis.cancel();}
  destroy():void {this.stopSpeech();this.engineOscillators.forEach(oscillator=>oscillator.stop());this.engineOscillators=[];void this.context?.close();}
}

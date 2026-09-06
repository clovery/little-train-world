export class TrainAudio {
  muted=false;
  private context?:AudioContext;
  speak(text:string):void {
    if(this.muted || !('speechSynthesis' in window))return;
    window.speechSynthesis.cancel();
    const speech=new SpeechSynthesisUtterance(text);speech.lang='zh-CN';speech.rate=.88;speech.pitch=1.08;
    const voice=window.speechSynthesis.getVoices().find(v=>/^zh[-_]CN/i.test(v.lang));if(voice)speech.voice=voice;
    window.speechSynthesis.speak(speech);
  }
  tone(frequency:number,duration=.45,delay=0):void {
    if(this.muted)return;
    try { this.context??=new AudioContext();void this.context.resume();
      const o=this.context.createOscillator(),g=this.context.createGain(),t=this.context.currentTime+delay;
      o.type='sine';o.frequency.setValueAtTime(frequency,t);o.frequency.linearRampToValueAtTime(frequency*.93,t+duration);
      g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.08,t+.03);g.gain.exponentialRampToValueAtTime(.001,t+duration);
      o.connect(g);g.connect(this.context.destination);o.start(t);o.stop(t+duration+.02);
    }catch { /* Visual feedback remains available without Web Audio. */ }
  }
  horn(kind:string):void {const frequency=kind==='steam'?390:kind==='freight'?250:620;this.tone(frequency,.65);this.tone(frequency*1.3,.45,.2);}
  setMuted(value:boolean):void {this.muted=value;if(value){this.stopSpeech();void this.context?.suspend();}else void this.context?.resume();}
  stopSpeech():void {if('speechSynthesis' in window)window.speechSynthesis.cancel();}
  destroy():void {this.stopSpeech();void this.context?.close();}
}

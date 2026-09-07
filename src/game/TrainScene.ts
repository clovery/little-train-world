import Phaser from 'phaser';
import { asset, biomes, trains, type BiomeId, type TrainId } from '../data/catalog';
import { brakingSpeed, stepMotion } from './motion';
import { CHUNK_LENGTH, OVERLAP, createRoute, sampleTerrain, visibleChunks, type RouteChunk } from './route';

export interface SceneSnapshot {
  moving: boolean;
  stopping: boolean;
  doorsOpen: boolean;
  progress: number;
  biome: BiomeId;
  chunkIndex: number;
  arrived: boolean;
  speed: number;
  acceleration: number;
}
export interface SceneCallbacks { ready:()=>void; failed:(file:string)=>void; change:(state:SceneSnapshot)=>void; horn:()=>void; }

/** Rendering owns a bounded pool of chunks; UI owns choices and speech. */
export class TrainScene extends Phaser.Scene {
  private callbacks:SceneCallbacks;
  private chunks:RouteChunk[]=createRoute(['countryside','forest','coast','desert','snow','forest','countryside']);
  private chunksOnScreen=new Map<number,Phaser.GameObjects.Image>();
  private rails:Phaser.GameObjects.TileSprite[]=[];
  private train!:Phaser.GameObjects.Container;
  private body!:Phaser.GameObjects.Image;
  private wheels:Phaser.GameObjects.Image[]=[];
  private doorImage?:Phaser.GameObjects.Image;
  private doorBack?:Phaser.GameObjects.Rectangle;
  private darkness!:Phaser.GameObjects.Rectangle;
  private light!:Phaser.GameObjects.Image;
  private particles!:Phaser.GameObjects.Graphics;
  private atmosphere!:Phaser.GameObjects.Graphics;
  private foreground!:Phaser.GameObjects.Graphics;
  private shadow!:Phaser.GameObjects.Ellipse;
  private trainType:TrainId='steam';
  private distance=0;
  private velocity=0;
  private acceleration=0;
  private targetVelocity=0;
  private pace=135;
  private doorsOpen=false;
  private doorFraction=0;
  private isNight=false;
  private arrived=false;
  private ready=false;
  private lastSnapshot='';
  private lastProgress=-1;
  private reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private trainWidth=0;
  private trainHeight=0;
  private honkUntil=0;
  private missingAssets=false;
  private suspension=0;
  private suspensionVelocity=0;

  constructor(callbacks:SceneCallbacks){super('TrainWorld');this.callbacks=callbacks;}
  preload():void {
    for(const t of trains)this.load.image(t.id,asset(`${t.id}.png`));
    for(const id of Object.keys(biomes))this.load.image(`biome-${id}`,asset(`biome-${id}.webp`));
    for(let i=0;i<3;i++)this.load.image(`wheel-${i}`,asset(`wheel-${i}.png`));
    for(const t of trains)if(t.door)this.load.image(`door-${t.id}`,asset(`door-${t.id}.png`));
    this.load.image('rail',asset('rail.webp'));
    this.load.on('loaderror',(file:Phaser.Loader.File)=>{this.missingAssets=true;this.callbacks.failed(file.key);});
  }
  create():void {
    if(this.missingAssets)return;
    // Alpha edges blend two adjacent raster chunks over a shared overlap.
    for(const id of Object.keys(biomes)){
      const tex=this.textures.createCanvas(`blend-${id}`,CHUNK_LENGTH+OVERLAP,600)!;
      const ctx=tex.context;
      ctx.drawImage(this.textures.get(`biome-${id}`).getSourceImage() as HTMLImageElement,0,0,CHUNK_LENGTH+OVERLAP,600);
      ctx.globalCompositeOperation='destination-in';
      const gradient=ctx.createLinearGradient(0,0,OVERLAP,0);gradient.addColorStop(0,'rgba(0,0,0,0)');gradient.addColorStop(1,'rgba(0,0,0,1)');
      ctx.fillStyle=gradient;ctx.fillRect(0,0,CHUNK_LENGTH+OVERLAP,600);tex.refresh();
    }
    const beam=this.textures.createCanvas('beam',300,100)!;
    const b=beam.context;const g=b.createLinearGradient(0,0,300,0);g.addColorStop(0,'rgba(255,238,167,.65)');g.addColorStop(1,'rgba(255,238,167,0)');
    b.fillStyle=g;b.beginPath();b.moveTo(0,43);b.lineTo(300,0);b.lineTo(300,100);b.lineTo(0,57);b.closePath();b.fill();beam.refresh();
    this.atmosphere=this.add.graphics().setDepth(12);
    this.shadow=this.add.ellipse(0,0,1,1,0x24372f,.2).setDepth(24);
    this.train=this.add.container(0,0).setDepth(30);
    this.body=this.add.image(0,0,'steam').setOrigin(0,0);this.train.add(this.body);
    this.foreground=this.add.graphics().setDepth(33);
    this.particles=this.add.graphics().setDepth(35);
    this.darkness=this.add.rectangle(0,0,1,1,0x122342,0).setOrigin(0).setDepth(40);
    this.light=this.add.image(0,0,'beam').setOrigin(0,.5).setDepth(41).setVisible(false);
    this.body.setInteractive({useHandCursor:true}).on('pointerdown',()=>this.callbacks.horn());
    this.ready=true;this.makeTrain();this.resize();
    this.scale.on('resize',this.resize,this);
    this.events.once('shutdown',()=>this.scale.off('resize',this.resize,this));
    this.callbacks.ready();this.publish();
  }
  private dimensions(){const w=this.scale.width,h=this.scale.height;return {w,h,s:h/600,anchor:w*.48};}
  private resize():void {
    if(!this.ready)return;
    const {w,h,s}=this.dimensions();
    this.darkness.setSize(w,h);
    const count=Math.ceil(w/(32*s))+3;
    while(this.rails.length<count)this.rails.push(this.add.tileSprite(0,0,33,31,'rail').setOrigin(.5,.5).setDepth(20));
    while(this.rails.length>count)this.rails.pop()!.destroy();
    this.layoutTrain();this.renderWorld();
  }
  private makeTrain():void {
    this.wheels.forEach(w=>w.destroy());this.wheels=[];
    this.doorImage?.destroy();this.doorImage=undefined;this.doorBack?.destroy();this.doorBack=undefined;
    this.body.setTexture(this.trainType);
    if(this.trainType==='steam'){
      for(let i=0;i<3;i++){const wheel=this.add.image(0,0,`wheel-${i}`);this.wheels.push(wheel);this.train.add(wheel);}
    }
    if(trains.find(t=>t.id===this.trainType)?.door){
      this.doorBack=this.add.rectangle(0,0,1,1,0x263a32).setOrigin(0);
      this.doorImage=this.add.image(0,0,`door-${this.trainType}`).setOrigin(0);
      this.train.add([this.doorBack,this.doorImage]);
    }
    this.layoutTrain();
  }
  private layoutTrain():void {
    const {w,h}=this.dimensions();
    const img=this.textures.get(this.trainType).getSourceImage() as HTMLImageElement;
    this.trainWidth=Math.min(w*.88,840,h*1.85);
    this.trainHeight=this.trainWidth*img.height/img.width;
    this.body.setPosition(-this.trainWidth/2,-this.trainHeight).setDisplaySize(this.trainWidth,this.trainHeight);
    const wheelSpecs=[{x:979/1421,y:224/271,r:43/1421},{x:1085/1421,y:224/271,r:43/1421},{x:1189/1421,y:227/271,r:40/1421}];
    this.wheels.forEach((wheel,i)=>{const c=wheelSpecs[i];wheel.setPosition((c.x-.5)*this.trainWidth,(c.y-1)*this.trainHeight).setDisplaySize(c.r*2*this.trainWidth,c.r*2*this.trainWidth);});
    this.layoutDoor();
  }
  private layoutDoor():void {
    const door=trains.find(t=>t.id===this.trainType)?.door;
    if(!door||!this.doorImage||!this.doorBack)return;
    const x=(door.x-.5)*this.trainWidth,y=(door.y-1)*this.trainHeight,w=door.width*this.trainWidth,h=door.height*this.trainHeight;
    this.doorBack.setPosition(x,y).setSize(w,h);
    // A raster door narrows sideways to reveal the doorway, keeping it inside the train silhouette.
    this.doorImage.setPosition(x,y).setDisplaySize(Math.max(.5,w*(1-this.doorFraction*.92)),h);
  }
  selectTrain(id:TrainId):void {if(!this.ready)return;this.stopImmediately();this.trainType=id;this.doorsOpen=false;this.doorFraction=0;this.makeTrain();this.publish();}
  setRoute(stops:BiomeId[]):void {
    if(!this.ready||stops.length<2)return;
    this.stopImmediately();this.chunks=createRoute(stops);this.distance=0;this.arrived=false;this.doorsOpen=false;this.doorFraction=0;
    this.chunksOnScreen.forEach(c=>c.destroy());this.chunksOnScreen.clear();this.renderWorld();this.publish();
  }
  toggleRunning():void {
    if(!this.ready)return;
    if(this.arrived){this.distance=0;this.arrived=false;}
    if(this.targetVelocity>0)this.targetVelocity=0;
    else {this.doorsOpen=false;this.targetVelocity=this.pace;}
    this.publish();
  }
  stopImmediately():void {this.velocity=0;this.acceleration=0;this.targetVelocity=0;this.suspension=0;this.suspensionVelocity=0;this.publish();}
  toggleDoor():boolean {
    if(!this.ready || this.velocity>.5||this.targetVelocity>0)return false;
    this.doorsOpen=!this.doorsOpen;this.publish();return true;
  }
  setPace(value:number):void {this.pace=value;if(this.targetVelocity>0)this.targetVelocity=value;}
  setNight(value:boolean):void {this.isNight=value;}
  honk():void {this.honkUntil=this.time.now+750;}
  restart():void {this.distance=0;this.arrived=false;this.velocity=0;this.acceleration=0;this.targetVelocity=0;this.doorsOpen=false;this.toggleRunning();}
  private routeEnd():number {const {w,s}=this.dimensions();return Math.max(100,this.chunks.length*CHUNK_LENGTH-w/s);}
  private snapshot():SceneSnapshot {
    const {s,anchor}=this.dimensions();const i=sampleTerrain(this.chunks,this.distance+anchor/s).index;
    return {moving:this.targetVelocity>0,stopping:this.targetVelocity===0&&this.velocity>.5,doorsOpen:this.doorsOpen,progress:Math.min(1,this.distance/this.routeEnd()),biome:this.chunks[i].biome as BiomeId,chunkIndex:i,arrived:this.arrived,speed:this.velocity,acceleration:this.acceleration};
  }
  private publish():void {
    if(!this.ready)return;
    const state=this.snapshot();const speedBand=Math.round(state.speed/6);const key=`${state.moving}|${state.stopping}|${state.doorsOpen}|${state.biome}|${state.chunkIndex}|${state.arrived}|${speedBand}`;
    const percent=Math.round(state.progress*100);
    if(key!==this.lastSnapshot||percent!==this.lastProgress){this.lastSnapshot=key;this.lastProgress=percent;this.callbacks.change(state);}
  }
  private wrap(value:number,size:number):number {return ((value%size)+size)%size;}
  private drawAtmosphere(biome:BiomeId,w:number,h:number,s:number,camera:number):void {
    this.atmosphere.clear();
    if(this.reduced)return;
    const time=this.time.now;
    const cloudAlpha=this.isNight?.1:.22;
    for(let i=0;i<6;i++){
      const x=this.wrap(i*251-camera*s*.075+time*.004,w+260)-130;
      const y=(62+(i%3)*38)*s;
      const r=(16+(i%2)*7)*s;
      this.atmosphere.fillStyle(0xffffff,cloudAlpha);
      this.atmosphere.fillCircle(x,y,r).fillCircle(x+r*1.1,y+r*.15,r*.78).fillEllipse(x-r*.05,y+r*.52,r*3.1,r*.85);
    }
    if(biome==='snow'){
      this.atmosphere.fillStyle(0xffffff,this.isNight?.45:.78);
      for(let i=0;i<42;i++){
        const x=this.wrap(i*83+time*(.018+(i%4)*.004)-camera*s*.04,w+24)-12;
        const y=this.wrap(i*47+time*(.025+(i%3)*.007),h+30)-15;
        this.atmosphere.fillCircle(x,y,(1+i%3)*s*.72);
      }
    }else if(biome==='desert'){
      this.atmosphere.fillStyle(0xd7ad70,.12);
      for(let i=0;i<9;i++){
        const x=this.wrap(i*173-camera*s*.3+time*.025,w+180)-90;
        const y=(430+(i%3)*31)*s;
        this.atmosphere.fillEllipse(x,y,(80+i%2*35)*s,(8+i%3*3)*s);
      }
    }else if(biome==='forest'||biome==='countryside'){
      this.atmosphere.fillStyle(biome==='forest'?0xd7d58f:0xffe6a4,.35);
      for(let i=0;i<18;i++){
        const x=this.wrap(i*101-camera*s*.12+time*.012,w+20)-10;
        const y=(180+this.wrap(i*67+time*.01,260))*s;
        this.atmosphere.fillCircle(x,y,(i%3===0?2:1)*s);
      }
    }else if(biome==='coast'){
      this.atmosphere.lineStyle(Math.max(1,1.5*s),0x456779,.45);
      for(let i=0;i<5;i++){
        const x=this.wrap(i*223-camera*s*.12+time*.008,w+100)-50;
        const y=(112+(i%3)*34)*s;
        this.atmosphere.beginPath();this.atmosphere.moveTo(x-9*s,y);this.atmosphere.lineTo(x-4*s,y-5*s);this.atmosphere.lineTo(x,y);this.atmosphere.lineTo(x+4*s,y-5*s);this.atmosphere.lineTo(x+9*s,y);this.atmosphere.strokePath();
      }
    }
    const speedRatio=Math.min(1,this.velocity/Math.max(1,this.pace));
    if(speedRatio>.78){
      this.atmosphere.lineStyle(Math.max(1,s),0xffffff,(speedRatio-.78)*.45);
      for(let i=0;i<9;i++){
        const x=this.wrap(i*149-time*.12,w+160)-80;const y=(120+(i*53)%350)*s;
        this.atmosphere.lineBetween(x,y,x-(35+i%3*20)*s,y);
      }
    }
  }
  private drawForeground(biome:BiomeId,w:number,h:number,s:number,camera:number):void {
    this.foreground.clear();
    if(this.reduced)return;
    const shift=camera*s*.72;
    if(biome==='countryside'||biome==='forest'){
      const color=biome==='forest'?0x426f50:0x77985e;
      this.foreground.lineStyle(Math.max(1,2*s),color,.38);
      for(let i=0;i<34;i++){
        const x=this.wrap(i*43-shift,w+30)-15;const base=h-(8+(i%4)*4)*s;const sway=Math.sin(this.time.now*.002+i)*5*s;
        this.foreground.lineBetween(x,base,x+sway,base-(10+i%3*5)*s);
      }
    }else if(biome==='snow'){
      this.foreground.fillStyle(0xeaf4f5,.55);
      for(let i=0;i<8;i++){const x=this.wrap(i*171-shift,w+150)-75;this.foreground.fillEllipse(x,h-4*s,190*s,22*s);}
    }else if(biome==='desert'){
      this.foreground.lineStyle(Math.max(1,2*s),0xc39762,.32);
      for(let i=0;i<7;i++){const x=this.wrap(i*211-shift,w+210)-105;this.foreground.strokeEllipse(x,h-3*s,230*s,30*s);}
    }else{
      this.foreground.fillStyle(0xd8c9a1,.25);
      for(let i=0;i<18;i++){const x=this.wrap(i*79-shift,w+40)-20;this.foreground.fillEllipse(x,h-(4+i%3*3)*s,(7+i%4*2)*s,(3+i%2)*s);}
    }
  }
  private renderWorld():void {
    const {w,h,s,anchor}=this.dimensions();
    const camera=this.distance;
    const visible=visibleChunks(this.chunks,camera,w/s);
    const keys=new Set(visible.map(c=>c.index));
    this.chunksOnScreen.forEach((img,key)=>{if(!keys.has(key)){img.destroy();this.chunksOnScreen.delete(key);}});
    for(const chunk of visible){
      let img=this.chunksOnScreen.get(chunk.index);
      if(!img){img=this.add.image(0,0,chunk.index===0?`biome-${chunk.biome}`:`blend-${chunk.biome}`).setOrigin(0).setDepth(chunk.index);this.chunksOnScreen.set(chunk.index,img);}
      img.setPosition((chunk.start-camera)*s,0).setDisplaySize((CHUNK_LENGTH+OVERLAP)*s,h);
    }
    const first=Math.floor(camera/32)*32;
    this.rails.forEach((rail,i)=>{
      const x=first+i*32;const {height,slope}=sampleTerrain(this.chunks,x);
      rail.setPosition((x-camera)*s,(500+height)*s).setSize(34,31).setScale(s).setRotation(Math.atan(slope));
      rail.tilePositionX=x;
    });
    const terrain=sampleTerrain(this.chunks,camera+anchor/s);
    const biome=this.chunks[terrain.index].biome as BiomeId;
    this.drawAtmosphere(biome,w,h,s,camera);
    this.drawForeground(biome,w,h,s,camera);
    const honk=!this.reduced&&this.time.now<this.honkUntil?Math.sin(this.time.now*.025)*2:0;
    const inertiaShift=this.reduced?0:Phaser.Math.Clamp(-this.acceleration*.18,-8,8);
    const railRoll=this.reduced?0:Math.sin(this.distance*.075)*Math.min(.005,this.velocity*.000035);
    const trainX=anchor+inertiaShift;
    const trainY=(489+terrain.height)*s+this.suspension-honk;
    this.train.setPosition(trainX,trainY).setRotation(Math.atan(terrain.slope)+railRoll+Phaser.Math.Clamp(-this.acceleration*.00032,-.012,.012));
    this.shadow.setPosition(trainX,(499+terrain.height)*s).setDisplaySize(this.trainWidth*.78,Math.max(9,18*s)).setRotation(Math.atan(terrain.slope)).setAlpha(this.isNight?.12:.22);
    this.layoutDoor();
    this.darkness.setAlpha(this.isNight?.42:0);
    this.light.setVisible(this.isNight).setPosition(trainX+this.trainWidth*.48,this.train.y-this.trainHeight*.45).setDisplaySize(w*.28,h*.2);
    this.particles.clear();
    if(this.trainType==='steam'&&this.velocity>1&&!this.reduced){
      const effort=Phaser.Math.Clamp(.35+Math.max(0,this.acceleration)/42,0,1);
      for(let i=0;i<7;i++){const t=((this.time.now/(1600-effort*420)+i/7)%1);this.particles.fillStyle(0xfffcf1,(1-t)*(.36+effort*.3));this.particles.fillCircle(trainX+this.trainWidth*.395-t*(65+this.velocity*.25),this.train.y-this.trainHeight-t*(86+effort*42),5+t*(13+effort*8));}
    }
    if(this.acceleration<-22&&this.velocity>65&&!this.reduced){
      this.particles.lineStyle(Math.max(1,1.5*s),0xf5a23b,.8);
      for(let i=0;i<5;i++){const x=trainX-this.trainWidth*.2+i*this.trainWidth*.1;const y=this.train.y-2*s;this.particles.lineBetween(x,y,x-10-i*3,y+7+i%2*4);}
    }
    if(this.isNight){this.particles.fillStyle(0xfff4bf,.85);for(let i=0;i<11;i++){const x=(i*157+60)%w,y=32+(i*31)%(h*.24);this.particles.fillCircle(x,y,i%3===0?2:1);}}
  }
  update(_time:number,delta:number):void {
    if(!this.ready)return;
    const dt=Math.min(delta/1000,.06);
    this.doorFraction=Phaser.Math.Linear(this.doorFraction,this.doorsOpen?1:0,Math.min(1,dt*7));
    // Doors remove traction; the station speed cap creates a natural automatic approach.
    const requested=this.doorFraction>.03?0:this.targetVelocity;
    const remaining=Math.max(0,this.routeEnd()-this.distance);
    const stationLimit=brakingSpeed(Math.max(0,remaining-10),42);
    const target=Math.min(requested,stationLimit);
    const motion=stepMotion({speed:this.velocity,acceleration:this.acceleration},target,dt);
    this.velocity=motion.speed;this.acceleration=motion.acceleration;
    this.distance=Math.min(this.routeEnd(),this.distance+this.velocity*dt);
    const speedRatio=Math.min(1,this.velocity/Math.max(1,this.pace));
    const railPulse=this.reduced?0:Math.sin(this.distance*.31)*.72*speedRatio;
    const suspensionTarget=railPulse-Phaser.Math.Clamp(this.acceleration*.018,-.9,.9);
    this.suspensionVelocity+=(suspensionTarget-this.suspension)*55*dt;
    this.suspensionVelocity*=Math.exp(-10*dt);
    this.suspension+=this.suspensionVelocity*dt;
    if((remaining<=12&&this.velocity<1)||this.distance>=this.routeEnd()){
      this.distance=this.routeEnd();this.velocity=0;this.acceleration=0;this.targetVelocity=0;this.arrived=true;
    }
    if(!this.reduced)this.wheels.forEach(w=>w.rotation+=this.velocity*dt/26);
    this.renderWorld();this.publish();
  }
}

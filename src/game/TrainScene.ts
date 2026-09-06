import Phaser from 'phaser';
import { asset, biomes, trains, type BiomeId, type TrainId } from '../data/catalog';
import { CHUNK_LENGTH, OVERLAP, createRoute, sampleTerrain, visibleChunks, type RouteChunk } from './route';

export interface SceneSnapshot { moving:boolean; stopping:boolean; doorsOpen:boolean; progress:number; biome:BiomeId; chunkIndex:number; arrived:boolean; }
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
  private trainType:TrainId='steam';
  private distance=0;
  private velocity=0;
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
    this.train=this.add.container(0,0).setDepth(30);
    this.body=this.add.image(0,0,'steam').setOrigin(0,0);this.train.add(this.body);
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
  stopImmediately():void {this.velocity=0;this.targetVelocity=0;this.publish();}
  toggleDoor():boolean {
    if(!this.ready || this.velocity>.5||this.targetVelocity>0)return false;
    this.doorsOpen=!this.doorsOpen;this.publish();return true;
  }
  setPace(value:number):void {this.pace=value;if(this.targetVelocity>0)this.targetVelocity=value;}
  setNight(value:boolean):void {this.isNight=value;}
  honk():void {this.honkUntil=this.time.now+750;}
  restart():void {this.distance=0;this.arrived=false;this.velocity=0;this.targetVelocity=0;this.doorsOpen=false;this.toggleRunning();}
  private routeEnd():number {const {w,s}=this.dimensions();return Math.max(100,this.chunks.length*CHUNK_LENGTH-w/s);}
  private snapshot():SceneSnapshot {
    const {s,anchor}=this.dimensions();const i=sampleTerrain(this.chunks,this.distance+anchor/s).index;
    return {moving:this.targetVelocity>0,stopping:this.targetVelocity===0&&this.velocity>.5,doorsOpen:this.doorsOpen,progress:Math.min(1,this.distance/this.routeEnd()),biome:this.chunks[i].biome as BiomeId,chunkIndex:i,arrived:this.arrived};
  }
  private publish():void {
    if(!this.ready)return;
    const state=this.snapshot();const key=`${state.moving}|${state.stopping}|${state.doorsOpen}|${state.biome}|${state.chunkIndex}|${state.arrived}`;
    const percent=Math.round(state.progress*100);
    if(key!==this.lastSnapshot||percent!==this.lastProgress){this.lastSnapshot=key;this.lastProgress=percent;this.callbacks.change(state);}
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
    const bump=!this.reduced&&this.velocity>1?Math.sin(this.time.now*.03)*Math.min(1,this.velocity/150):0;
    const honk=!this.reduced&&this.time.now<this.honkUntil?Math.sin(this.time.now*.025)*2:0;
    this.train.setPosition(anchor,(489+terrain.height)*s+bump-honk).setRotation(Math.atan(terrain.slope));
    this.layoutDoor();
    this.darkness.setAlpha(this.isNight?.42:0);
    this.light.setVisible(this.isNight).setPosition(anchor+this.trainWidth*.48,this.train.y-this.trainHeight*.45).setDisplaySize(w*.28,h*.2);
    this.particles.clear();
    if(this.trainType==='steam'&&this.velocity>1&&!this.reduced){
      for(let i=0;i<5;i++){const t=((this.time.now/1900+i*.2)%1);this.particles.fillStyle(0xfffcf1,(1-t)*.55);this.particles.fillCircle(anchor+this.trainWidth*.395-t*80,this.train.y-this.trainHeight-t*100,5+t*16);}
    }
    if(this.isNight){this.particles.fillStyle(0xfff4bf,.85);for(let i=0;i<11;i++){const x=(i*157+60)%w,y=32+(i*31)%(h*.24);this.particles.fillCircle(x,y,i%3===0?2:1);}}
  }
  update(_time:number,delta:number):void {
    if(!this.ready)return;
    const dt=Math.min(delta/1000,.06);
    this.doorFraction=Phaser.Math.Linear(this.doorFraction,this.doorsOpen?1:0,Math.min(1,dt*7));
    // Wait for the door animation to close before applying traction.
    const target=this.doorFraction>.03?0:this.targetVelocity;
    this.velocity=Phaser.Math.Linear(this.velocity,target,Math.min(1,dt*2.8));
    if(target===0&&this.velocity<.5)this.velocity=0;
    this.distance+=this.velocity*dt;
    if(this.distance>=this.routeEnd()){this.distance=this.routeEnd();this.velocity=0;this.targetVelocity=0;this.arrived=true;}
    if(!this.reduced)this.wheels.forEach(w=>w.rotation+=this.velocity*dt/26);
    this.renderWorld();this.publish();
  }
}

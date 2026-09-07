import Phaser from 'phaser';
import { asset, biomes, trains, type BiomeId, type TrainId } from '../data/catalog';
import { CameraController } from './CameraController';
import { brakingSpeed, stepMotion } from './motion';
import { CHUNK_LENGTH, createRoute, type RouteChunk } from './route';
import { getTunnelSegmentAt, sampleTrack } from './trackPath';
import { wheelLayouts, type WheelSpec } from './wheelLayouts';
import { WorldRenderer } from './WorldRenderer';

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
  private world?:WorldRenderer;
  private cameraController=new CameraController();
  private train!:Phaser.GameObjects.Container;
  private body!:Phaser.GameObjects.Image;
  private wheels:Phaser.GameObjects.Image[]=[];
  private doorImage?:Phaser.GameObjects.Image;
  private doorBack?:Phaser.GameObjects.Rectangle;
  private darkness!:Phaser.GameObjects.Rectangle;
  private light!:Phaser.GameObjects.Image;
  private particles!:Phaser.GameObjects.Graphics;
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
  private couplerStretch=0;
  private couplerVelocity=0;
  private wheelTravel=0;

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
    this.world=new WorldRenderer(this);
    this.world.prepareTextures();
    const beam=this.textures.createCanvas('beam',300,100)!;
    const b=beam.context;const g=b.createLinearGradient(0,0,300,0);g.addColorStop(0,'rgba(255,238,167,.65)');g.addColorStop(1,'rgba(255,238,167,0)');
    b.fillStyle=g;b.beginPath();b.moveTo(0,43);b.lineTo(300,0);b.lineTo(300,100);b.lineTo(0,57);b.closePath();b.fill();beam.refresh();
    this.shadow=this.add.ellipse(0,0,1,1,0x24372f,.2).setDepth(24);
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
    this.world?.resize(w,s);
    this.layoutTrain();this.renderWorld();
  }
  private makeTrain():void {
    this.wheels.forEach(w=>w.destroy());this.wheels=[];
    this.doorImage?.destroy();this.doorImage=undefined;this.doorBack?.destroy();this.doorBack=undefined;
    this.body.setTexture(this.trainType);
    wheelLayouts[this.trainType].forEach((spec,index)=>{
      const wheel=this.add.image(0,0,this.wheelTexture(spec,index));this.wheels.push(wheel);this.train.add(wheel);
    });
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
    this.layoutRunningGear(0);
    this.layoutDoor();
  }
  private layoutRunningGear(stretch:number):void {
    const wheelSpecs=wheelLayouts[this.trainType];
    this.wheels.forEach((wheel,i)=>{
      const c=wheelSpecs[i];
      const rearBias=1-c.x;
      const jointWave=this.reduced?0:Math.sin(this.wheelTravel*.055+i*.9)*Math.min(1.5,this.velocity*.006);
      wheel.setPosition((c.x-.5)*this.trainWidth-stretch*rearBias+jointWave,(c.y-1)*this.trainHeight).setDisplaySize(c.radius*2*this.trainWidth,c.radius*2*this.trainWidth);
    });
  }
  private wheelTexture(spec:WheelSpec,index:number):string {
    if(spec.texture)return spec.texture;
    const key=`wheel-${this.trainType}-crop-${index}`;
    if(this.textures.exists(key))return key;
    const source=this.textures.get(this.trainType).getSourceImage() as HTMLImageElement;
    const diameter=Math.max(8,Math.round(spec.radius*source.width*2));
    const texture=this.textures.createCanvas(key,diameter,diameter)!;
    const context=texture.context;
    context.save();context.beginPath();context.arc(diameter/2,diameter/2,diameter/2-.5,0,Math.PI*2);context.clip();
    context.drawImage(source,spec.x*source.width-diameter/2,spec.y*source.height-diameter/2,diameter,diameter,0,0,diameter,diameter);
    context.restore();texture.refresh();
    return key;
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
    this.stopImmediately();this.chunks=createRoute(stops);this.distance=0;this.cameraController.reset();this.wheelTravel=0;this.arrived=false;this.doorsOpen=false;this.doorFraction=0;
    this.world?.clearRoute();this.renderWorld();this.publish();
  }
  toggleRunning():void {
    if(!this.ready)return;
    if(this.arrived){this.distance=0;this.arrived=false;}
    if(this.targetVelocity>0)this.targetVelocity=0;
    else {this.doorsOpen=false;this.targetVelocity=this.pace;}
    this.publish();
  }
  accelerate():void {
    if(!this.ready)return;
    if(this.arrived){this.distance=0;this.cameraController.reset();this.wheelTravel=0;this.arrived=false;}
    this.doorsOpen=false;
    this.targetVelocity=Math.min(210,Math.max(80,this.targetVelocity+55));
    this.pace=Math.max(this.pace,this.targetVelocity);
    this.publish();
  }
  brake():void {if(!this.ready)return;this.targetVelocity=0;this.publish();}
  stopImmediately():void {this.velocity=0;this.acceleration=0;this.targetVelocity=0;this.suspension=0;this.suspensionVelocity=0;this.couplerStretch=0;this.couplerVelocity=0;this.publish();}
  toggleDoor():boolean {
    if(!this.ready || this.velocity>.5||this.targetVelocity>0)return false;
    this.doorsOpen=!this.doorsOpen;this.publish();return true;
  }
  setPace(value:number):void {this.pace=value;if(this.targetVelocity>0)this.targetVelocity=value;}
  setNight(value:boolean):void {this.isNight=value;}
  honk():void {this.honkUntil=this.time.now+750;}
  restart():void {this.distance=0;this.cameraController.reset();this.wheelTravel=0;this.arrived=false;this.velocity=0;this.acceleration=0;this.targetVelocity=0;this.doorsOpen=false;this.toggleRunning();}
  private routeEnd():number {const {w,s}=this.dimensions();return Math.max(100,this.chunks.length*CHUNK_LENGTH-w/s);}
  private snapshot():SceneSnapshot {
    const {s,anchor}=this.dimensions();const i=sampleTrack(this.chunks,this.distance+anchor/s).index;
    return {moving:this.targetVelocity>0,stopping:this.targetVelocity===0&&this.velocity>.5,doorsOpen:this.doorsOpen,progress:Math.min(1,this.distance/this.routeEnd()),biome:this.chunks[i].biome as BiomeId,chunkIndex:i,arrived:this.arrived,speed:this.velocity,acceleration:this.acceleration};
  }
  private publish():void {
    if(!this.ready)return;
    const state=this.snapshot();const speedBand=Math.round(state.speed/6);const key=`${state.moving}|${state.stopping}|${state.doorsOpen}|${state.biome}|${state.chunkIndex}|${state.arrived}|${speedBand}`;
    const percent=Math.round(state.progress*100);
    if(key!==this.lastSnapshot||percent!==this.lastProgress){this.lastSnapshot=key;this.lastProgress=percent;this.callbacks.change(state);}
  }
  private renderWorld():void {
    const {w,h,s,anchor}=this.dimensions();
    const camera=this.cameraController.distance;
    const track=sampleTrack(this.chunks,this.distance+anchor/s);
    const tunnel=getTunnelSegmentAt(this.chunks,this.distance+anchor/s);
    const biome=this.chunks[track.index].biome as BiomeId;
    this.world?.render({chunks:this.chunks,camera,biome,width:w,height:h,scale:s,reduced:this.reduced,isNight:this.isNight,velocity:this.velocity,pace:this.pace});
    const honk=!this.reduced&&this.time.now<this.honkUntil?Math.sin(this.time.now*.025)*2:0;
    const inertiaShift=this.reduced?0:Phaser.Math.Clamp(-this.acceleration*.18,-8,8);
    const railRoll=this.reduced?0:Math.sin(this.distance*.075)*Math.min(.005,this.velocity*.000035);
    const trainX=(this.distance+anchor/s-camera)*s+inertiaShift;
    const trainY=(track.y-11)*s+this.suspension-honk;
    const pitch=track.angle+railRoll+Phaser.Math.Clamp(-this.acceleration*.00032,-.012,.012);
    this.layoutRunningGear(this.couplerStretch*s);
    this.body.x=-this.trainWidth/2+Phaser.Math.Clamp(this.couplerStretch*s*.2,-2.5,2.5);
    this.train.setPosition(trainX,trainY).setRotation(pitch);
    this.shadow.setPosition(trainX,(track.y-1)*s).setDisplaySize(this.trainWidth*.78,Math.max(9,18*s)).setRotation(track.angle).setAlpha(this.isNight?.12:.22);
    this.layoutDoor();
    this.darkness.setAlpha(tunnel?.28:this.isNight?.42:0);
    this.light.setVisible(this.isNight||Boolean(tunnel)).setPosition(trainX+this.trainWidth*.48,this.train.y-this.trainHeight*.45).setDisplaySize(w*.28,h*.2);
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
    const {s}=this.dimensions();
    const speedRatio=Math.min(1,this.velocity/Math.max(1,this.pace));
    this.cameraController.follow(this.distance,this.velocity,this.pace,this.acceleration,s,this.routeEnd(),dt);
    const railPulse=this.reduced?0:Math.sin(this.distance*.31)*.72*speedRatio;
    const suspensionTarget=railPulse-Phaser.Math.Clamp(this.acceleration*.018,-.9,.9);
    this.suspensionVelocity+=(suspensionTarget-this.suspension)*55*dt;
    this.suspensionVelocity*=Math.exp(-10*dt);
    this.suspension+=this.suspensionVelocity*dt;
    const stretchTarget=this.reduced?0:Phaser.Math.Clamp(this.acceleration*.11,-4.8,4.2);
    this.couplerVelocity+=(stretchTarget-this.couplerStretch)*34*dt;
    this.couplerVelocity*=Math.exp(-8*dt);
    this.couplerStretch+=this.couplerVelocity*dt;
    if((remaining<=12&&this.velocity<1)||this.distance>=this.routeEnd()){
      this.distance=this.routeEnd();this.velocity=0;this.acceleration=0;this.targetVelocity=0;this.arrived=true;
    }
    this.wheelTravel+=this.velocity*dt;
    if(!this.reduced)this.wheels.forEach((w,i)=>{const radius=Math.max(4,wheelLayouts[this.trainType][i].radius*this.trainWidth);w.rotation=this.wheelTravel*s/radius;});
    this.renderWorld();this.publish();
  }
}

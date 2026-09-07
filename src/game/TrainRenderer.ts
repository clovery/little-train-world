import Phaser from 'phaser';
import { trains, type TrainId } from '../data/catalog';
import { type RouteChunk } from './route';
import { coachStyles, consistSpacing } from './trainConsist';
import { sampleTrack } from './trackPath';
import { wheelLayouts, type WheelSpec } from './wheelLayouts';

interface CoachVisual {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  body: Phaser.GameObjects.Graphics;
  wheels: Phaser.GameObjects.Graphics;
}

export interface TrainRenderState {
  chunks: readonly RouteChunk[];
  trainType: TrainId;
  distance: number;
  camera: number;
  anchor: number;
  scale: number;
  width: number;
  height: number;
  velocity: number;
  acceleration: number;
  pace: number;
  doorFraction: number;
  suspension: number;
  couplerStretch: number;
  wheelTravel: number;
  honking: boolean;
  isNight: boolean;
  inTunnel: boolean;
  reduced: boolean;
}

export class TrainRenderer {
  private train: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Image;
  private wheels: Phaser.GameObjects.Image[] = [];
  private coaches: CoachVisual[] = [];
  private doorImage?: Phaser.GameObjects.Image;
  private doorBack?: Phaser.GameObjects.Rectangle;
  private shadow: Phaser.GameObjects.Ellipse;
  private light: Phaser.GameObjects.Image;
  private particles: Phaser.GameObjects.Graphics;
  private trainType: TrainId = 'steam';
  private trainWidth = 0;
  private trainHeight = 0;
  private coachWidth = 0;
  private coachHeight = 0;

  constructor(private scene: Phaser.Scene, onHorn: () => void) {
    this.ensureBeamTexture();
    this.shadow = scene.add.ellipse(0, 0, 1, 1, 0x24372f, .2).setDepth(24);
    this.train = scene.add.container(0, 0).setDepth(30);
    this.body = scene.add.image(0, 0, this.trainType).setOrigin(0, 0);
    this.train.add(this.body);
    this.particles = scene.add.graphics().setDepth(35);
    this.light = scene.add.image(0, 0, 'beam').setOrigin(0, .5).setDepth(41).setVisible(false);
    this.body.setInteractive({ useHandCursor: true }).on('pointerdown', onHorn);
    this.makeTrain(this.trainType);
  }

  selectTrain(id: TrainId):void {
    this.trainType = id;
    this.makeTrain(id);
  }

  resize(width:number, height:number):void {
    const img = this.scene.textures.get(this.trainType).getSourceImage() as HTMLImageElement;
    this.trainWidth = Math.min(width * .46, 470, height * 1.05);
    this.trainHeight = this.trainWidth * img.height / img.width;
    this.coachWidth = Math.min(width * .22, 230, Math.max(138, this.trainWidth * .46));
    this.coachHeight = Math.max(54, this.trainHeight * .78);
    this.body.setPosition(-this.trainWidth / 2, -this.trainHeight).setDisplaySize(this.trainWidth, this.trainHeight);
    this.layoutRunningGear(0, 0, 0, true);
    this.layoutDoor(0);
    this.syncCoachCount();
    this.redrawCoaches();
  }

  render(state: TrainRenderState):void {
    const { chunks, distance, anchor, camera, scale, acceleration, velocity, reduced } = state;
    const headTrack = sampleTrack(chunks, distance + anchor / scale);
    const honk = !reduced && state.honking ? Math.sin(this.scene.time.now * .025) * 2 : 0;
    const inertiaShift = reduced ? 0 : Phaser.Math.Clamp(-acceleration * .18, -8, 8);
    const railRoll = reduced ? 0 : Math.sin(distance * .075) * Math.min(.005, velocity * .000035);
    const headX = (distance + anchor / scale - camera) * scale + inertiaShift;
    const headY = (headTrack.y - 11) * scale + state.suspension - honk;
    const pitch = headTrack.angle + railRoll + Phaser.Math.Clamp(-acceleration * .00032, -.012, .012);

    this.layoutRunningGear(state.couplerStretch * scale, state.wheelTravel, velocity, reduced);
    this.body.x = -this.trainWidth / 2 + Phaser.Math.Clamp(state.couplerStretch * scale * .2, -2.5, 2.5);
    this.train.setPosition(headX, headY).setRotation(pitch);
    this.shadow.setPosition(headX, (headTrack.y - 1) * scale).setDisplaySize(this.trainWidth * 1.32, Math.max(9, 18 * scale)).setRotation(headTrack.angle).setAlpha(state.isNight ? .12 : .22);
    this.layoutDoor(state.doorFraction);
    this.renderCoaches(state);
    this.light.setVisible(state.isNight || state.inTunnel).setPosition(headX + this.trainWidth * .48, headY - this.trainHeight * .45).setDisplaySize(state.width * .28, state.height * .2);
    this.drawParticles(state, headX, headY, scale);
  }

  private ensureBeamTexture():void {
    if (this.scene.textures.exists('beam')) return;
    const beam = this.scene.textures.createCanvas('beam', 300, 100)!;
    const context = beam.context;
    const gradient = context.createLinearGradient(0, 0, 300, 0);
    gradient.addColorStop(0, 'rgba(255,238,167,.65)');
    gradient.addColorStop(1, 'rgba(255,238,167,0)');
    context.fillStyle = gradient;
    context.beginPath();
    context.moveTo(0, 43);
    context.lineTo(300, 0);
    context.lineTo(300, 100);
    context.lineTo(0, 57);
    context.closePath();
    context.fill();
    beam.refresh();
  }

  private createCoach(index:number):CoachVisual {
    const container = this.scene.add.container(0, 0).setDepth(29 - index * .01);
    const sprite = this.scene.add.image(0, 0, this.trainType).setOrigin(.5, 1).setVisible(false);
    const body = this.scene.add.graphics();
    const wheels = this.scene.add.graphics();
    container.add([sprite, body, wheels]);
    return { container, sprite, body, wheels };
  }

  private makeTrain(id: TrainId):void {
    this.wheels.forEach(wheel => wheel.destroy());
    this.wheels = [];
    this.doorImage?.destroy();
    this.doorImage = undefined;
    this.doorBack?.destroy();
    this.doorBack = undefined;
    this.body.setTexture(id);
    this.syncCoachCount();
    wheelLayouts[id].forEach((spec, index) => {
      const wheel = this.scene.add.image(0, 0, this.wheelTexture(spec, index));
      this.wheels.push(wheel);
      this.train.add(wheel);
    });
    if (trains.find(train => train.id === id)?.door) {
      this.doorBack = this.scene.add.rectangle(0, 0, 1, 1, 0x263a32).setOrigin(0);
      this.doorImage = this.scene.add.image(0, 0, `door-${id}`).setOrigin(0);
      this.train.add([this.doorBack, this.doorImage]);
    }
    const { width, height } = this.scene.scale;
    this.resize(width, height);
  }

  private syncCoachCount():void {
    const target = coachStyles[this.trainType].count;
    while (this.coaches.length < target) this.coaches.push(this.createCoach(this.coaches.length));
    while (this.coaches.length > target) {
      const coach = this.coaches.pop()!;
      coach.container.destroy();
    }
  }

  private layoutRunningGear(stretch:number, wheelTravel:number, velocity:number, reduced:boolean):void {
    const wheelSpecs = wheelLayouts[this.trainType];
    this.wheels.forEach((wheel, i) => {
      const spec = wheelSpecs[i];
      const rearBias = 1 - spec.x;
      const jointWave = reduced ? 0 : Math.sin(wheelTravel * .055 + i * .9) * Math.min(1.5, velocity * .006);
      const radius = spec.radius * this.trainWidth;
      wheel
        .setPosition((spec.x - .5) * this.trainWidth - stretch * rearBias + jointWave, (spec.y - 1) * this.trainHeight)
        .setDisplaySize(radius * 2, radius * 2);
      if (!reduced) wheel.rotation = wheelTravel * this.scene.scale.height / 600 / Math.max(4, radius);
    });
  }

  private wheelTexture(spec:WheelSpec, index:number):string {
    if (spec.texture) return spec.texture;
    const key = `wheel-${this.trainType}-crop-${index}`;
    if (this.scene.textures.exists(key)) return key;
    const source = this.scene.textures.get(this.trainType).getSourceImage() as HTMLImageElement;
    const diameter = Math.max(8, Math.round(spec.radius * source.width * 2));
    const texture = this.scene.textures.createCanvas(key, diameter, diameter)!;
    const context = texture.context;
    context.save();
    context.beginPath();
    context.arc(diameter / 2, diameter / 2, diameter / 2 - .5, 0, Math.PI * 2);
    context.clip();
    context.drawImage(source, spec.x * source.width - diameter / 2, spec.y * source.height - diameter / 2, diameter, diameter, 0, 0, diameter, diameter);
    context.restore();
    texture.refresh();
    return key;
  }

  private layoutDoor(doorFraction:number):void {
    const door = trains.find(train => train.id === this.trainType)?.door;
    if (!door || !this.doorImage || !this.doorBack) return;
    const x = (door.x - .5) * this.trainWidth;
    const y = (door.y - 1) * this.trainHeight;
    const w = door.width * this.trainWidth;
    const h = door.height * this.trainHeight;
    this.doorBack.setPosition(x, y).setSize(w, h);
    this.doorImage.setPosition(x, y).setDisplaySize(Math.max(.5, w * (1 - doorFraction * .92)), h);
  }

  private redrawCoaches():void {
    const spec = trains.find(train => train.id === this.trainType)!;
    const style = coachStyles[this.trainType];
    const coachTexture = this.coachTexture();
    const color = this.hexColor(style.bodyColor ?? spec.color);
    const sideColor = this.hexColor(style.sideColor ?? spec.color);
    const stripeColor = this.hexColor(style.stripeColor ?? '#2f4f44');
    const windowColor = this.hexColor(style.windowColor ?? '#fff7cf');
    const roof = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(this.hexColor(style.roofColor ?? spec.color)),
      Phaser.Display.Color.ValueToColor(0xffffff),
      100,
      style.roofColor ? 0 : 28,
    );
    const roofColor = style.roofColor ? this.hexColor(style.roofColor) : Phaser.Display.Color.GetColor(roof.r, roof.g, roof.b);
    for (const [index, coach] of this.coaches.entries()) {
      coach.body.clear();
      coach.wheels.clear();
      const w = this.coachWidth;
      const h = this.coachHeight;
      if (coachTexture) {
        coach.sprite.setTexture(coachTexture).setDisplaySize(w, h).setVisible(true);
        coach.body.setVisible(false);
        coach.wheels.setVisible(false);
        continue;
      }
      coach.sprite.setVisible(false);
      coach.body.setVisible(true);
      coach.wheels.setVisible(true);
      coach.body.fillStyle(0x1f342c, .28).fillRoundedRect(-w / 2 + 8, -h + 8, w - 16, h * .82, 13);
      if (style.roof === 'round') coach.body.fillStyle(roofColor, 1).fillRoundedRect(-w / 2, -h, w, h * .78, 16);
      else if (style.roof === 'low') coach.body.fillStyle(roofColor, 1).fillRoundedRect(-w / 2, -h * .86, w, h * .66, 10);
      else coach.body.fillStyle(roofColor, 1).fillRect(-w / 2, -h * .82, w, h * .62);
      coach.body.fillStyle(color, 1).fillRoundedRect(-w / 2 + 7, -h * .88, w - 14, h * .56, style.roof === 'flat' ? 4 : 11);
      coach.body.fillStyle(sideColor, .92).fillRoundedRect(-w / 2 + 13, -h * .8, w - 26, h * .34, style.roof === 'flat' ? 3 : 8);
      if (style.windowCount > 0) {
        coach.body.fillStyle(windowColor, .9);
        const windowStep = w * .7 / style.windowCount;
        for (let i = 0; i < style.windowCount; i++) coach.body.fillRoundedRect(-w * .35 + i * windowStep, -h * .76, Math.min(w * .14, windowStep * .58), h * .21, 5);
      } else {
        coach.body.fillStyle(0x6e4d38, .28);
        for (let i = 0; i < 3; i++) coach.body.fillRect(-w * .36 + i * w * .24, -h * .74, w * .12, h * .36);
      }
      if (style.stripe === 'cargo') coach.body.fillStyle(stripeColor, .55).fillRect(-w / 2 + w * .1, -h * .45, w * .8, h * .16);
      else if (style.stripe === 'tram') coach.body.fillStyle(stripeColor, .9).fillRect(-w / 2 + w * .09, -h * .39, w * .82, h * .1);
      else if (style.stripe === 'belt') coach.body.fillStyle(stripeColor, .85).fillRect(-w / 2 + w * .12, -h * .34, w * .76, h * .08);
      coach.body.lineStyle(2, 0xffffff, .46).strokeRoundedRect(-w / 2 + 2, -h + 2, w - 4, h * .78 - 4, 14);
      const wheelY = -h * .12;
      const phase = index * .85;
      for (let i = 0; i < 2; i++) {
        const x = -w * .28 + i * w * .56;
        coach.wheels.fillStyle(0x25342f, 1).fillCircle(x, wheelY, h * .105);
        coach.wheels.lineStyle(2, 0xf2dfad, .8).strokeCircle(x, wheelY, h * .072);
        coach.wheels.lineStyle(2, 0xf2dfad, .7).lineBetween(x, wheelY, x + Math.cos(phase) * h * .07, wheelY + Math.sin(phase) * h * .07);
      }
    }
  }

  private hexColor(value:string):number {
    return Phaser.Display.Color.HexStringToColor(value).color;
  }

  private coachTexture():string | undefined {
    const crop = coachStyles[this.trainType].textureCrop;
    if (!crop) return undefined;
    const key = `coach-${this.trainType}`;
    if (this.scene.textures.exists(key)) return key;
    const source = this.scene.textures.get(this.trainType).getSourceImage() as HTMLImageElement;
    const texture = this.scene.textures.createCanvas(key, crop.width, crop.height)!;
    texture.context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
    texture.refresh();
    return key;
  }

  private renderCoaches(state:TrainRenderState):void {
    const spacing = consistSpacing(this.trainWidth, this.coachWidth, state.scale);
    this.coaches.forEach((coach, index) => {
      const lag = spacing.firstLag + spacing.coachLag * index + state.couplerStretch * (index + 1) * .9;
      const track = sampleTrack(state.chunks, state.distance + state.anchor / state.scale - lag);
      const x = (track.x - state.camera) * state.scale;
      const railPulse = state.reduced ? 0 : Math.sin((state.wheelTravel - lag) * .31 + index) * .42 * Math.min(1, state.velocity / Math.max(1, state.pace));
      const y = (track.y - 11) * state.scale + state.suspension * (1 - index * .12) + railPulse;
      const brakeNod = Phaser.Math.Clamp(-state.acceleration * .00023 * (index + 1), -.018, .018);
      coach.container.setPosition(x, y).setRotation(track.angle + brakeNod);
      if (!coach.sprite.visible) this.drawCoachWheels(coach, state.wheelTravel - lag, state.scale, state.reduced);
    });
  }

  private drawCoachWheels(coach:CoachVisual, wheelTravel:number, scale:number, reduced:boolean):void {
    if (reduced) return;
    const radius = this.coachHeight * .105;
    const angle = wheelTravel * scale / Math.max(4, radius);
    const wheelY = -this.coachHeight * .12;
    coach.wheels.clear();
    for (let i = 0; i < 2; i++) {
      const x = -this.coachWidth * .28 + i * this.coachWidth * .56;
      coach.wheels.fillStyle(0x25342f, 1).fillCircle(x, wheelY, radius);
      coach.wheels.lineStyle(2, 0xf2dfad, .8).strokeCircle(x, wheelY, radius * .68);
      coach.wheels.lineStyle(2, 0xf2dfad, .7).lineBetween(x, wheelY, x + Math.cos(angle) * radius * .68, wheelY + Math.sin(angle) * radius * .68);
    }
  }

  private drawParticles(state:TrainRenderState, headX:number, headY:number, scale:number):void {
    this.particles.clear();
    if (this.trainType === 'steam' && state.velocity > 1 && !state.reduced) {
      const effort = Phaser.Math.Clamp(.35 + Math.max(0, state.acceleration) / 42, 0, 1);
      for (let i = 0; i < 7; i++) {
        const t = ((this.scene.time.now / (1600 - effort * 420) + i / 7) % 1);
        this.particles.fillStyle(0xfffcf1, (1 - t) * (.36 + effort * .3));
        this.particles.fillCircle(headX + this.trainWidth * .395 - t * (65 + state.velocity * .25), headY - this.trainHeight - t * (86 + effort * 42), 5 + t * (13 + effort * 8));
      }
    }
    if (state.acceleration < -22 && state.velocity > 65 && !state.reduced) {
      this.particles.lineStyle(Math.max(1, 1.5 * scale), 0xf5a23b, .8);
      for (let i = 0; i < 5; i++) {
        const x = headX - this.trainWidth * .2 + i * this.trainWidth * .1;
        const y = headY - 2 * scale;
        this.particles.lineBetween(x, y, x - 10 - i * 3, y + 7 + i % 2 * 4);
      }
    }
    if (state.isNight) {
      this.particles.fillStyle(0xfff4bf, .85);
      for (let i = 0; i < 11; i++) {
        const x = (i * 157 + 60) % state.width;
        const y = 32 + (i * 31) % (state.height * .24);
        this.particles.fillCircle(x, y, i % 3 === 0 ? 2 : 1);
      }
    }
  }
}

import Phaser from 'phaser';
import { biomes, type BiomeId } from '../data/catalog';
import { CHUNK_LENGTH, OVERLAP, visibleChunks, type RouteChunk } from './route';
import { sampleTrack, visibleTunnelSegments, type TunnelSegment } from './trackPath';

export interface WorldRenderState {
  chunks: readonly RouteChunk[];
  camera: number;
  biome: BiomeId;
  width: number;
  height: number;
  scale: number;
  reduced: boolean;
  isNight: boolean;
  velocity: number;
  pace: number;
}

export class WorldRenderer {
  private chunksOnScreen = new Map<number, Phaser.GameObjects.Image>();
  private rails: Phaser.GameObjects.TileSprite[] = [];
  private atmosphere: Phaser.GameObjects.Graphics;
  private foreground: Phaser.GameObjects.Graphics;
  private tunnelBack: Phaser.GameObjects.Graphics;
  private tunnelFront: Phaser.GameObjects.Graphics;

  constructor(private scene: Phaser.Scene) {
    this.atmosphere = scene.add.graphics().setDepth(12);
    this.tunnelBack = scene.add.graphics().setDepth(19);
    this.foreground = scene.add.graphics().setDepth(33);
    this.tunnelFront = scene.add.graphics().setDepth(37);
  }

  prepareTextures():void {
    for (const id of Object.keys(biomes)) {
      const tex = this.scene.textures.createCanvas(`blend-${id}`, CHUNK_LENGTH + OVERLAP, 600)!;
      const ctx = tex.context;
      ctx.drawImage(this.scene.textures.get(`biome-${id}`).getSourceImage() as HTMLImageElement, 0, 0, CHUNK_LENGTH + OVERLAP, 600);
      ctx.globalCompositeOperation = 'destination-in';
      const gradient = ctx.createLinearGradient(0, 0, OVERLAP, 0);
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, CHUNK_LENGTH + OVERLAP, 600);
      tex.refresh();
    }
  }

  resize(width:number, scale:number):void {
    const count = Math.ceil(width / (32 * scale)) + 3;
    while (this.rails.length < count) this.rails.push(this.scene.add.tileSprite(0, 0, 33, 31, 'rail').setOrigin(.5, .5).setDepth(20));
    while (this.rails.length > count) this.rails.pop()!.destroy();
  }

  clearRoute():void {
    this.chunksOnScreen.forEach(chunk => chunk.destroy());
    this.chunksOnScreen.clear();
  }

  render(state:WorldRenderState):void {
    this.drawChunks(state);
    this.drawRails(state);
    this.drawTunnels(state.chunks, state.camera, state.width / state.scale, state.scale);
    this.drawAtmosphere(state);
    this.drawForeground(state);
  }

  private wrap(value:number, size:number):number {
    return ((value % size) + size) % size;
  }

  private drawChunks({ chunks, camera, width, height, scale }:WorldRenderState):void {
    const visible = visibleChunks(chunks, camera, width / scale);
    const keys = new Set(visible.map(chunk => chunk.index));
    this.chunksOnScreen.forEach((img, key) => {
      if (!keys.has(key)) {
        img.destroy();
        this.chunksOnScreen.delete(key);
      }
    });
    for (const chunk of visible) {
      let img = this.chunksOnScreen.get(chunk.index);
      if (!img) {
        img = this.scene.add.image(0, 0, chunk.index === 0 ? `biome-${chunk.biome}` : `blend-${chunk.biome}`).setOrigin(0).setDepth(chunk.index);
        this.chunksOnScreen.set(chunk.index, img);
      }
      img.setPosition((chunk.start - camera) * scale, 0).setDisplaySize((CHUNK_LENGTH + OVERLAP) * scale, height);
    }
  }

  private drawRails({ chunks, camera, scale }:WorldRenderState):void {
    const first = Math.floor(camera / 32) * 32;
    this.rails.forEach((rail, i) => {
      const x = first + i * 32;
      const track = sampleTrack(chunks, x);
      rail.setPosition((track.x - camera) * scale, track.y * scale).setSize(34, 31).setScale(scale).setRotation(track.angle);
      rail.tilePositionX = x;
    });
  }

  private drawAtmosphere({ biome, width, height, scale, camera, reduced, isNight, velocity, pace }:WorldRenderState):void {
    this.atmosphere.clear();
    if (reduced) return;
    const time = this.scene.time.now;
    const cloudAlpha = isNight ? .1 : .22;
    for (let i = 0; i < 6; i++) {
      const x = this.wrap(i * 251 - camera * scale * .075 + time * .004, width + 260) - 130;
      const y = (62 + (i % 3) * 38) * scale;
      const r = (16 + (i % 2) * 7) * scale;
      this.atmosphere.fillStyle(0xffffff, cloudAlpha);
      this.atmosphere.fillCircle(x, y, r).fillCircle(x + r * 1.1, y + r * .15, r * .78).fillEllipse(x - r * .05, y + r * .52, r * 3.1, r * .85);
    }
    if (biome === 'snow') this.drawSnow(width, height, scale, camera, isNight);
    else if (biome === 'desert') this.drawSand(width, scale, camera);
    else if (biome === 'forest' || biome === 'countryside') this.drawFireflies(biome, width, scale, camera);
    else if (biome === 'coast') this.drawBirds(width, scale, camera);
    const speedRatio = Math.min(1, velocity / Math.max(1, pace));
    if (speedRatio > .78) {
      this.atmosphere.lineStyle(Math.max(1, scale), 0xffffff, (speedRatio - .78) * .45);
      for (let i = 0; i < 9; i++) {
        const x = this.wrap(i * 149 - time * .12, width + 160) - 80;
        const y = (120 + (i * 53) % 350) * scale;
        this.atmosphere.lineBetween(x, y, x - (35 + i % 3 * 20) * scale, y);
      }
    }
  }

  private drawSnow(width:number, height:number, scale:number, camera:number, isNight:boolean):void {
    this.atmosphere.fillStyle(0xffffff, isNight ? .45 : .78);
    for (let i = 0; i < 42; i++) {
      const time = this.scene.time.now;
      const x = this.wrap(i * 83 + time * (.018 + (i % 4) * .004) - camera * scale * .04, width + 24) - 12;
      const y = this.wrap(i * 47 + time * (.025 + (i % 3) * .007), height + 30) - 15;
      this.atmosphere.fillCircle(x, y, (1 + i % 3) * scale * .72);
    }
  }

  private drawSand(width:number, scale:number, camera:number):void {
    this.atmosphere.fillStyle(0xd7ad70, .12);
    for (let i = 0; i < 9; i++) {
      const x = this.wrap(i * 173 - camera * scale * .3 + this.scene.time.now * .025, width + 180) - 90;
      const y = (430 + (i % 3) * 31) * scale;
      this.atmosphere.fillEllipse(x, y, (80 + i % 2 * 35) * scale, (8 + i % 3 * 3) * scale);
    }
  }

  private drawFireflies(biome:BiomeId, width:number, scale:number, camera:number):void {
    this.atmosphere.fillStyle(biome === 'forest' ? 0xd7d58f : 0xffe6a4, .35);
    for (let i = 0; i < 18; i++) {
      const x = this.wrap(i * 101 - camera * scale * .12 + this.scene.time.now * .012, width + 20) - 10;
      const y = (180 + this.wrap(i * 67 + this.scene.time.now * .01, 260)) * scale;
      this.atmosphere.fillCircle(x, y, (i % 3 === 0 ? 2 : 1) * scale);
    }
  }

  private drawBirds(width:number, scale:number, camera:number):void {
    this.atmosphere.lineStyle(Math.max(1, 1.5 * scale), 0x456779, .45);
    for (let i = 0; i < 5; i++) {
      const x = this.wrap(i * 223 - camera * scale * .12 + this.scene.time.now * .008, width + 100) - 50;
      const y = (112 + (i % 3) * 34) * scale;
      this.atmosphere.beginPath();
      this.atmosphere.moveTo(x - 9 * scale, y);
      this.atmosphere.lineTo(x - 4 * scale, y - 5 * scale);
      this.atmosphere.lineTo(x, y);
      this.atmosphere.lineTo(x + 4 * scale, y - 5 * scale);
      this.atmosphere.lineTo(x + 9 * scale, y);
      this.atmosphere.strokePath();
    }
  }

  private drawForeground({ biome, width, height, scale, camera, reduced }:WorldRenderState):void {
    this.foreground.clear();
    if (reduced) return;
    const shift = camera * scale * .72;
    if (biome === 'countryside' || biome === 'forest') {
      const color = biome === 'forest' ? 0x426f50 : 0x77985e;
      this.foreground.lineStyle(Math.max(1, 2 * scale), color, .38);
      for (let i = 0; i < 34; i++) {
        const x = this.wrap(i * 43 - shift, width + 30) - 15;
        const base = height - (8 + (i % 4) * 4) * scale;
        const sway = Math.sin(this.scene.time.now * .002 + i) * 5 * scale;
        this.foreground.lineBetween(x, base, x + sway, base - (10 + i % 3 * 5) * scale);
      }
    } else if (biome === 'snow') {
      this.foreground.fillStyle(0xeaf4f5, .55);
      for (let i = 0; i < 8; i++) {
        const x = this.wrap(i * 171 - shift, width + 150) - 75;
        this.foreground.fillEllipse(x, height - 4 * scale, 190 * scale, 22 * scale);
      }
    } else if (biome === 'desert') {
      this.foreground.lineStyle(Math.max(1, 2 * scale), 0xc39762, .32);
      for (let i = 0; i < 7; i++) {
        const x = this.wrap(i * 211 - shift, width + 210) - 105;
        this.foreground.strokeEllipse(x, height - 3 * scale, 230 * scale, 30 * scale);
      }
    } else {
      this.foreground.fillStyle(0xd8c9a1, .25);
      for (let i = 0; i < 18; i++) {
        const x = this.wrap(i * 79 - shift, width + 40) - 20;
        this.foreground.fillEllipse(x, height - (4 + i % 3 * 3) * scale, (7 + i % 4 * 2) * scale, (3 + i % 2) * scale);
      }
    }
  }

  private drawTunnels(chunks:readonly RouteChunk[], camera:number, viewport:number, scale:number):void {
    this.tunnelBack.clear();
    this.tunnelFront.clear();
    const segments = visibleTunnelSegments(chunks, camera, viewport);
    for (const segment of segments) this.drawTunnel(chunks, segment, camera, scale);
  }

  private drawTunnel(chunks:readonly RouteChunk[], segment:TunnelSegment, camera:number, scale:number):void {
    const start = sampleTrack(chunks, segment.start);
    const end = sampleTrack(chunks, segment.end);
    const peak = sampleTrack(chunks, segment.peak);
    const x1 = (segment.start - camera) * scale;
    const x2 = (segment.end - camera) * scale;
    const width = x2 - x1;
    const y = Math.min(start.y, end.y, peak.y) * scale;
    const floor = Math.max(start.y, end.y, peak.y) * scale + 30 * scale;
    const mountain = segment.biome === 'snow' ? 0x8da3ae : 0x526f55;
    const shade = segment.biome === 'snow' ? 0x5f737e : 0x334d3a;
    const mouth = 0x1d2929;

    this.tunnelBack.fillStyle(mountain, .92);
    this.tunnelBack.fillEllipse(x1 + width * .5, floor - 8 * scale, width + 250 * scale, 190 * scale);
    this.tunnelBack.fillStyle(shade, .82);
    this.tunnelBack.fillEllipse(x1 + width * .5, floor + 10 * scale, width + 110 * scale, 96 * scale);
    this.tunnelBack.fillStyle(mouth, .96);
    this.tunnelBack.fillEllipse(x1 + 8 * scale, floor + 4 * scale, 78 * scale, 96 * scale);
    this.tunnelBack.fillEllipse(x2 - 8 * scale, floor + 4 * scale, 78 * scale, 96 * scale);

    this.tunnelFront.fillStyle(mountain, .98);
    this.tunnelFront.fillEllipse(x1 + width * .5, floor - 3 * scale, width + 230 * scale, 176 * scale);
    this.tunnelFront.fillStyle(mouth, 1);
    this.tunnelFront.fillEllipse(x1 + 8 * scale, floor + 5 * scale, 88 * scale, 106 * scale);
    this.tunnelFront.fillEllipse(x2 - 8 * scale, floor + 5 * scale, 88 * scale, 106 * scale);
    this.tunnelFront.fillStyle(0x111b1d, .94);
    this.tunnelFront.fillRect(x1 + 8 * scale, floor - 45 * scale, width - 16 * scale, 96 * scale);
    this.tunnelFront.fillStyle(mountain, 1);
    this.tunnelFront.fillRect(x1 - 70 * scale, floor + 28 * scale, width + 140 * scale, 86 * scale);
    this.tunnelFront.lineStyle(Math.max(2, 3 * scale), 0xf2efe0, .32);
    this.tunnelFront.strokeEllipse(x1 + 8 * scale, floor + 5 * scale, 88 * scale, 106 * scale);
    this.tunnelFront.strokeEllipse(x2 - 8 * scale, floor + 5 * scale, 88 * scale, 106 * scale);
    if (segment.biome === 'snow') {
      this.tunnelFront.fillStyle(0xf3fbff, .72);
      for (let i = 0; i < 5; i++) this.tunnelFront.fillEllipse(x1 + width * (.16 + i * .17), y + 42 * scale + (i % 2) * 9 * scale, 72 * scale, 12 * scale);
    }
  }
}

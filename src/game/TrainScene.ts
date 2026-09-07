import Phaser from "phaser";
import { asset, biomes, trains, type BiomeId, type TrainId } from "../data/catalog";
import { CameraController } from "./CameraController";
import { brakingSpeed, stepMotion } from "./motion";
import { CHUNK_LENGTH, createRoute, type RouteChunk } from "./route";
import { getTunnelSegmentAt, sampleTrack } from "./trackPath";
import { TrainRenderer } from "./TrainRenderer";
import { WorldRenderer } from "./WorldRenderer";

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
export interface SceneCallbacks {
  ready: () => void;
  failed: (file: string) => void;
  change: (state: SceneSnapshot) => void;
  horn: () => void;
}

export const TRAIN_BASE_SPEED = 80;
const TRAIN_MAX_SPEED = 210;

/** Rendering owns a bounded pool of chunks; UI owns choices and speech. */
export class TrainScene extends Phaser.Scene {
  private callbacks: SceneCallbacks;
  private chunks: RouteChunk[] = createRoute(["countryside", "forest", "coast", "desert", "snow", "forest", "countryside"]);
  private world?: WorldRenderer;
  private trainRenderer?: TrainRenderer;
  private cameraController = new CameraController();
  private darkness!: Phaser.GameObjects.Rectangle;
  private trainType: TrainId = "steam";
  private distance = 0;
  private velocity = 0;
  private acceleration = 0;
  private targetVelocity = 0;
  private pace = 135;
  private doorsOpen = false;
  private doorFraction = 0;
  private isNight = false;
  private arrived = false;
  private ready = false;
  private lastSnapshot = "";
  private lastProgress = -1;
  private reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  private honkUntil = 0;
  private missingAssets = false;
  private suspension = 0;
  private suspensionVelocity = 0;
  private couplerStretch = 0;
  private couplerVelocity = 0;
  private wheelTravel = 0;

  constructor(callbacks: SceneCallbacks) {
    super("TrainWorld");
    this.callbacks = callbacks;
  }
  preload(): void {
    for (const t of trains) this.load.image(t.id, asset(`${t.id}.png`));
    for (const id of Object.keys(biomes)) this.load.image(`biome-${id}`, asset(`biome-${id}.webp`));
    for (let i = 0; i < 3; i++) this.load.image(`wheel-${i}`, asset(`wheel-${i}.png`));
    for (const t of trains) if (t.door) this.load.image(`door-${t.id}`, asset(`door-${t.id}.png`));
    this.load.image("rail", asset("rail.webp"));
    this.load.on("loaderror", (file: Phaser.Loader.File) => {
      this.missingAssets = true;
      this.callbacks.failed(file.key);
    });
  }
  create(): void {
    if (this.missingAssets) return;
    this.world = new WorldRenderer(this);
    this.world.prepareTextures();
    this.trainRenderer = new TrainRenderer(this, () => this.callbacks.horn());
    this.darkness = this.add.rectangle(0, 0, 1, 1, 0x122342, 0).setOrigin(0).setDepth(40);
    this.ready = true;
    this.resize();
    this.scale.on("resize", this.resize, this);
    this.events.once("shutdown", () => this.scale.off("resize", this.resize, this));
    this.callbacks.ready();
    this.publish();
  }
  private dimensions() {
    const w = this.scale.width,
      h = this.scale.height;
    return { w, h, s: h / 600, anchor: w * 0.48 };
  }
  private resize(): void {
    if (!this.ready) return;
    const { w, h, s } = this.dimensions();
    this.darkness.setSize(w, h);
    this.world?.resize(w, s);
    this.trainRenderer?.resize(w, h);
    this.renderWorld();
  }
  selectTrain(id: TrainId): void {
    if (!this.ready) return;
    this.stopImmediately();
    this.trainType = id;
    this.doorsOpen = false;
    this.doorFraction = 0;
    this.trainRenderer?.selectTrain(id);
    this.publish();
  }
  setRoute(stops: BiomeId[]): void {
    if (!this.ready || stops.length < 2) return;
    this.stopImmediately();
    this.chunks = createRoute(stops);
    this.distance = 0;
    this.cameraController.reset();
    this.wheelTravel = 0;
    this.arrived = false;
    this.doorsOpen = false;
    this.doorFraction = 0;
    this.world?.clearRoute();
    this.renderWorld();
    this.publish();
  }
  toggleRunning(): void {
    if (!this.ready) return;
    if (this.arrived) {
      this.distance = 0;
      this.arrived = false;
    }
    if (this.targetVelocity > 0) this.targetVelocity = 0;
    else {
      this.doorsOpen = false;
      this.targetVelocity = this.pace;
    }
    this.publish();
  }
  accelerate(): void {
    if (!this.ready) return;
    if (this.arrived) {
      this.distance = 0;
      this.cameraController.reset();
      this.wheelTravel = 0;
      this.arrived = false;
    }
    this.doorsOpen = false;
    this.targetVelocity = Math.min(TRAIN_MAX_SPEED, Math.max(TRAIN_BASE_SPEED, this.targetVelocity + 55));
    this.pace = Math.max(this.pace, this.targetVelocity);
    this.publish();
  }
  brake(): void {
    if (!this.ready) return;
    this.targetVelocity = 0;
    this.publish();
  }
  stopImmediately(): void {
    this.velocity = 0;
    this.acceleration = 0;
    this.targetVelocity = 0;
    this.suspension = 0;
    this.suspensionVelocity = 0;
    this.couplerStretch = 0;
    this.couplerVelocity = 0;
    this.publish();
  }
  toggleDoor(): boolean {
    if (!this.ready || this.velocity > 0.5 || this.targetVelocity > 0) return false;
    this.doorsOpen = !this.doorsOpen;
    this.publish();
    return true;
  }
  setPace(value: number): void {
    this.pace = value;
    if (this.targetVelocity > 0) this.targetVelocity = value;
  }
  setNight(value: boolean): void {
    this.isNight = value;
  }
  honk(): void {
    this.honkUntil = this.time.now + 750;
  }
  restart(): void {
    this.distance = 0;
    this.cameraController.reset();
    this.wheelTravel = 0;
    this.arrived = false;
    this.velocity = 0;
    this.acceleration = 0;
    this.targetVelocity = 0;
    this.doorsOpen = false;
    this.toggleRunning();
  }
  private routeEnd(): number {
    const { w, s } = this.dimensions();
    return Math.max(100, this.chunks.length * CHUNK_LENGTH - w / s);
  }
  private snapshot(): SceneSnapshot {
    const { s, anchor } = this.dimensions();
    const i = sampleTrack(this.chunks, this.distance + anchor / s).index;
    return {
      moving: this.targetVelocity > 0,
      stopping: this.targetVelocity === 0 && this.velocity > 0.5,
      doorsOpen: this.doorsOpen,
      progress: Math.min(1, this.distance / this.routeEnd()),
      biome: this.chunks[i].biome as BiomeId,
      chunkIndex: i,
      arrived: this.arrived,
      speed: this.velocity,
      acceleration: this.acceleration,
    };
  }
  private publish(): void {
    if (!this.ready) return;
    const state = this.snapshot();
    const speedBand = Math.round(state.speed / 6);
    const key = `${state.moving}|${state.stopping}|${state.doorsOpen}|${state.biome}|${state.chunkIndex}|${state.arrived}|${speedBand}`;
    const percent = Math.round(state.progress * 100);
    if (key !== this.lastSnapshot || percent !== this.lastProgress) {
      this.lastSnapshot = key;
      this.lastProgress = percent;
      this.callbacks.change(state);
    }
  }
  private renderWorld(): void {
    const { w, h, s, anchor } = this.dimensions();
    const camera = this.cameraController.distance;
    const track = sampleTrack(this.chunks, this.distance + anchor / s);
    const tunnel = getTunnelSegmentAt(this.chunks, this.distance + anchor / s);
    const biome = this.chunks[track.index].biome as BiomeId;
    this.world?.render({
      chunks: this.chunks,
      camera,
      biome,
      width: w,
      height: h,
      scale: s,
      reduced: this.reduced,
      isNight: this.isNight,
      velocity: this.velocity,
      pace: this.pace,
    });
    this.trainRenderer?.render({
      chunks: this.chunks,
      trainType: this.trainType,
      distance: this.distance,
      camera,
      anchor,
      scale: s,
      width: w,
      height: h,
      velocity: this.velocity,
      acceleration: this.acceleration,
      pace: this.pace,
      doorFraction: this.doorFraction,
      suspension: this.suspension,
      couplerStretch: this.couplerStretch,
      wheelTravel: this.wheelTravel,
      honking: this.time.now < this.honkUntil,
      isNight: this.isNight,
      inTunnel: Boolean(tunnel),
      reduced: this.reduced,
    });
  }
  update(_time: number, delta: number): void {
    if (!this.ready) return;
    const dt = Math.min(delta / 1000, 0.06);
    this.doorFraction = Phaser.Math.Linear(this.doorFraction, this.doorsOpen ? 1 : 0, Math.min(1, dt * 7));
    // Doors remove traction; the station speed cap creates a natural automatic approach.
    const requested = this.doorFraction > 0.03 ? 0 : this.targetVelocity;
    const remaining = Math.max(0, this.routeEnd() - this.distance);
    const stationLimit = brakingSpeed(Math.max(0, remaining - 10), 42);
    const target = Math.min(requested, stationLimit);
    const motion = stepMotion({ speed: this.velocity, acceleration: this.acceleration }, target, dt);
    this.velocity = motion.speed;
    this.acceleration = motion.acceleration;
    this.distance = Math.min(this.routeEnd(), this.distance + this.velocity * dt);
    const { s } = this.dimensions();
    const speedRatio = Math.min(1, this.velocity / Math.max(1, this.pace));
    this.cameraController.follow(this.distance, this.velocity, this.pace, this.acceleration, s, this.routeEnd(), dt);
    const railPulse = this.reduced ? 0 : Math.sin(this.distance * 0.31) * 0.72 * speedRatio;
    const suspensionTarget = railPulse - Phaser.Math.Clamp(this.acceleration * 0.018, -0.9, 0.9);
    this.suspensionVelocity += (suspensionTarget - this.suspension) * 55 * dt;
    this.suspensionVelocity *= Math.exp(-10 * dt);
    this.suspension += this.suspensionVelocity * dt;
    const stretchTarget = this.reduced ? 0 : Phaser.Math.Clamp(this.acceleration * 0.11, -4.8, 4.2);
    this.couplerVelocity += (stretchTarget - this.couplerStretch) * 34 * dt;
    this.couplerVelocity *= Math.exp(-8 * dt);
    this.couplerStretch += this.couplerVelocity * dt;
    if ((remaining <= 12 && this.velocity < 1) || this.distance >= this.routeEnd()) {
      this.distance = this.routeEnd();
      this.velocity = 0;
      this.acceleration = 0;
      this.targetVelocity = 0;
      this.arrived = true;
    }
    this.wheelTravel += this.velocity * dt;
    this.renderWorld();
    this.publish();
  }
}

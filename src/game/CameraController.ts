import Phaser from 'phaser';

export class CameraController {
  distance = 0;

  reset():void {
    this.distance = 0;
  }

  follow(trainDistance:number, speed:number, pace:number, acceleration:number, scale:number, routeEnd:number, dt:number):void {
    const speedRatio = Math.min(1, speed / Math.max(1, pace));
    const lookAhead = (20 + speedRatio * 68 + Phaser.Math.Clamp(acceleration, 0, 34) * 1.4) / scale;
    const target = Phaser.Math.Clamp(trainDistance + lookAhead, 0, routeEnd);
    this.distance = Phaser.Math.Linear(this.distance, target, 1 - Math.exp(-3.8 * dt));
  }
}

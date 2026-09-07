export interface MotionState {
  speed: number;
  acceleration: number;
}

export interface MotionProfile {
  traction: number;
  brake: number;
  jerk: number;
}

export const TRAIN_MOTION: MotionProfile = {
  traction: 34,
  brake: 48,
  jerk: 85,
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const moveTowards = (value: number, target: number, amount: number): number => {
  if (value < target) return Math.min(value + amount, target);
  return Math.max(value - amount, target);
};

/** Maximum speed that can still stop within the supplied distance. */
export function brakingSpeed(distance: number, brake = TRAIN_MOTION.brake): number {
  return Math.sqrt(2 * Math.max(0.001, brake) * Math.max(0, distance));
}

/**
 * Jerk-limited train motion. Acceleration changes gradually, so starting and
 * braking have weight without requiring a full rigid-body simulation.
 */
export function stepMotion(
  state: Readonly<MotionState>,
  targetSpeed: number,
  deltaSeconds: number,
  profile: Readonly<MotionProfile> = TRAIN_MOTION,
): MotionState {
  const dt = clamp(deltaSeconds, 0, 0.08);
  if (dt === 0) return { ...state };

  const target = Math.max(0, targetSpeed);
  const difference = target - state.speed;
  const desiredAcceleration = Math.abs(difference) < 0.05
    ? 0
    : difference > 0
      ? profile.traction
      : -profile.brake;

  let acceleration = moveTowards(state.acceleration, desiredAcceleration, profile.jerk * dt);
  let speed = Math.max(0, state.speed + acceleration * dt);

  if ((difference >= 0 && speed >= target) || (difference <= 0 && speed <= target)) {
    speed = target;
    acceleration = 0;
  }
  if (speed === 0 && target === 0) acceleration = 0;

  return { speed, acceleration };
}

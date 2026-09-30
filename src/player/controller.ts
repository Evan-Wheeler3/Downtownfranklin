import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/physics';

/** Input intent for one frame — produced by InputState (or tests/bots), consumed here. */
export interface MoveIntent {
  forward: number; // -1..1
  right: number; // -1..1
  sprint: boolean;
  jump: boolean;
  fly: boolean;
  up: number; // fly mode vertical -1..1
}

export const PLAYER = {
  height: 1.75,
  radius: 0.3,
  eye: 1.62,
  walkSpeed: 1.45, // m/s, typical adult walking pace
  sprintSpeed: 5.0,
  flySpeed: 25,
  jumpSpeed: 4.2,
  gravity: 9.81,
  stepHeight: 0.35, // curbs
  maxSlopeDeg: 50,
};

/**
 * Kinematic capsule character driven by Rapier's KinematicCharacterController.
 * Position is the capsule's feet point.
 */
export class PlayerController {
  readonly pos = { x: 0, y: 0, z: 0 };
  yaw = 0; // radians, 0 = looking toward -z (north)
  pitch = 0;
  private vy = 0;
  grounded = false;
  private body: RAPIER.RigidBody;
  private collider: RAPIER.Collider;
  private kcc: RAPIER.KinematicCharacterController;

  constructor(phys: PhysicsWorld) {
    const R = phys.R;
    const half = PLAYER.height / 2 - PLAYER.radius;
    this.body = phys.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0, 0));
    this.collider = phys.world.createCollider(R.ColliderDesc.capsule(half, PLAYER.radius), this.body);
    this.kcc = phys.world.createCharacterController(0.02);
    this.kcc.enableAutostep(PLAYER.stepHeight, 0.2, true);
    this.kcc.enableSnapToGround(0.4);
    this.kcc.setMaxSlopeClimbAngle((PLAYER.maxSlopeDeg * Math.PI) / 180);
    this.kcc.setMinSlopeSlideAngle((60 * Math.PI) / 180);
    this.kcc.setApplyImpulsesToDynamicBodies(false);
  }

  teleport(x: number, y: number, z: number): void {
    this.pos.x = x;
    this.pos.y = y;
    this.pos.z = z;
    this.vy = 0;
    this.body.setTranslation({ x, y: y + PLAYER.height / 2, z }, true);
    this.body.setNextKinematicTranslation({ x, y: y + PLAYER.height / 2, z });
  }

  update(dt: number, intent: MoveIntent, collisionReady: boolean): void {
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // forward = (-sin, -cos) in x/z for yaw measured from -z toward -x (three.js camera convention)
    const fx = -sin;
    const fz = -cos;
    const rx = cos;
    const rz = -sin;
    let mx = fx * intent.forward + rx * intent.right;
    let mz = fz * intent.forward + rz * intent.right;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) {
      mx /= ml;
      mz /= ml;
    }

    if (intent.fly || !collisionReady) {
      const s = intent.fly ? PLAYER.flySpeed * (intent.sprint ? 3 : 1) : 0;
      this.pos.x += mx * s * dt;
      this.pos.z += mz * s * dt;
      this.pos.y += intent.up * s * dt;
      this.vy = 0;
      this.body.setNextKinematicTranslation({ x: this.pos.x, y: this.pos.y + PLAYER.height / 2, z: this.pos.z });
      this.body.setTranslation({ x: this.pos.x, y: this.pos.y + PLAYER.height / 2, z: this.pos.z }, true);
      return;
    }

    const speed = intent.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    if (this.grounded && intent.jump) this.vy = PLAYER.jumpSpeed;
    this.vy -= PLAYER.gravity * dt;
    if (this.vy < -50) this.vy = -50;
    const desired = { x: mx * speed * dt, y: this.vy * dt, z: mz * speed * dt };
    this.kcc.computeColliderMovement(this.collider, desired);
    const m = this.kcc.computedMovement();
    this.grounded = this.kcc.computedGrounded();
    if (this.grounded && this.vy < 0) this.vy = 0;
    const t = this.body.translation();
    const next = { x: t.x + m.x, y: t.y + m.y, z: t.z + m.z };
    this.body.setNextKinematicTranslation(next);
    this.pos.x = next.x;
    this.pos.y = next.y - PLAYER.height / 2;
    this.pos.z = next.z;
  }
}

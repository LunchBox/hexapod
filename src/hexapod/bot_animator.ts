/** Two-path keyframe animation engine for the bot's mesh and body_mesh.
 *
 *  Path A — Gait walking (`meshKfs` / `meshDurations`)
 *    GaitController.move_body() pre-computes N+1 mesh poses + N segment
 *    durations + per-leg servo keyframes; applyMeshKeyframes() loads them.
 *    update() interpolates `bot.mesh.position` / `rotation.y` and the legs
 *    animate independently via their own `_output` (see CLAUDE.md Path A).
 *
 *  Path B — Body control (`bodyKfs` / `bodyDurations`)
 *    transform_body_servo() pre-computes body_mesh poses + per-leg servo
 *    keyframes; applyBodyKeyframes() loads the body track only (legs are
 *    pre-loaded by the caller). update() interpolates body_mesh and lets
 *    legs animate through their pre-computed keyframes (CLAUDE.md Path B).
 *
 *  This class owns only animation state. `_servo_anim_disabled` is a
 *  cross-cutting flag read by HexapodLeg and gaits.ts — it stays on Hexapod.
 */
export class BotAnimator {
  // Path A — gait walking
  meshKfs: { pos: any; rotY: number }[] | null = null;
  meshDurations: number[] = [];
  meshSegmentIdx: number = 0;
  meshSegmentStart: number = 0;

  // Path B — body control
  bodyKfs: { pos: any; rot: any }[] | null = null;
  bodyDurations: number[] = [];
  bodySegmentIdx: number = 0;
  bodySegmentStart: number = 0;
  onBodyAnimComplete: (() => void) | null = null;

  /** Path A: load mesh keyframes + per-leg servo keyframes (gait walking).
   *  Reverts leg joints to keyframe-0 visual state so the animation starts smoothly. */
  applyMeshKeyframes(
    bot: any,
    meshKfs: { pos: any; rotY: number }[],
    durations: number[],
    servoKfs: number[][][],  // [legIdx][k][jointIdx]
  ) {
    const now = performance.now();
    this.meshKfs = meshKfs;
    this.meshDurations = durations;
    this.meshSegmentIdx = 0;
    this.meshSegmentStart = now;

    for (let i = 0; i < bot.legs.length; i++) {
      const leg = bot.legs[i];
      leg._output.setKeyframes(servoKfs[i], now); // sync with mesh segment timer
      const kf0 = servoKfs[i][0];
      for (let j = 0; j < leg.joint_count; j++) {
        leg._set_joint_rotation(j, kf0[j]);
        leg.limbs[j]._rendered_servo_value = kf0[j];
      }
    }
  }

  /** Path B: load body_mesh keyframes only. Per-leg servo keyframes are
   *  pre-loaded by the caller (transform_body_servo). */
  applyBodyKeyframes(
    bodyKfs: { pos: any; rot: any }[],
    durations: number[],
    startTime: number,
  ) {
    this.bodyKfs = bodyKfs;
    this.bodyDurations = durations;
    this.bodySegmentIdx = 0;
    this.bodySegmentStart = startTime;
  }

  /** Stop both paths immediately. Called when switching out of servo_constraint mode. */
  stop() {
    this.meshKfs = null;
    this.bodyKfs = null;
  }

  /** Whether either mesh or body_mesh keyframe animation is in progress. */
  isAnimating(): boolean {
    return this.meshKfs !== null || this.bodyKfs !== null;
  }

  /** Advance one rAF frame. Mutates bot.mesh / bot.body_mesh. Returns true if
   *  either path was animating this frame. Caller is responsible for legs and
   *  for calling sync_guide_circles after this if anyAnimating. */
  update(now: number, bot: any): boolean {
    let anyAnimating = false;

    // Path A — mesh
    if (this.meshKfs && this.meshSegmentIdx < this.meshDurations.length) {
      anyAnimating = true;
      const dur = this.meshDurations[this.meshSegmentIdx];
      const elapsed = now - this.meshSegmentStart;
      const t = dur > 0.001 ? Math.min(1, elapsed / dur) : 1;

      const kf0 = this.meshKfs[this.meshSegmentIdx];
      const kf1 = this.meshKfs[this.meshSegmentIdx + 1];
      bot.mesh.position.x = kf0.pos.x + (kf1.pos.x - kf0.pos.x) * t;
      bot.mesh.position.z = kf0.pos.z + (kf1.pos.z - kf0.pos.z) * t;
      bot.mesh.rotation.y = kf0.rotY + (kf1.rotY - kf0.rotY) * t;

      if (t >= 1) {
        this.meshSegmentIdx++;
        this.meshSegmentStart = now;
        if (this.meshSegmentIdx >= this.meshDurations.length) {
          this.meshKfs = null;
        }
      }
    }

    // Path B — body_mesh
    // Leg servos animate independently through pre-computed keyframes loaded
    // by transform_body_servo — no per-frame IK needed here.
    if (this.bodyKfs && this.bodySegmentIdx < this.bodyDurations.length) {
      anyAnimating = true;
      const dur = this.bodyDurations[this.bodySegmentIdx];
      const elapsed = now - this.bodySegmentStart;
      const t = dur > 0.001 ? Math.min(1, elapsed / dur) : 1;

      const bKf0 = this.bodyKfs[this.bodySegmentIdx];
      const bKf1 = this.bodyKfs[this.bodySegmentIdx + 1];
      bot.body_mesh.position.x = bKf0.pos.x + (bKf1.pos.x - bKf0.pos.x) * t;
      bot.body_mesh.position.y = bKf0.pos.y + (bKf1.pos.y - bKf0.pos.y) * t;
      bot.body_mesh.position.z = bKf0.pos.z + (bKf1.pos.z - bKf0.pos.z) * t;
      bot.body_mesh.rotation.x = bKf0.rot.x + (bKf1.rot.x - bKf0.rot.x) * t;
      bot.body_mesh.rotation.y = bKf0.rot.y + (bKf1.rot.y - bKf0.rot.y) * t;
      bot.body_mesh.rotation.z = bKf0.rot.z + (bKf1.rot.z - bKf0.rot.z) * t;
      bot.body_mesh.updateMatrixWorld();
      bot.mesh.updateMatrixWorld();

      if (t >= 1) {
        this.bodySegmentIdx++;
        this.bodySegmentStart = now;
        if (this.bodySegmentIdx >= this.bodyDurations.length) {
          this.bodyKfs = null;
          if (this.onBodyAnimComplete) {
            const cb = this.onBodyAnimComplete;
            this.onBodyAnimComplete = null;
            cb();
          }
        }
      }
    }

    return anyAnimating;
  }
}

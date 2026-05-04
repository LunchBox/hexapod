/**
 * ServoOutput — strategy pattern for servo value application.
 *
 * DirectOutput:  values applied instantly (none physics mode).
 * AnimatedOutput: values animated through keyframes at fixed servo speed.
 *
 * This isolates ALL animation state and timing logic from HexapodLeg,
 * making the animation system independently testable and the leg code
 * immune to mode-switching bugs.
 */
export interface ServoOutput {
  /** Current rendered (visual) servo values. */
  readonly renderedValues: number[];
  /** Whether an animation is in progress. */
  isAnimating(): boolean;
  /** Apply new servo targets. capturedRendered optionally freezes
   *  the visual state at the moment before IK ran. */
  setTargets(targets: number[], capturedRendered?: number[]): void;
  /** Advance animation by one frame. Returns interpolated values to apply,
   *  or null when idle. */
  update(now: number, speed: number, applyJoint: (idx: number, val: number) => void): boolean;
  /** Pre-load multi-segment keyframes for body movement animation.
   *  keyframes.length must be >= 2. renderedValues is reset to keyframes[0].
   *  startTime optionally sets the segment timer start (for mesh/leg sync). */
  setKeyframes(keyframes: number[][], startTime?: number): void;
  /** Discard animation state. */
  reset(): void;
}

// ── DirectOutput ────────────────────────────────────────────────

export class DirectOutput implements ServoOutput {
  readonly renderedValues: number[];

  constructor(limbCount: number, initialRendered: number[]) {
    this.renderedValues = initialRendered.slice();
  }

  isAnimating(): boolean { return false; }

  setTargets(targets: number[], _capturedRendered?: number[]): void {
    for (let i = 0; i < this.renderedValues.length; i++) {
      this.renderedValues[i] = Math.round(targets[i]);
    }
  }

  setKeyframes(_keyframes: number[][], _startTime?: number): void {}

  update(_now: number, _speed: number, _applyJoint: (idx: number, val: number) => void): boolean {
    return false;
  }

  reset(): void {}
}

// ── AnimatedOutput ──────────────────────────────────────────────

export class AnimatedOutput implements ServoOutput {
  readonly renderedValues: number[];
  private _keyframes: number[][] | null = null;
  private _currentSegment = 0;
  private _segmentStartTime = -1;

  constructor(limbCount: number, initialRendered: number[]) {
    this.renderedValues = initialRendered.slice();
  }

  isAnimating(): boolean {
    return this._keyframes !== null;
  }

  setTargets(targets: number[], capturedRendered?: number[]): void {
    const rendered = capturedRendered ?? this.renderedValues.slice();
    const rounded = targets.map(v => Math.round(v));
    this._keyframes = [rendered, rounded];
    this._currentSegment = 0;
    this._segmentStartTime = -1; // will be set on first update() frame
    for (let i = 0; i < this.renderedValues.length; i++) {
      this.renderedValues[i] = rendered[i];
    }
  }

  setKeyframes(keyframes: number[][], startTime?: number): void {
    this._keyframes = keyframes.map(kf => kf.slice());
    this._currentSegment = 0;
    this._segmentStartTime = startTime ?? -1;
    const kf0 = this._keyframes[0];
    for (let i = 0; i < this.renderedValues.length; i++) {
      this.renderedValues[i] = kf0[i];
    }
  }

  update(now: number, speed: number, applyJoint: (idx: number, val: number) => void): boolean {
    const kfs = this._keyframes;
    if (!kfs || this._currentSegment >= kfs.length - 1) {
      this._keyframes = null;
      return false;
    }

    // Initialize segment timer on first frame (setTargets/setKeyframes use -1 sentinel)
    if (this._segmentStartTime < 0) {
      this._segmentStartTime = now;
    }

    const kf0 = kfs[this._currentSegment];
    const kf1 = kfs[this._currentSegment + 1];

    let maxDelta = 0;
    for (let i = 0; i < kf0.length; i++) {
      maxDelta = Math.max(maxDelta, Math.abs(kf1[i] - kf0[i]));
    }

    const durationMs = (maxDelta / speed) * 1000;
    const elapsed = now - this._segmentStartTime;
    const t = durationMs > 0.001 ? Math.min(1, elapsed / durationMs) : 1;

    for (let i = 0; i < kf0.length; i++) {
      const v = kf0[i] + (kf1[i] - kf0[i]) * t;
      this.renderedValues[i] = v;
      applyJoint(i, v);
    }

    if (t >= 1) {
      this._currentSegment++;
      this._segmentStartTime = now;
      if (this._currentSegment >= kfs.length - 1) {
        this._keyframes = null;
        return false;
      }
    }

    return true;
  }

  reset(): void {
    this._keyframes = null;
  }
}

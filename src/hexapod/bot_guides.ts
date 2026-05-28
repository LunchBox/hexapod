import * as THREE from 'three';

/** Owns the per-bot guide system:
 *   - `pos` / `pivot`: pivot at body ground center, `pos` child with rotation/translation
 *     used as the unified reference frame for gait movement targets
 *   - `localPositions`: stable home tip positions in pivot-local space
 *     (CLAUDE.md "Reference line system" — vertex source for guidelines, NOT current animated tips)
 *   - `guideline` / `left_gl` / `right_gl`: child meshes of `bot.mesh`, lines from body center to
 *     home tips; `left_gl` / `right_gl` are clones rotated by ±rotate_step
 *   - `circles` / `labels`: world-space ground markers tracking current tip positions
 *
 *  All methods take `bot` as their first parameter — this class is a focused state container
 *  with rendering side-effects on the bot's scene graph; it does not back-reference bot.
 */
export class BotGuides {
  pos: any = null;
  pivot: any = null;
  localPositions: any[] = [];
  guideline: any = null;
  left_gl: any = null;
  right_gl: any = null;
  circles: any[] = [];
  labels: any[] = [];

  /** Remove world-space circles + labels from scene and clear all guide state.
   *  Called at the top of apply_attributes before the bot is rebuilt. */
  dispose(scene: any) {
    for (const c of this.circles) scene.remove(c);
    for (const l of this.labels) scene.remove(l);
    this.circles = [];
    this.labels = [];
    this.pivot = null;
    this.pos = null;
    this.localPositions = [];
    this.guideline = null;
    this.left_gl = null;
    this.right_gl = null;
  }

  /** Draw guide circles + labels in world space, set up pivot + pos for gait targets.
   *  Equivalent to legacy draw_gait_guide(). */
  drawGuide(bot: any) {
    const total_legs = bot.legs.length;
    for (let i = 0; i < total_legs; i++) {
      const tip = bot.legs[i].get_tip_pos();
      const geom = new (THREE as any).CircleGeometry(7, 16);
      const mat = new (THREE as any).MeshBasicMaterial({ color: 0x111111, side: (THREE as any).DoubleSide });
      const sq = new THREE.Mesh(geom, mat);
      sq.position.set(tip.x, 0, tip.z);
      sq.rotation.x = -Math.PI / 2;
      bot.scene.add(sq);
      this.circles.push(sq);

      // Number label flat on the ground, offset outward from tip
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 256;
      const ctx = canvas.getContext('2d')!;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.font = 'bold 192px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeText(String(i), 128, 128);
      const tex = new (THREE as any).Texture(canvas);
      tex.needsUpdate = true;
      const labelMat = new (THREE as any).MeshBasicMaterial({ map: tex, side: (THREE as any).DoubleSide, depthTest: false, depthWrite: false, transparent: true });
      const labelGeom = new (THREE as any).PlaneGeometry(60, 60);
      const label = new THREE.Mesh(labelGeom, labelMat);
      const cx = bot.mesh.position.x;
      const cz = bot.mesh.position.z;
      const dx = tip.x - cx; const dz = tip.z - cz;
      const dist = Math.sqrt(dx * dx + dz * dz) || 1;
      const offset = 48;
      label.position.set(tip.x + (dx / dist) * offset, 0.1, tip.z + (dz / dist) * offset);
      label.rotation.x = -Math.PI / 2;
      bot.scene.add(label);
      this.labels.push(label);
    }

    // Pivot at body ground center — rotation center for `pos`
    this.pivot = new THREE.Object3D();
    this.pivot.position.set(
      bot.body_mesh.position.x, 0, bot.body_mesh.position.z,
    );
    bot.mesh.add(this.pivot);

    // `pos` as child of pivot — its rotation/translation are relative to pivot origin
    this.pos = new THREE.Object3D();
    this.pivot.add(this.pos);

    // localPositions in pivot-local space (so body center = pivot origin = (0,0,0))
    this.localPositions = [];
    bot.mesh.updateMatrixWorld();
    this.pivot.updateMatrixWorld();
    for (let i = 0; i < total_legs; i++) {
      const worldPos = bot.legs[i].get_tip_pos();
      this.localPositions.push(this.pivot.worldToLocal(worldPos.clone()));
    }
    this.localPositions.push(new THREE.Vector3(0, 0, 0)); // body center at index N
  }

  /** Update circles + labels to track current tip positions. SAFE during animation. */
  syncCircles(bot: any) {
    for (let i = 0; i < bot.legs.length; i++) {
      const sq = this.circles[i];
      if (sq) {
        const tip = bot.legs[i].get_tip_pos();
        sq.position.set(tip.x, 0, tip.z);
      }
    }
    const cx = bot.mesh.position.x;
    const cz = bot.mesh.position.z;
    const offset = 48;
    for (let i = 0; i < bot.legs.length; i++) {
      const sp = this.labels[i];
      if (sp) {
        const tip = bot.legs[i].get_tip_pos();
        const dx = tip.x - cx; const dz = tip.z - cz;
        const dist = Math.sqrt(dx * dx + dz * dz) || 1;
        sp.position.set(tip.x + (dx / dist) * offset, 0.1, tip.z + (dz / dist) * offset);
      }
    }
  }

  /** Reset `pos` to identity relative to pivot, and re-sync pivot to body ground center
   *  (body_mesh may have moved via transform_body). */
  resetPos(bot: any) {
    if (!this.pos) return;
    if (this.pivot) {
      this.pivot.position.set(
        bot.body_mesh.position.x, 0, bot.body_mesh.position.z,
      );
    }
    this.pos.position.set(0, 0, 0);
    this.pos.rotation.set(0, 0, 0);
    this.pos.scale.set(1, 1, 1);
  }

  /** Read transformed world position of leg's home tip through current `pos` transform. */
  getPos(bot: any, leg_idx: number): any {
    if (!this.pos) return new THREE.Vector3();
    this.pos.scale.set(bot.tip_circle_scale, bot.tip_circle_scale, bot.tip_circle_scale);
    bot.mesh.updateMatrixWorld();
    const localPos = this.localPositions[leg_idx];
    if (!localPos) return new THREE.Vector3();
    return localPos.clone().applyMatrix4(this.pos.matrixWorld);
  }

  /** Build `guideline` + `left_gl` + `right_gl` from current tip positions.
   *  Legacy draw_gait_guidelines(). Called only at stable states. */
  drawGuidelines(bot: any) {
    bot.mesh.updateMatrixWorld();
    const centerX = bot.body_mesh.position.x;
    const centerZ = bot.body_mesh.position.z;

    const material = new THREE.LineBasicMaterial({ color: 0xcc3300 });
    this.guideline = new THREE.Object3D();
    this.guideline.position.set(centerX, 0, centerZ);
    for (let idx = 0; idx < bot.legs.length; idx++) {
      const worldTip = bot.legs[idx].get_tip_pos();
      const localTip = bot.mesh.worldToLocal(worldTip.clone());
      const positions = new Float32Array([
        0, 0, 0,
        localTip.x - centerX, 0, localTip.z - centerZ,
      ]);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const line = new THREE.Line(geometry, material);
      this.guideline.add(line);
    }
    bot.mesh.add(this.guideline);

    this.left_gl = this.guideline.clone();
    this.left_gl.rotation.y = bot.rotate_step;
    bot.mesh.add(this.left_gl);

    this.right_gl = this.guideline.clone();
    this.right_gl.rotation.y = -bot.rotate_step;
    bot.mesh.add(this.right_gl);
  }

  /** Refresh guideline + clones from current localPositions and rotate_step.
   *  Legacy adjust_gait_guidelines(). MUST NOT be called during animation
   *  (CLAUDE.md Reference Line section). */
  adjustGuidelines(bot: any) {
    if (!this.guideline) return;
    const homePositions = this.localPositions;
    if (!homePositions || homePositions.length === 0) return;

    bot.mesh.updateMatrixWorld();
    const centerX = bot.body_mesh.position.x;
    const centerZ = bot.body_mesh.position.z;

    this.guideline.position.set(centerX, 0, centerZ);
    for (let idx = 0; idx < bot.legs.length; idx++) {
      const homeLocal = homePositions[idx];
      if (!homeLocal) continue;
      const line = this.guideline.children[idx] as any;
      if (line) {
        const pos = line.geometry.attributes.position;
        pos.setXYZ(0, 0, 0, 0);
        pos.setXYZ(1, homeLocal.x, 0, homeLocal.z);
        pos.needsUpdate = true;
      }
    }

    const updateClone = (clone: any) => {
      clone.position.set(centerX, 0, centerZ);
      for (let idx = 0; idx < bot.legs.length; idx++) {
        const line = clone.children[idx] as any;
        if (!line) continue;
        const homeLocal = homePositions[idx];
        if (!homeLocal) continue;
        const pos = line.geometry.attributes.position;
        pos.setXYZ(0, 0, 0, 0);
        pos.setXYZ(1, homeLocal.x, 0, homeLocal.z);
        pos.needsUpdate = true;
      }
    };
    if (this.left_gl)  { this.left_gl.rotation.y  =  bot.rotate_step; updateClone(this.left_gl); }
    if (this.right_gl) { this.right_gl.rotation.y = -bot.rotate_step; updateClone(this.right_gl); }
  }
}

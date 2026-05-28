import * as THREE from 'three';
import type { LegLayout } from './leg_layout.js';

/** Small black sphere placed at the front-top of the body as a heading indicator. */
export function createHeadIndicator(): THREE.Mesh {
  const geom = new (THREE as any).SphereGeometry(5, 8, 8);
  const mat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const head = new THREE.Mesh(geom, mat);
  head.position.set(0, 100, -120);
  return head;
}

/** Build the body visual (rectangle box, polygon prism, bone outline, or points)
 *  inside an Object3D container ready to be added as a child of the bot mesh.
 *
 *  This is pure construction — no shared state, no references to a Hexapod instance.
 *  Returns the container with the visual already added; caller decides where to mount it.
 */
export function drawBody(
  options: any,
  legLayout: LegLayout[],
  drawType: string,
): THREE.Object3D {
  const container = new THREE.Object3D();
  const color = options.color ? options.color : 0x333333;
  const bodyHeight = options.body_height || 20;
  const bodyShape = options.body_shape || 'rectangle';
  const legCount = options.leg_count || 6;

  // Collect leg positions for wireframe views (all signed directly)
  const legPositions = legLayout.map((l: LegLayout) =>
    new THREE.Vector3(l.x, 0, l.z));

  let bodyVisual: any;
  let geometry: any;
  let material: any;

  switch (drawType) {
    case "bone": {
      material = new THREE.LineBasicMaterial({ color });
      // Closed loop: N leg vertices + first vertex repeated
      const count = legPositions.length + 1;
      const verts = new Float32Array(count * 3);
      for (let i = 0; i < legPositions.length; i++) {
        verts[i * 3]     = legPositions[i].x;
        verts[i * 3 + 1] = legPositions[i].y;
        verts[i * 3 + 2] = legPositions[i].z;
      }
      verts[legPositions.length * 3]     = legPositions[0].x;
      verts[legPositions.length * 3 + 1] = legPositions[0].y;
      verts[legPositions.length * 3 + 2] = legPositions[0].z;
      geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      bodyVisual = new THREE.Line(geometry, material);
      break;
    }
    case "points": {
      material = new THREE.PointsMaterial({ color });
      const verts = new Float32Array(legPositions.length * 3);
      legPositions.forEach((v, i) => {
        verts[i * 3] = v.x; verts[i * 3 + 1] = v.y; verts[i * 3 + 2] = v.z;
      });
      geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      bodyVisual = new THREE.Points(geometry, material);
      break;
    }
    default:
      if (bodyShape === 'polygon' && legCount >= 3) {
        // Build N-gon prism with corners at vertex positions (full polygon).
        // Body shape is independent of leg placement mode — legs may attach
        // at corners (vertex mode) or edge midpoints (edge mode).
        const halfH = bodyHeight / 2;
        const bw = options.body_width || 50;
        const bl = options.body_length || 100;
        const bodyRx = bw / 2;
        const bodyRz = bl / 2;
        const bodyPlacement = options.polygon_leg_placement || 'vertex';
        const bodyOffset = bodyPlacement === 'edge' ? -Math.PI / legCount : 0;
        const evenOffset = legCount % 2 === 0 ? Math.PI / legCount : 0;
        const firstLegAngle = ((options.polygon_odd_orientation || 'back') === 'back'
          ? Math.PI / 2 : -Math.PI / 2) + evenOffset;

        // Vertices: btmCenter(0), topCenter(1), btmRing[0..N-1], topRing[0..N-1]
        const vertCount = 2 + 2 * legCount;
        const positions = new Float32Array(vertCount * 3);
        positions[0] = 0; positions[1] = -halfH; positions[2] = 0;   // btmCenter
        positions[3] = 0; positions[4] = halfH;  positions[5] = 0;   // topCenter

        for (let i = 0; i < legCount; i++) {
          const angle = (2 * Math.PI * i) / legCount + bodyOffset + firstLegAngle;
          const lx = bodyRx * Math.cos(angle);
          const lz = bodyRz * Math.sin(angle);
          const bi = (2 + 2 * i) * 3;
          positions[bi]     = lx; positions[bi + 1] = -halfH; positions[bi + 2] = lz;
          const ti = (2 + 2 * i + 1) * 3;
          positions[ti]     = lx; positions[ti + 1] = halfH;  positions[ti + 2] = lz;
        }

        // Triangles: bottom cap + top cap + 2 side triangles per segment
        const indices: number[] = [];
        for (let i = 0; i < legCount; i++) {
          const next = (i + 1) % legCount;
          const bi = 2 + 2 * i, bnext = 2 + 2 * next;
          const ti = bi + 1, tnext = bnext + 1;
          indices.push(0, bnext, bi);      // bottom cap
          indices.push(1, ti, tnext);      // top cap
          indices.push(bi, bnext, tnext);  // side quad (2 tris)
          indices.push(bi, tnext, ti);
        }

        geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        bodyVisual = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color }));
      } else {
        // Rectangle body with thickness
        geometry = new THREE.BoxGeometry(options.body_width, bodyHeight, options.body_length);
        bodyVisual = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color }));
      }
      const axisHelper = new THREE.AxesHelper(30);
      bodyVisual.add(axisHelper);
  }

  // Body offset moves only the visual, not leg attachment points
  const bodyGroup = new THREE.Object3D();
  bodyGroup.add(bodyVisual);
  bodyGroup.position.y = options.body_offset || 0;
  container.add(bodyGroup);

  container.position.y = bodyHeight / 2;
  return container;
}

// 3D classroom: desks, a whiteboard and the people who have checked in, walking around.
// Plain three.js, no model files: every person and piece of furniture is built from simple shapes.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface Person { key: string; name: string; kind: 'student' | 'teacher'; gender: string | null }

// Room size in meters. x runs left to right, z from the whiteboard (front, -z) to the back (+z).
const W = 14, D = 10, H = 3.2;
const DOOR = new THREE.Vector3(W / 2 - 0.4, 0, 3.6);      // just inside the door
const OUTSIDE = new THREE.Vector3(W / 2 + 1.2, 0, 3.6);   // where people appear and leave
const RADIUS = 0.3;

const DESK_X = [-5, -2.5, 0, 2.5, 5];
const DESK_Z = [-1.2, 0.5, 2.2, 3.9];

interface Box { x0: number; x1: number; z0: number; z1: number }

const SHIRTS = [0x2563eb, 0x16a34a, 0xdb2777, 0xf59e0b, 0x7c3aed, 0x0891b2, 0xdc2626, 0x4b5563, 0xea580c, 0x0d9488];
const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
const HAIR = [0x1f1a17, 0x2d1b10, 0x3b2314, 0x111111];

// ---- Walkable grid, for finding a way around the desks ----
const CELL = 0.25;
const GX = Math.round(W / CELL), GZ = Math.round(D / CELL);

class Grid {
  blocked = new Uint8Array(GX * GZ);
  constructor(boxes: Box[]) {
    for (let i = 0; i < GX; i++) for (let k = 0; k < GZ; k++) {
      const x = -W / 2 + (i + 0.5) * CELL, z = -D / 2 + (k + 0.5) * CELL;
      const wall = x < -W / 2 + RADIUS || x > W / 2 - RADIUS || z < -D / 2 + RADIUS || z > D / 2 - RADIUS;
      const hit = boxes.some(b => x > b.x0 - RADIUS && x < b.x1 + RADIUS && z > b.z0 - RADIUS && z < b.z1 + RADIUS);
      this.blocked[i + k * GX] = wall || hit ? 1 : 0;
    }
  }
  cell(p: THREE.Vector3): [number, number] {
    return [Math.min(GX - 1, Math.max(0, Math.floor((p.x + W / 2) / CELL))), Math.min(GZ - 1, Math.max(0, Math.floor((p.z + D / 2) / CELL)))];
  }
  free(i: number, k: number) { return i >= 0 && k >= 0 && i < GX && k < GZ && !this.blocked[i + k * GX]; }
  center(i: number, k: number) { return new THREE.Vector3(-W / 2 + (i + 0.5) * CELL, 0, -D / 2 + (k + 0.5) * CELL); }

  randomFree(zMin = -D / 2, zMax = D / 2): THREE.Vector3 {
    for (let n = 0; n < 200; n++) {
      const i = Math.floor(Math.random() * GX), k = Math.floor(Math.random() * GZ);
      const c = this.center(i, k);
      if (this.free(i, k) && c.z >= zMin && c.z <= zMax) return c;
    }
    return DOOR.clone();
  }

  /** Shortest way between two points around the furniture (breadth-first search), as a list of points. */
  path(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
    const [si, sk] = this.nearestFree(...this.cell(from));
    const [ti, tk] = this.nearestFree(...this.cell(to));
    const start = si + sk * GX, goal = ti + tk * GX;
    const prev = new Int32Array(GX * GZ).fill(-1);
    prev[start] = start;
    const queue = [start];
    for (let q = 0; q < queue.length && prev[goal] === -1; q++) {
      const c = queue[q], i = c % GX, k = (c - i) / GX;
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const ni = i + di, nk = k + dk, n = ni + nk * GX;
        if (!this.free(ni, nk) || prev[n] !== -1) continue;
        if (di && dk && (!this.free(i + di, k) || !this.free(i, k + dk))) continue;   // no squeezing past corners
        prev[n] = c; queue.push(n);
      }
    }
    if (prev[goal] === -1) return [to.clone()];
    const cells: number[] = [];
    for (let c = goal; c !== start; c = prev[c]) cells.push(c);
    cells.reverse();
    // Keep only the corners, so people walk in straight lines.
    const pts = cells.map(c => this.center(c % GX, Math.floor(c / GX)));
    const out: THREE.Vector3[] = [];
    for (let n = 0; n < pts.length; n++) {
      const a = out[out.length - 1] ?? from, b = pts[n], c = pts[n + 1];
      if (!c || Math.abs((b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x)) > 1e-6) out.push(b);
    }
    return out;
  }

  private nearestFree(i: number, k: number): [number, number] {
    if (this.free(i, k)) return [i, k];
    for (let r = 1; r < 12; r++)
      for (let di = -r; di <= r; di++) for (let dk = -r; dk <= r; dk++)
        if (this.free(i + di, k + dk)) return [i + di, k + dk];
    return [i, k];
  }
}

// ---- People ----
function label(text: string, teacher: boolean): THREE.Sprite {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  const font = '600 34px Inter, Arial, sans-serif';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 36;
  c.width = w; c.height = 56;
  ctx.font = font;
  ctx.fillStyle = teacher ? 'rgba(123,0,0,0.92)' : 'rgba(15,23,42,0.78)';
  ctx.beginPath(); ctx.roundRect(0, 0, w, 56, 28); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  ctx.fillText(text, w / 2, 29);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(w / 56 * 0.3, 0.3, 1);
  s.position.y = 2.05;
  s.renderOrder = 10;
  return s;
}

const hash = (s: string) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); };

class Walker {
  group = new THREE.Group();
  private legL: THREE.Object3D; private legR: THREE.Object3D;
  private armL: THREE.Object3D; private armR: THREE.Object3D;
  private path: THREE.Vector3[] = [];
  private wait = 0;
  private phase = Math.random() * 10;
  private speed: number;
  leaving = false;
  gone = false;

  constructor(public person: Person, private grid: Grid) {
    const h = hash(person.key);
    const teacher = person.kind === 'teacher';
    const female = person.gender === 'Female';
    const mat = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
    const shirt = mat(teacher ? 0x7b0000 : SHIRTS[h % SHIRTS.length]);
    const pants = mat(teacher ? 0x1f2937 : (female && h % 3 === 0 ? 0x334155 : 0x1e3a5f));
    const skin = mat(SKIN[h % SKIN.length]);
    const hair = mat(HAIR[h % HAIR.length]);
    const scale = teacher ? 1.08 : 0.94 + (h % 9) / 100;

    const limb = (w: number, len: number, m: THREE.Material, x: number, y: number) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), m);
      mesh.position.y = -len / 2; mesh.castShadow = true;
      pivot.add(mesh);
      this.group.add(pivot);
      return pivot;
    };
    this.legL = limb(0.16, 0.85, pants, -0.11, 0.88);
    this.legR = limb(0.16, 0.85, pants, 0.11, 0.88);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.26), shirt);
    torso.position.y = 1.18; torso.castShadow = true;
    this.group.add(torso);
    this.armL = limb(0.12, 0.6, shirt, -0.3, 1.46);
    this.armR = limb(0.12, 0.6, shirt, 0.3, 1.46);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 16), skin);
    head.position.y = 1.68; head.castShadow = true;
    this.group.add(head);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), hair);
    cap.position.y = 1.7; cap.rotation.x = -0.25;
    this.group.add(cap);
    if (female) {
      const long = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.38, 0.1), hair);
      long.position.set(0, 1.55, 0.13);
      this.group.add(long);
    }
    if (teacher) {
      const book = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.26, 0.2), mat(0xfacc15));
      book.position.set(0, -0.55, 0.06);
      this.armR.add(book);
    }
    this.group.scale.setScalar(scale);
    this.group.add(label(person.name, teacher));
    this.speed = teacher ? 0.9 : 1.0 + (h % 5) / 10;

    // Walks in through the door.
    this.group.position.copy(OUTSIDE);
    this.path = [DOOR.clone(), ...grid.path(DOOR, this.pickSpot())];
  }

  /** Teachers stay near the board, students roam the room. */
  private pickSpot() {
    return this.person.kind === 'teacher' ? this.grid.randomFree(-D / 2, -2.4) : this.grid.randomFree(-2.6, D / 2);
  }

  leave() {
    if (this.leaving) return;
    this.leaving = true; this.wait = 0;
    this.path = [...this.grid.path(this.group.position, DOOR), OUTSIDE.clone()];
  }

  update(dt: number, others: Walker[]) {
    const pos = this.group.position;
    if (this.path.length === 0) {
      if (this.leaving) { this.gone = true; return; }
      this.pose(0, dt);
      this.wait -= dt;
      if (this.wait <= 0) this.path = this.grid.path(pos, this.pickSpot());
      return;
    }
    const target = this.path[0];
    const to = new THREE.Vector3(target.x - pos.x, 0, target.z - pos.z);
    const dist = to.length();
    if (dist < 0.06) {
      this.path.shift();
      if (this.path.length === 0) this.wait = 1.5 + Math.random() * 4;
      return;
    }
    // Slow down and wait a moment when someone is right in front.
    let speed = this.speed;
    to.normalize();
    for (const o of others) {
      if (o === this || o.gone) continue;
      const dx = o.group.position.x - pos.x, dz = o.group.position.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.55 && (dx * to.x + dz * to.z) / (d || 1) > 0.6 && hash(this.person.key) > hash(o.person.key)) speed *= 0.4;
    }
    const step = Math.min(dist, speed * dt);
    pos.x += to.x * step; pos.z += to.z * step;
    const yaw = Math.atan2(to.x, to.z);
    let diff = yaw - this.group.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.group.rotation.y += diff * Math.min(1, dt * 8);
    this.pose(speed, dt);
  }

  /** Swings arms and legs while walking; stands still otherwise. */
  private pose(speed: number, dt: number) {
    this.phase += dt * speed * 6.5;
    const swing = speed > 0.2 ? Math.sin(this.phase) * 0.55 : 0;
    const ease = (o: THREE.Object3D, v: number) => { o.rotation.x += (v - o.rotation.x) * Math.min(1, dt * 10); };
    ease(this.legL, swing); ease(this.legR, -swing);
    ease(this.armL, -swing * 0.8); ease(this.armR, this.person.kind === 'teacher' ? -0.5 : swing * 0.8);
    this.group.position.y = speed > 0.2 ? Math.abs(Math.cos(this.phase)) * 0.03 : 0;
  }

  dispose() {
    this.group.traverse(o => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material & { map?: THREE.Texture };
      mat?.map?.dispose(); mat?.dispose?.();
    });
  }
}

// ---- The room ----
export class Room3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private grid: Grid;
  private walkers = new Map<string, Walker>();
  private board: THREE.Mesh;
  private frame = 0;
  private last = performance.now();
  private resize: ResizeObserver;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0xe9edf2);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(0, 9.4, 11.8);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.6, 0);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2.15;
    this.controls.minDistance = 5; this.controls.maxDistance = 24;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb0a99f, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-6, 12, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9 });
    this.scene.add(sun);

    const boxes = this.buildRoom();
    this.board = this.buildBoard();
    this.grid = new Grid(boxes);

    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(host);
    this.fit();
    this.loop();
  }

  private buildRoom(): Box[] {
    const s = this.scene;
    const mat = (color: number, rough = 0.9) => new THREE.MeshStandardMaterial({ color, roughness: rough });
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, shadow = true) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = shadow; mesh.receiveShadow = true;
      s.add(mesh);
      return mesh;
    };

    // Floor tiles.
    const tiles = document.createElement('canvas');
    tiles.width = tiles.height = 128;
    const t = tiles.getContext('2d')!;
    t.fillStyle = '#d6cfc4'; t.fillRect(0, 0, 128, 128);
    t.strokeStyle = '#c2b9ab'; t.lineWidth = 3; t.strokeRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(tiles);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(W / 1, D / 1); tex.colorSpace = THREE.SRGBColorSpace;
    const floor = add(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }), 0, 0, 0, false);
    floor.rotation.x = -Math.PI / 2;

    // Walls: front (board), left (windows), right (door). The back is open so the camera can see in.
    const wall = mat(0xf5efe6);
    add(new THREE.BoxGeometry(W, H, 0.15), wall, 0, H / 2, -D / 2 - 0.075);
    add(new THREE.BoxGeometry(0.15, H, D), wall, -W / 2 - 0.075, H / 2, 0);
    const doorZ0 = DOOR.z - 0.6, doorZ1 = DOOR.z + 0.6;
    add(new THREE.BoxGeometry(0.15, H, doorZ0 + D / 2), wall, W / 2 + 0.075, H / 2, (-D / 2 + doorZ0) / 2);
    add(new THREE.BoxGeometry(0.15, H, D / 2 - doorZ1), wall, W / 2 + 0.075, H / 2, (doorZ1 + D / 2) / 2);
    add(new THREE.BoxGeometry(0.15, H - 2.2, 1.2), wall, W / 2 + 0.075, 2.2 + (H - 2.2) / 2, DOOR.z);
    add(new THREE.BoxGeometry(0.04, 2.2, 0.06), mat(0x8b5a2b), W / 2, 1.1, doorZ0);
    add(new THREE.BoxGeometry(0.04, 2.2, 0.06), mat(0x8b5a2b), W / 2, 1.1, doorZ1);
    // Low back wall.
    add(new THREE.BoxGeometry(W, 0.5, 0.15), wall, 0, 0.25, D / 2 + 0.075);
    // Windows on the left wall.
    const glass = new THREE.MeshStandardMaterial({ color: 0xbfe3ff, emissive: 0x6fb6e8, emissiveIntensity: 0.35, roughness: 0.2 });
    for (const z of [-3, 0, 3]) add(new THREE.BoxGeometry(0.05, 1.3, 1.8), glass, -W / 2 + 0.01, 1.9, z, false);

    const boxes: Box[] = [];
    // Teacher's desk.
    const wood = mat(0x9a6b3f, 0.7), metal = mat(0x475569, 0.5), seat = mat(0x2f4f6f, 0.7);
    add(new THREE.BoxGeometry(1.8, 0.08, 0.8), wood, -3.2, 0.76, -3.5);
    add(new THREE.BoxGeometry(1.7, 0.7, 0.05), wood, -3.2, 0.38, -3.15);
    boxes.push({ x0: -4.1, x1: -2.3, z0: -3.9, z1: -3.1 });

    // Student desks with chairs, in rows facing the board.
    for (const z of DESK_Z) for (const x of DESK_X) {
      add(new THREE.BoxGeometry(1.1, 0.06, 0.6), wood, x, 0.74, z);
      for (const dx of [-0.5, 0.5]) for (const dz of [-0.25, 0.25]) add(new THREE.BoxGeometry(0.05, 0.72, 0.05), metal, x + dx, 0.36, z + dz);
      add(new THREE.BoxGeometry(0.5, 0.05, 0.45), seat, x, 0.45, z + 0.6);
      add(new THREE.BoxGeometry(0.5, 0.45, 0.05), seat, x, 0.7, z + 0.82);
      for (const dx of [-0.22, 0.22]) add(new THREE.BoxGeometry(0.04, 0.45, 0.04), metal, x + dx, 0.22, z + 0.6);
      boxes.push({ x0: x - 0.58, x1: x + 0.58, z0: z - 0.32, z1: z + 0.86 });
    }
    return boxes;
  }

  private buildBoard() {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(6.2, 1.6, 0.06), new THREE.MeshStandardMaterial({ color: 0x9ca3af }));
    frame.position.set(0.8, 1.75, -D / 2 + 0.03);
    this.scene.add(frame);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.45), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }));
    board.position.set(0.8, 1.75, -D / 2 + 0.07);
    this.scene.add(board);
    return board;
  }

  /** Writes the current class on the whiteboard. */
  setBoard(lines: string[]) {
    const c = document.createElement('canvas');
    c.width = 1200; c.height = 290;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.textAlign = 'center';
    lines.forEach((l, i) => {
      ctx.fillStyle = i === 0 ? '#1e3a8a' : '#334155';
      ctx.font = i === 0 ? '700 70px "Comic Sans MS", "Segoe Print", cursive' : '500 44px "Comic Sans MS", "Segoe Print", cursive';
      ctx.fillText(l, c.width / 2, 100 + i * 70, c.width - 60);
    });
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = this.board.material as THREE.MeshStandardMaterial;
    m.map?.dispose();
    m.map = tex; m.needsUpdate = true;
  }

  /** Shows exactly these people: new ones walk in through the door, missing ones walk out. */
  setPeople(people: Person[]) {
    const keep = new Set(people.map(p => p.key));
    for (const w of this.walkers.values()) if (!keep.has(w.person.key)) w.leave();
    for (const p of people) {
      const w = this.walkers.get(p.key);
      if (w && !w.leaving) continue;
      if (w) this.remove(p.key);   // was on the way out, came back in
      const walker = new Walker(p, this.grid);
      this.walkers.set(p.key, walker);
      this.scene.add(walker.group);
    }
  }

  /** Empties the room at once (a class period ended). */
  clear() { for (const k of [...this.walkers.keys()]) this.remove(k); }

  private remove(key: string) {
    const w = this.walkers.get(key);
    if (!w) return;
    this.scene.remove(w.group); w.dispose(); this.walkers.delete(key);
  }

  private fit() {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const list = [...this.walkers.values()];
    for (const w of list) {
      w.update(dt, list);
      if (w.gone) this.remove(w.person.key);
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.frame);
    this.resize.disconnect();
    this.clear();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

/** False when the browser can't draw 3D (no WebGL). */
export function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); }
  catch { return false; }
}

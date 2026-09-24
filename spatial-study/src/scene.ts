import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { axes, basePosition, lengths, linkOffset } from './robot';
import { acrylicPlan, clamp, fromThree, toThree, type SceneState, type Speaker, type Store, type Vec3 } from './model';

export type Selection = { kind: 'source' | 'speaker' | 'listener' | 'target' | 'light' | 'stone' | 'shell' | 'robot'; id: string };
const gold = 0xc7ae97, lavender = 0xa9bac2;
const mat = (color: number, extra: T.MeshStandardMaterialParameters = {}) => new T.MeshStandardMaterial({ color, roughness: .65, metalness: .12, ...extra });

function label(text: string, color = '#bec0bc', width = .62, pixels?: number) {
 const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d')!;
 ctx.font = '500 38px sans-serif'; canvas.width = Math.ceil(ctx.measureText(text).width + 28); canvas.height = 72;
 ctx.font = '500 38px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = color;
 ctx.fillText(text, canvas.width / 2, 48);
 const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace;
 const sprite = new T.Sprite(new T.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
 sprite.scale.set(width, width * canvas.height / canvas.width, 1);
 sprite.userData.labelAspect = canvas.width / canvas.height; sprite.userData.labelPixels = pixels; sprite.userData.nameLabel = pixels === undefined;
 sprite.renderOrder = 5; return sprite;
}
function mesh(g: T.BufferGeometry, m: T.Material) { const o = new T.Mesh(g, m); o.castShadow = true; return o; }
function dispose(o: T.Object3D) {
 o.traverse(child => {
  if (child instanceof T.Mesh || child instanceof T.Line || child instanceof T.Sprite) {
   if ('geometry' in child) child.geometry.dispose();
   for (const m of Array.isArray(child.material) ? child.material : [child.material]) {
    if (m instanceof T.SpriteMaterial) m.map?.dispose(); m.dispose();
   }
  }
 });
}
function dimension(group: T.Group, a: T.Vector3, b: T.Vector3, text: string, offset: T.Vector3) {
 const points = [a, b], tick = offset.clone().normalize().multiplyScalar(.07);
 for (const p of [a, b]) points.push(p.clone().sub(tick), p.clone().add(tick));
 group.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(points), new T.LineBasicMaterial({ color: 0x777b7e, transparent: true, opacity: .65 })));
 const l = label(text, '#babcb8', .9, 11); l.position.copy(a).lerp(b, .5).add(offset); group.add(l);
}
function shapeFromPlan(vertices: Vec3[]) {
 const shape = new T.Shape(); vertices.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y)); shape.closePath();
 return shape;
}
function acrylicPanels(bottom: Vec3[], top: Vec3[], thickness: number) {
 const vertices: number[] = [], indices: number[] = [];
 const faces = bottom.map((p, i) => [p, bottom[(i + 1) % 4], top[(i + 1) % 4], top[i]]);
 faces.push(top);
 for (const face of faces) {
  const points = face.map(p => new T.Vector3(...toThree(p)));
  const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize().multiplyScalar(thickness / 2);
  const start = vertices.length / 3;
  for (const side of [-1, 1]) for (const p of points) vertices.push(...p.clone().addScaledVector(normal, side).toArray());
  // Each sheet is represented as a solid slab. Joint construction remains a fabrication decision.
  indices.push(start, start + 1, start + 2, start, start + 2, start + 3, start + 4, start + 6, start + 5, start + 4, start + 7, start + 6);
  for (let i = 0; i < 4; i++) { const next = (i + 1) % 4; indices.push(start + i, start + 4 + i, start + next, start + next, start + 4 + i, start + 4 + next); }
 }
 const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

export class InstallationScene {
 renderer: T.WebGLRenderer;
 scene = new T.Scene(); camera = new T.PerspectiveCamera(45, 1, .02, 150); controls: OrbitControls; transform: TransformControls;
 selected: Selection = { kind: 'stone', id: 'stone' }; editMode = false;
 private nameLabelPixels = 6;
 private objects = new Map<string, T.Object3D>(); private speakerObjects: T.Group[] = []; private sourceObjects: T.Group[] = [];
 private room = new T.Group(); private robot = new T.Group(); private suspension = new T.Group(); private joints: T.Group[] = [];
 private shoulder!: T.Mesh; private shoulderEnd!: T.Group;
 private effector = new T.Group(); private listener = new T.Group(); private target = new T.Group();
 private sculpture = new T.Group(); private stone: T.Mesh; private shell = new T.Group(); private light: T.SpotLight;
 private ray: T.Line; private path: T.Line;
 private roomSignature = ''; private sculptureSignature = ''; private speakerSignature = ''; private suspensionSignature = '';
 private raycaster = new T.Raycaster(); private start = [0, 0]; private disposed = false;

 constructor(private host: HTMLElement, private store: Store, private select: () => void) {
  this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false }); this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = T.PCFSoftShadowMap;
  this.renderer.outputColorSpace = T.SRGBColorSpace; this.renderer.toneMapping = T.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.2;
  host.append(this.renderer.domElement); this.scene.background = new T.Color(0x070809);
  this.scene.add(new T.HemisphereLight(0xf2f0eb, 0x101214, 2.0));
  const fill = new T.DirectionalLight(0xf4f2ed, 2.3); fill.position.set(1, 7, 3); this.scene.add(fill);
  this.controls = new OrbitControls(this.camera, this.renderer.domElement); this.controls.enableDamping = true; this.controls.minDistance = .3;
  this.controls.maxPolarAngle = Math.PI * .495;
  this.transform = new TransformControls(this.camera, this.renderer.domElement); this.transform.setSize(.8); this.transform.setTranslationSnap(.01);
  this.scene.add(this.transform.getHelper()); this.transform.addEventListener('dragging-changed', e => { this.controls.enabled = !e.value; });
  this.transform.addEventListener('objectChange', () => this.drag());
  this.scene.add(this.room, this.robot, this.suspension, this.listener, this.target, this.sculpture);

  // A normalised irregular proxy: the PDF specifies Asama stone, not a scan.
  const g = new T.IcosahedronGeometry(1, 2), position = g.attributes.position;
  for (let i = 0; i < position.count; i++) {
   const v = new T.Vector3().fromBufferAttribute(position, i);
   v.multiplyScalar(.88 + .16 * Math.sin(v.x * 9 + v.y * 13) * Math.cos(v.z * 11)); position.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeBoundingBox(); const bounds = g.boundingBox!, size = bounds.getSize(new T.Vector3());
  g.translate(...bounds.getCenter(new T.Vector3()).multiplyScalar(-1).toArray()); g.scale(1 / size.x, 1 / size.y, 1 / size.z); g.computeVertexNormals();
  this.stone = mesh(g, mat(0x85857e, { flatShading: true, roughness: 1 }));
  this.scene.add(this.stone); this.register(this.stone, { kind: 'stone', id: 'stone' });
  this.sculpture.add(this.shell); this.register(this.shell, { kind: 'shell', id: 'shell' });

  let parent = this.robot;
  lengths.forEach((length, i) => {
   const joint = new T.Group(); parent.add(joint); this.joints.push(joint);
   joint.add(mesh(new T.SphereGeometry(.058, 16, 10), mat(i % 2 ? 0xadadab : 0xcecdc7)));
   const arm = mesh(new T.CylinderGeometry(.033, .044, length, 12), mat(0x858b8d)); arm.rotation.x = Math.PI / 2; arm.position.z = -length / 2; joint.add(arm);
   const end = new T.Group(); end.position.z = -length; joint.add(end); parent = end;
   if (i === 0) { this.shoulder = arm; this.shoulderEnd = end; }
  });
  parent.add(this.effector);
  const fixture = mesh(new T.CylinderGeometry(.036, .055, .10, 24), mat(0x242628)); fixture.rotation.x = Math.PI / 2;
  const bulb = mesh(new T.CircleGeometry(.032, 24), mat(gold, { emissive: gold, emissiveIntensity: 2 })); bulb.position.z = -.052; bulb.rotation.y = Math.PI;
  this.effector.add(fixture, bulb); const lightLabel = label('LIGHT', '#c7ae97', .48); lightLabel.position.set(.16, .13, 0); this.effector.add(lightLabel);
  this.light = new T.SpotLight(0xfffbf4, 40, 20, Math.PI / 4, .2, 2); this.light.castShadow = true;
  this.light.shadow.mapSize.set(2048, 2048); this.light.shadow.bias = -.0004; this.light.shadow.normalBias = .012;
  this.light.target = this.stone; this.effector.add(this.light);
  this.register(this.robot, { kind: 'robot', id: 'robot' }); this.register(this.effector, { kind: 'light', id: 'light' });

  this.listener.add(mesh(new T.SphereGeometry(.085, 16, 12), mat(lavender)));
  this.listener.children[0].castShadow = false;
  this.listener.add(new T.ArrowHelper(new T.Vector3(0, 0, -1), new T.Vector3(), .35, lavender, .075, .045));
  const listenerLabel = label('LISTENER', '#a9bac2', .68); listenerLabel.position.y = .25; this.listener.add(listenerLabel);
  this.register(this.listener, { kind: 'listener', id: 'listener' });
  this.target.add(mesh(new T.OctahedronGeometry(.065), new T.MeshBasicMaterial({ color: gold, wireframe: true })));
  this.target.children[0].castShadow = false;
  const targetLabel = label('TARGET', '#c7ae97', .55); targetLabel.position.y = .17; this.target.add(targetLabel); this.register(this.target, { kind: 'target', id: 'target' });
  this.ray = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]), new T.LineDashedMaterial({ color: gold, transparent: true, opacity: .4, dashSize: .035, gapSize: .035 }));
  this.scene.add(this.ray);
  this.path = new T.Line(new T.BufferGeometry(), new T.LineBasicMaterial({ color: gold, transparent: true, opacity: .3 })); this.scene.add(this.path);
  host.addEventListener('pointerdown', e => { this.start = [e.clientX, e.clientY]; });
  host.addEventListener('pointerup', e => { if (Math.hypot(e.clientX - this.start[0], e.clientY - this.start[1]) < 4 && !this.transform.dragging) this.pick(e); });
  new ResizeObserver(() => this.resize()).observe(host); this.store.subscribe(s => this.update(s)); this.update(store.state); this.resize(); this.view('PERSPECTIVE');
 }
 private register(o: T.Object3D, selection: Selection) { o.userData.selection = selection; this.objects.set(selection.kind + ':' + selection.id, o); }

 private roomBuild(s: SceneState) {
  const sig = JSON.stringify(s.room); if (sig === this.roomSignature) return; this.roomSignature = sig; dispose(this.room); this.room.clear();
  const { width: w, depth: d, height: h, wallHeight: wh, corridorDepth: corridor, entranceWidth: entrance } = s.room;
  const floor = mesh(new T.PlaneGeometry(w + corridor, d), mat(0x141618, { roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.position.x = -corridor / 2; floor.receiveShadow = true; this.room.add(floor);
  const gridPoints: T.Vector3[] = [];
  for (let x = Math.ceil(-w / 2); x <= w / 2; x++) gridPoints.push(new T.Vector3(x, .003, -d / 2), new T.Vector3(x, .003, d / 2));
  for (let z = Math.ceil(-d / 2); z <= d / 2; z++) gridPoints.push(new T.Vector3(-w / 2, .003, z), new T.Vector3(w / 2, .003, z));
  this.room.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(gridPoints), new T.LineBasicMaterial({ color: 0x414448, transparent: true, opacity: .34 })));
  const outline = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(w, h, d)), new T.LineBasicMaterial({ color: 0x74787b, transparent: true, opacity: .48 })); outline.position.y = h / 2; this.room.add(outline);
  // Inward-facing wall surfaces create a camera-dependent cutaway, with the complete boundary retained as wireframe.
  const wall = (width: number, x: number, z: number, rotation: number) => {
   const o = mesh(new T.PlaneGeometry(width, wh), mat(0x191b1e, { side: T.FrontSide, roughness: 1 })); o.position.set(x, wh / 2, z); o.rotation.y = rotation; o.castShadow = false; this.room.add(o);
  };
  wall(w, 0, d / 2, Math.PI); wall(w, 0, -d / 2, 0); wall(d, w / 2, 0, -Math.PI / 2);
  const leftSegment = (d - entrance) / 2;
  wall(leftSegment, -w / 2, -(entrance / 2 + leftSegment / 2), Math.PI / 2); wall(leftSegment, -w / 2, entrance / 2 + leftSegment / 2, Math.PI / 2);
  if (corridor > 0) {
   wall(d, -w / 2 - corridor, 0, Math.PI / 2);
   const corridorEdge = new T.LineSegments(new T.BufferGeometry().setFromPoints([
    new T.Vector3(-w / 2, .01, d / 2), new T.Vector3(-w / 2 - corridor, .01, d / 2),
    new T.Vector3(-w / 2 - corridor, .01, d / 2), new T.Vector3(-w / 2 - corridor, .01, -d / 2),
   ]), new T.LineBasicMaterial({ color: 0x74787b })); this.room.add(corridorEdge);
   const entry = label('LIGHT LOCK', '#b0b3b3', 1.6); entry.position.set(-w / 2 - corridor / 2, .07, 0); this.room.add(entry);
  }
  dimension(this.room, new T.Vector3(-w / 2, .03, d / 2 + .34), new T.Vector3(w / 2, .03, d / 2 + .34), `${w.toFixed(2)} m`, new T.Vector3(0, .08, .12));
  dimension(this.room, new T.Vector3(w / 2 + .34, .03, -d / 2), new T.Vector3(w / 2 + .34, .03, d / 2), `${d.toFixed(2)} m`, new T.Vector3(.15, .08, 0));
  dimension(this.room, new T.Vector3(w / 2 + .25, 0, d / 2), new T.Vector3(w / 2 + .25, h, d / 2), `${h.toFixed(2)} m`, new T.Vector3(.12, 0, 0));
  this.controls.maxDistance = Math.max(w + corridor, d, h) * 5; this.camera.far = this.controls.maxDistance * 4; this.camera.updateProjectionMatrix();
 }

 private sculptureBuild(s: SceneState) {
  const sig = JSON.stringify(s.acrylic); if (sig === this.sculptureSignature) return; this.sculptureSignature = sig;
  dispose(this.shell); this.shell.clear(); const { bottom, top } = acrylicPlan(s.acrylic);
  const geometry = acrylicPanels(bottom, top, s.acrylic.thickness);
  const acrylic = mesh(geometry, mat(0xd9dcda, { transparent: true, opacity: .075, side: T.DoubleSide, depthWrite: false, roughness: .12, metalness: .04 })); acrylic.castShadow = false;
  this.shell.add(acrylic, new T.LineSegments(new T.EdgesGeometry(geometry, 20), new T.LineBasicMaterial({ color: 0xd5d9d6, transparent: true, opacity: .85 })));
  const inset = mesh(new T.ShapeGeometry(shapeFromPlan(bottom)), mat(0xd1d0c9, { roughness: 1, side: T.DoubleSide }));
  inset.rotation.x = -Math.PI / 2; inset.position.y = .005; inset.receiveShadow = true; inset.castShadow = false; this.shell.add(inset);
  this.shell.position.set(...toThree(s.acrylic.position)); this.shell.rotation.y = s.acrylic.yaw * Math.PI / 180;
  const text = label(`ACRYLIC · ${s.acrylic.slope.toFixed(1)}°`, '#cdd4d0', 1.0); text.position.set(0, .035, s.acrylic.depth / 2 + .25); this.shell.add(text);
 }

 private suspensionBuild(s: SceneState) {
  const sig = JSON.stringify([s.robot.base, s.room.height]); if (sig === this.suspensionSignature) return; this.suspensionSignature = sig;
  dispose(this.suspension); this.suspension.clear(); const [x, y, z] = toThree(basePosition(s)), top = s.room.height, length = Math.max(.01, top - y);
  const support = mesh(new T.CylinderGeometry(.025, .025, length, 16), mat(0x9a9c9a)); support.position.set(x, y + length / 2, z); this.suspension.add(support);
  const plate = mesh(new T.BoxGeometry(.32, .035, .32), mat(0x383b3d)); plate.position.set(x, top, z); this.suspension.add(plate);
  const mount = mesh(new T.CylinderGeometry(.1, .1, .055, 24), mat(0x6e7375)); mount.position.set(x, y + .03, z); this.suspension.add(mount);
 }

 private speakerBuild(s: SceneState) {
  const sig = JSON.stringify([s.speakerSetup, s.speakers.map(sp => [sp.id, sp.role, sp.wall])]); if (sig === this.speakerSignature) return; this.speakerSignature = sig;
  this.speakerObjects.forEach(group => { if (this.transform.object === group) this.transform.detach(); this.scene.remove(group); dispose(group); });
  for (const key of this.objects.keys()) if (key.startsWith('speaker:')) this.objects.delete(key); this.speakerObjects = [];
  const setup = s.speakerSetup;
  for (const sp of s.speakers) {
   const colors: Record<Speaker['wall'], number> = { front: 0xb6b4c0, rear: 0x9eafb4, right: 0xacb7a5, left: 0xc7b394, arm: gold, floor: 0xa7acae };
   const group = new T.Group(), sub = sp.role === 'sub', color = colors[sp.wall];
   if (sub) {
    const cabinet = mesh(new T.BoxGeometry(setup.subWidth, setup.subHeight, setup.subDepth), mat(0x252729, { roughness: .85 })); group.add(cabinet);
    const front = mesh(new T.PlaneGeometry(setup.subWidth * .79, setup.subHeight * .84), mat(0x111214)); front.position.z = -setup.subDepth / 2 - .002; front.rotation.y = Math.PI; group.add(front);
    const driver = mesh(new T.CircleGeometry(Math.min(setup.subWidth, setup.subHeight) * .28, 40), mat(0x494d50)); driver.position.z = -setup.subDepth / 2 - .004; driver.rotation.y = Math.PI; group.add(driver);
    for (let i = -4; i <= 4; i++) { const grille = mesh(new T.BoxGeometry(.0025, setup.subHeight * .78, .004), mat(0x1b1d20)); grille.position.set(i * setup.subWidth * .075, 0, -setup.subDepth / 2 - .007); group.add(grille); }
   } else {
    // A configurable custom baffle with the PDF's circular ALPHA4-8 driver, not a generic miniature cabinet.
    group.add(mesh(new T.BoxGeometry(setup.baffleWidth, setup.baffleHeight, setup.baffleDepth), mat(0x292b2d, { roughness: .8 })));
    const frontZ = -setup.baffleDepth / 2, radius = setup.driverDiameter / 2;
    const basket = mesh(new T.CylinderGeometry(radius * .84, radius * .49, setup.driverDepth, 32), mat(0x191b1e)); basket.rotation.x = Math.PI / 2; basket.position.z = frontZ + setup.driverDepth / 2; group.add(basket);
    const surround = mesh(new T.TorusGeometry(radius * .82, radius * .15, 12, 40), mat(0x111315)); surround.position.z = frontZ - .003; group.add(surround);
    const cone = mesh(new T.ConeGeometry(radius * .72, radius * .27, 40, 1, true), mat(0x454a4d, { side: T.DoubleSide })); cone.rotation.x = Math.PI / 2; cone.position.z = frontZ - radius * .02; group.add(cone);
    const cap = mesh(new T.SphereGeometry(radius * .23, 20, 12), mat(0x2b3033)); cap.scale.z = .35; cap.position.z = frontZ - radius * .12; group.add(cap);
    const rim = new T.LineLoop(new T.BufferGeometry().setFromPoints(Array.from({ length: 64 }, (_, i) => new T.Vector3(radius * Math.cos(i * Math.PI / 32), radius * Math.sin(i * Math.PI / 32), frontZ - .012))), new T.LineBasicMaterial({ color })); group.add(rim);
   }
   const title = label(sp.id, '#' + color.toString(16).padStart(6, '0'), sub ? .55 : .48); title.position.y = (sub ? setup.subHeight : setup.baffleHeight) / 2 + .13; group.add(title);
   this.scene.add(group); this.speakerObjects.push(group); this.register(group, { kind: 'speaker', id: sp.id });
  }
 }

 update(s: SceneState) {
  this.roomBuild(s); this.sculptureBuild(s); this.suspensionBuild(s); this.speakerBuild(s);
  this.stone.scale.set(s.stone.width, s.stone.height, s.stone.depth); this.stone.position.set(...toThree(s.stone.position)); this.stone.rotation.y = s.stone.yaw * Math.PI / 180;
  this.robot.position.set(...toThree(basePosition(s))); this.joints.forEach((joint, i) => joint.quaternion.setFromAxisAngle(axes[i], s.robot.joints[i] * Math.PI / 180));
  const shoulderOffset = new T.Vector3(...linkOffset(s.robot.mount, 0));
  this.shoulderEnd.position.copy(shoulderOffset); this.shoulder.position.copy(shoulderOffset).multiplyScalar(.5);
  this.shoulder.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), shoulderOffset.normalize());
  this.light.intensity = s.light.intensity * 60; this.target.position.set(...toThree(s.robot.target)); this.target.visible = s.robot.control === 'target';
  this.listener.position.set(...toThree(s.listener.position)); this.listener.rotation.y = -s.listener.yaw * Math.PI / 180;
  this.speakerObjects.forEach((group, i) => {
   const sp = s.speakers[i]; group.position.set(...toThree(sp.position));
   const target = sp.role === 'arm' ? this.stone.position : new T.Vector3(0, sp.position[2], 0);
   group.lookAt(target); group.rotateY(Math.PI);
   const cabinet = group.children[0] as T.Mesh, material = cabinet.material as T.MeshStandardMaterial;
   material.emissive.setHex(this.selected.kind === 'speaker' && this.selected.id === sp.id ? 0x756c60 : s.monitoring === 'virtualspeakers' && sp.role !== 'sub' ? 0x232728 : 0); material.emissiveIntensity = 1;
  });
  while (this.sourceObjects.length > s.sources.length) {
   const o = this.sourceObjects.pop()!; if (this.transform.object === o) this.transform.detach(); this.scene.remove(o); dispose(o); this.objects.delete('source:' + (this.sourceObjects.length + 1));
  }
  while (this.sourceObjects.length < s.sources.length) {
   const i = this.sourceObjects.length, group = new T.Group(), color = [0xe1d9cc, 0xaebdb4, 0xa9bac2, 0xbfb5bd][i % 4];
   group.add(mesh(new T.SphereGeometry(.06, 16, 12), mat(color, { emissive: color, emissiveIntensity: .5 })));
   group.children[0].castShadow = false;
   group.add(new T.Mesh(new T.SphereGeometry(1, 20, 12), new T.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: .12 })));
   const text = label('S' + (i + 1), '#' + color.toString(16).padStart(6, '0'), .45); text.position.y = .19; group.add(text);
   this.sourceObjects.push(group); this.scene.add(group); this.register(group, { kind: 'source', id: String(i + 1) });
  }
  this.sourceObjects.forEach((group, i) => {
   group.position.set(...toThree(s.sources[i].position)); group.children[1].scale.setScalar(.09 + s.sources[i].spread * .004);
   const material = (group.children[0] as T.Mesh).material as T.MeshStandardMaterial; material.emissiveIntensity = this.selected.kind === 'source' && this.selected.id === String(i + 1) ? 1.8 : .5;
  });
  const light = new T.Vector3(...toThree(s.light.position)), attr = this.ray.geometry.attributes.position as T.BufferAttribute;
  attr.setXYZ(0, light.x, light.y, light.z); attr.setXYZ(1, this.stone.position.x, this.stone.position.y, this.stone.position.z); attr.needsUpdate = true; this.ray.computeLineDistances();
  if (!this.transform.dragging) this.attach();
 }
 setEditMode(enabled: boolean) { this.editMode = enabled; if (!enabled) this.transform.detach(); else this.attach(); }
 setSelection(s: Selection) { this.selected = s; this.effector.scale.setScalar(s.kind === 'light' ? 1.2 : 1); this.attach(); this.select(); this.update(this.store.state); }
 private attach() {
  const s = this.store.state, selection = this.selected;
  const speaker = selection.kind === 'speaker' ? s.speakers.find(sp => sp.id === selection.id) : undefined;
  const editable = selection.kind === 'source' || selection.kind === 'listener' || selection.kind === 'target' || selection.kind === 'stone' || selection.kind === 'shell' || selection.kind === 'robot' || selection.kind === 'speaker' && !s.speakersLocked && speaker?.role !== 'arm';
  const object = this.objects.get(selection.kind + ':' + selection.id);
  if (this.editMode && editable && object) { if (this.transform.object !== object) this.transform.attach(object); } else this.transform.detach();
 }
 private pick(e: PointerEvent) {
  const rect = this.host.getBoundingClientRect(); this.raycaster.setFromCamera(new T.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1), this.camera);
  const hits = this.raycaster.intersectObjects([...this.objects.values()], true);
  // Acrylic is selectable, but its transparent faces must not swallow clicks on the stone or the sources inside.
  hits.sort((a, b) => Number(this.isShell(a.object)) - Number(this.isShell(b.object)) || a.distance - b.distance);
  for (const hit of hits) { let o: T.Object3D | null = hit.object; while (o && !o.userData.selection) o = o.parent; if (o) { this.setSelection(o.userData.selection); break; } }
 }
 private isShell(o: T.Object3D) { let p: T.Object3D | null = o; while (p) { if (p === this.shell) return true; p = p.parent; } return false; }
 private drag() {
  const object = this.transform.object; if (!object) return;
  const value = fromThree(object.position.toArray() as Vec3), room = this.store.state.room;
  const v: Vec3 = [clamp(value[0], -room.width / 2, room.width / 2), clamp(value[1], -room.depth / 2, room.depth / 2), clamp(value[2], 0, room.height)];
  this.store.change(s => {
   switch (this.selected.kind) {
    case 'source': { const source = s.sources.find(x => String(x.id) === this.selected.id); if (source) source.position = v; s.mappings.centroid.enabled = false; s.mappings.density.enabled = false; s.mappings.rotation.enabled = false; s.mappings.lightDistance.enabled = false; break; }
    case 'speaker': if (!s.speakersLocked) { const speaker = s.speakers.find(x => x.id === this.selected.id); if (speaker && speaker.role !== 'arm') speaker.position = v; } break;
    case 'listener': s.listener.position = v; break;
    case 'target': s.robot.target = v; s.robot.control = 'target'; s.motion.playing = false; break;
    case 'stone': s.stone.position = [v[0], v[1], Math.max(s.stone.height / 2, v[2])]; break;
    case 'shell': s.acrylic.position = v; break;
    case 'robot': s.robot.base = v; s.motion.playing = false; break;
   }
  });
 }
 view(name: string) {
  const s = this.store.state, { width: w, depth: d, height: h, corridorDepth: corridor } = s.room;
  const span = Math.max(w + corridor, d, h), aspectFit = Math.max(1, 1 / this.camera.aspect);
  const fit = span / (2 * Math.tan(T.MathUtils.degToRad(this.camera.fov / 2))) * 1.2 * aspectFit;
  this.controls.enabled = true; this.controls.target.set(-corridor * .25, Math.min(h * .28, 2), 0);
  switch (name) {
   case 'TOP': this.controls.target.set(-corridor / 2, 0, 0); this.camera.position.set(-corridor / 2, fit * 1.1, -.001); break;
   case 'FRONT': this.controls.target.set(0, h * .45, 0); this.camera.position.set(0, h * .45, -fit - d * .15); break;
   case 'SIDE': this.controls.target.set(0, h * .45, 0); this.camera.position.set(fit + w * .15, h * .45, 0); break;
   case 'LISTENER': {
    const p = new T.Vector3(...toThree(s.listener.position)); this.camera.position.copy(p);
    this.controls.target.copy(p).add(new T.Vector3(Math.sin(s.listener.yaw * Math.PI / 180), 0, -Math.cos(s.listener.yaw * Math.PI / 180))); break;
   }
   default: this.camera.position.set(-span * 1.2 * aspectFit, span * .98 * aspectFit, -span * 1.25 * aspectFit);
  }
  this.camera.lookAt(this.controls.target); this.controls.update();
 }
 focus() {
  const object = this.objects.get(this.selected.kind + ':' + this.selected.id);
  if (object) {
   const target = object.getWorldPosition(new T.Vector3()), direction = this.camera.position.clone().sub(this.controls.target).normalize();
   const distance = this.selected.kind === 'shell' ? Math.max(this.store.state.acrylic.bottomFrontWidth, this.store.state.acrylic.depth) * 1.8 : this.selected.kind === 'robot' ? 2.8 : 1.5;
   this.controls.target.copy(target); this.camera.position.copy(target).addScaledVector(direction, distance); this.controls.update();
  }
 }
 setPath(points: Vec3[]) { this.path.geometry.dispose(); this.path.geometry = new T.BufferGeometry().setFromPoints(points.map(p => new T.Vector3(...toThree(p)))); }
 setNameSize(pixels: number) { if (Number.isFinite(pixels)) this.nameLabelPixels = clamp(pixels, .1, 18); }
 resize() { const width = this.host.clientWidth, height = this.host.clientHeight; this.camera.aspect = width / Math.max(1, height); this.camera.updateProjectionMatrix(); this.renderer.setSize(width, height); }
 render() {
  if (this.disposed) return; this.controls.update();
  const unitsPerPixel = 2 * Math.tan(T.MathUtils.degToRad(this.camera.fov / 2)) / Math.max(1, this.host.clientHeight);
  this.scene.traverse(object => {
   if (object instanceof T.Sprite && object.userData.labelAspect) {
    const distance = this.camera.position.distanceTo(object.getWorldPosition(new T.Vector3()));
    const pixels = object.userData.nameLabel ? this.nameLabelPixels : object.userData.labelPixels;
    const height = distance * unitsPerPixel * pixels * 72 / 38;
    object.scale.set(height * object.userData.labelAspect, height, 1);
   }
  });
  this.renderer.render(this.scene, this.camera);
 }
}

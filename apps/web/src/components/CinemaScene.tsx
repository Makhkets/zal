import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Availability, Hall, Seat } from '../lib/types';
import './cinema-scene.css';

interface CinemaSceneProps {
  hall: Hall;
  seat?: Seat | null;
  availability?: Availability;
  overview?: boolean;
  className?: string;
  onError?: () => void;
  paused?: boolean;
  interactive?: boolean;
  onSeatSelect?: (seat: Seat) => void;
  view?: 'overview' | 'front' | 'back' | 'top';
}

const ACCENT = new THREE.Color('#ff4b2b');
const UPHOLSTERY = new THREE.Color('#55534c');
const OCCUPIED = new THREE.Color('#33332f');

function makeScreenTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1536;
  canvas.height = 640;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.fillStyle = '#eee9dc';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#181815';
  context.font = '700 25px Arial, sans-serif';
  context.fillText('ZAL / A DIFFERENT POINT OF VIEW', 46, 54);
  context.textAlign = 'right';
  context.fillText('01 — 24', 1490, 54);
  context.textAlign = 'center';
  context.strokeStyle = '#272720';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(0, 320);
  context.lineTo(1536, 320);
  context.moveTo(768, 0);
  context.lineTo(768, 640);
  context.stroke();
  context.fillStyle = '#ff4b2b';
  context.beginPath();
  context.arc(768, 320, 190, 0, Math.PI * 2);
  context.fill();
  for (const radius of [177, 204, 218]) {
    context.beginPath();
    context.arc(768, 320, radius, 0, Math.PI * 2);
    context.stroke();
  }
  context.fillStyle = '#171713';
  context.font = '900 185px Arial, sans-serif';
  context.fillText('Z', 768, 386);
  context.font = '700 22px Arial, sans-serif';
  context.fillText('КИНО НАЧИНАЕТСЯ С ВАШЕГО МЕСТА', 768, 601);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** The scene and the seat map consume the same Hall positions, in metres. */
export default function CinemaScene({
  hall,
  seat = null,
  availability,
  overview = false,
  className = '',
  onError,
  paused = false,
  interactive = false,
  onSeatSelect,
  view = 'overview',
}: CinemaSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const syncRef = useRef<(() => void) | null>(null);
  const propsRef = useRef({ seat, availability, overview, paused, onError, interactive, onSeatSelect, view });
  propsRef.current = { seat, availability, overview, paused, onError, interactive, onSeatSelect, view };
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    setUnavailable(false);
    if (!hall.seats.length) {
      setUnavailable(true);
      propsRef.current.onError?.();
      return;
    }
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch {
      setUnavailable(true);
      propsRef.current.onError?.();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    renderer.setClearColor(0x10100e, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(hall.camera.fov_degrees, 1, hall.camera.near, hall.camera.far * 2);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enabled = false;
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.rotateSpeed = 0.6;
    controls.zoomSpeed = 0.75;
    controls.minDistance = Math.max(5, hall.dimensions.width * 0.35);
    controls.maxDistance = Math.max(hall.dimensions.width, hall.dimensions.depth) * 3.3;
    controls.minPolarAngle = 0.015;
    controls.maxPolarAngle = Math.PI / 2 - 0.06;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const screenCenter = new THREE.Vector3(hall.screen.center.x, hall.screen.center.y, hall.screen.center.z);
    const overviewCenter = new THREE.Vector3(0, 1.7, hall.dimensions.depth * 0.43);
    const targetPosition = new THREE.Vector3();
    const targetLookAt = new THREE.Vector3();
    const currentLookAt = new THREE.Vector3();
    const velocity = new THREE.Vector3();
    const force = new THREE.Vector3();
    const matrixObject = new THREE.Object3D();
    const chairTransform = new THREE.Matrix4();
    const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let disposed = false;
    let visible = true;
    let contextLost = false;
    let initialized = false;
    let previousTime = 0;
    let orbitTime = 0;
    let isOverview = true;
    let presetKey = '';
    let interactiveMode = false;
    let pointerDown: { x: number; y: number; id: number; dragged: boolean } | null = null;
    const activePointers = new Set<number>();

    const box = new THREE.BoxGeometry(1, 1, 1);
    const floorMaterial = new THREE.MeshStandardMaterial({ color: '#24231f', roughness: 0.91, metalness: 0.08 });
    const edgeMaterial = new THREE.MeshStandardMaterial({ color: '#39362e', roughness: 0.7, metalness: 0.25 });
    const wallMaterial = new THREE.MeshStandardMaterial({ color: '#1a1916', roughness: 1 });
    const glowMaterial = new THREE.MeshBasicMaterial({ color: '#ff6b43', toneMapped: false });
    const room = new THREE.Group();
    scene.add(room);
    const cube = (parent: THREE.Object3D, x: number, y: number, z: number, width: number, height: number, depth: number, material: THREE.Material) => {
      const mesh = new THREE.Mesh(box, material);
      mesh.position.set(x, y, z);
      mesh.scale.set(width, height, depth);
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    // The cutaway is open in overview; the real room surrounds the seated camera.
    cube(room, -hall.dimensions.width / 2, hall.dimensions.height / 2, hall.dimensions.depth / 2, 0.18, hall.dimensions.height, hall.dimensions.depth, wallMaterial);
    cube(room, hall.dimensions.width / 2, hall.dimensions.height / 2, hall.dimensions.depth / 2, 0.18, hall.dimensions.height, hall.dimensions.depth, wallMaterial);
    cube(room, 0, hall.dimensions.height / 2, hall.dimensions.depth, hall.dimensions.width, hall.dimensions.height, 0.18, wallMaterial);
    cube(room, 0, hall.dimensions.height / 2, -0.35, hall.dimensions.width, hall.dimensions.height, 0.18, wallMaterial);

    const platformWidth = Math.min(hall.dimensions.width - 1.0, Math.max(...hall.seats.map((s) => Math.abs(s.position.x) * 2 + s.width + 1)));
    cube(scene, 0, -0.4, hall.dimensions.depth / 2, platformWidth + 0.4, 0.65, hall.dimensions.depth - 1, floorMaterial);
    const rows = [...new Set(hall.seats.map((s) => s.row))].sort((a, b) => a - b);
    for (const row of rows) {
      const seats = hall.seats.filter((s) => s.row === row);
      const z = Math.min(...seats.map((s) => s.position.z));
      const y = Math.min(...seats.map((s) => s.position.y));
      // Platforms are generated from seat elevations, never from an independent seating grid.
      const back = hall.dimensions.depth - 0.65;
      cube(scene, 0, y / 2 - 0.06, (z - 0.55 + back) / 2, platformWidth, y + 0.12, back - z + 0.55, floorMaterial);
      for (const side of [-1, 1]) {
        cube(scene, side * (platformWidth / 2 - 0.16), y + 0.025, z - 0.25, 0.045, 0.025, 0.47, glowMaterial);
      }
    }
    // A thin warm frame keeps the object legible against the charcoal page.
    cube(scene, 0, -0.12, 0.95, platformWidth + 0.4, 0.08, 0.08, edgeMaterial);
    cube(scene, 0, -0.12, hall.dimensions.depth - 0.5, platformWidth + 0.4, 0.08, 0.08, edgeMaterial);

    const chairMaterial = new THREE.MeshStandardMaterial({ color: 'white', roughness: 0.68, metalness: 0.04 });
    const chairMeshes: THREE.InstancedMesh[] = [];
    const chairParts = [
      { dimensions: [0.85, 0.74, 0.18], position: [0, 0.85, 0.28], radius: 0.11 },
      { dimensions: [0.85, 0.19, 0.7], position: [0, 0.46, -0.03], radius: 0.075 },
      { dimensions: [0.1, 0.16, 0.72], position: [-0.45, 0.66, -0.02], radius: 0.05 },
      { dimensions: [0.1, 0.16, 0.72], position: [0.45, 0.66, -0.02], radius: 0.05 },
      { dimensions: [0.55, 0.32, 0.46], position: [0, 0.21, 0.05], radius: 0.025 },
    ];
    for (const part of chairParts) {
      const geometry = new RoundedBoxGeometry(part.dimensions[0], part.dimensions[1], part.dimensions[2], 2, part.radius);
      geometry.translate(part.position[0], part.position[1], part.position[2]);
      const mesh = new THREE.InstancedMesh(geometry, chairMaterial, hall.seats.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      chairMeshes.push(mesh);
      scene.add(mesh);
    }
    const headMaterial = new THREE.MeshStandardMaterial({ color: '#151512', roughness: 1 });
    const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.145, 12, 10), headMaterial, hall.seats.length);
    const bodies = new THREE.InstancedMesh(new RoundedBoxGeometry(0.43, 0.52, 0.26, 2, 0.1), headMaterial, hall.seats.length);
    heads.frustumCulled = bodies.frustumCulled = false;
    scene.add(heads, bodies);

    const screenTexture = makeScreenTexture();
    const screenMaterial = new THREE.MeshBasicMaterial({ map: screenTexture, color: screenTexture ? 'white' : '#eee9dc', toneMapped: false, side: THREE.DoubleSide });
    const screenAssembly = new THREE.Group();
    scene.add(screenAssembly);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(hall.screen.width, hall.screen.height), screenMaterial);
    screen.position.copy(screenCenter);
    screenAssembly.add(screen);
    cube(screenAssembly, screenCenter.x, screenCenter.y, screenCenter.z - 0.15, hall.screen.width + 0.28, hall.screen.height + 0.28, 0.22, edgeMaterial);
    for (const x of [-hall.screen.width * 0.44, hall.screen.width * 0.44]) {
      cube(screenAssembly, screenCenter.x + x, Math.max(0.1, (screenCenter.y - hall.screen.height / 2) / 2), screenCenter.z - 0.15, 0.13, Math.max(0.1, screenCenter.y - hall.screen.height / 2), 0.18, edgeMaterial);
    }

    const speakersMaterial = new THREE.MeshStandardMaterial({ color: '#282720', roughness: 0.84 });
    for (const speaker of hall.speakers) {
      cube(scene, speaker.position.x, speaker.position.y, speaker.position.z, 0.6, 1.2, 0.5, speakersMaterial);
    }
    scene.add(new THREE.HemisphereLight('#e9e3cf', '#272019', 2.0));
    const keyLight = new THREE.DirectionalLight('#ffe8ce', 3.3);
    keyLight.position.set(2, 12, 8);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    Object.assign(keyLight.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 0.1, far: 40 });
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.03;
    keyLight.target.position.set(0, 0, 8);
    scene.add(keyLight, keyLight.target);
    const screenLight = new THREE.PointLight('#ffe1be', 90, 24, 2);
    screenLight.position.set(screenCenter.x, screenCenter.y, screenCenter.z + 2.2);
    scene.add(screenLight);
    const accentLight = new THREE.PointLight('#ff4b2b', 4.5, 5, 2);
    scene.add(accentLight);

    // Visible only in the cutaway: a restrained projection volume, rather than a page background effect.
    const projector = new THREE.Vector3(0, hall.dimensions.height - 0.7, hall.dimensions.depth - 1.0);
    const corners = [
      new THREE.Vector3(screenCenter.x - hall.screen.width / 2, screenCenter.y - hall.screen.height / 2, screenCenter.z + 0.08),
      new THREE.Vector3(screenCenter.x + hall.screen.width / 2, screenCenter.y - hall.screen.height / 2, screenCenter.z + 0.08),
      new THREE.Vector3(screenCenter.x + hall.screen.width / 2, screenCenter.y + hall.screen.height / 2, screenCenter.z + 0.08),
      new THREE.Vector3(screenCenter.x - hall.screen.width / 2, screenCenter.y + hall.screen.height / 2, screenCenter.z + 0.08),
    ];
    const volumeVertices: number[] = [];
    corners.forEach((corner, index) => volumeVertices.push(...projector.toArray(), ...corner.toArray(), ...corners[(index + 1) % 4].toArray()));
    const volumeGeometry = new THREE.BufferGeometry();
    volumeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(volumeVertices, 3));
    const volumeMaterial = new THREE.MeshBasicMaterial({ color: '#ffe6bc', transparent: true, opacity: 0.018, side: THREE.DoubleSide, depthWrite: false });
    const volume = new THREE.Mesh(volumeGeometry, volumeMaterial);
    scene.add(volume);

    const selectionRing = new THREE.Mesh(new THREE.RingGeometry(0.58, 0.61, 48), new THREE.MeshBasicMaterial({ color: '#ff6a43', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    selectionRing.rotation.x = -Math.PI / 2;
    scene.add(selectionRing);

    function framingScale(aspect: number) {
      const minimumAspect = propsRef.current.interactive && propsRef.current.view !== 'top' ? 1.35 : 0.95;
      return Math.max(1, minimumAspect / aspect);
    }

    function updateTarget() {
      const current = propsRef.current;
      isOverview = current.overview || !current.seat;
      interactiveMode = isOverview && current.interactive;
      controls.enabled = interactiveMode;
      renderer.domElement.style.touchAction = interactiveMode ? 'none' : 'pan-y';
      renderer.domElement.style.cursor = interactiveMode ? 'grab' : '';
      camera.fov = isOverview ? 43 : hall.camera.fov_degrees;
      camera.updateProjectionMatrix();
      room.visible = !isOverview;
      volume.visible = isOverview && !interactiveMode;
      screenAssembly.visible = !(interactiveMode && current.view === 'front');
      const nextPresetKey = String(isOverview) + ':' + String(interactiveMode) + ':' + current.view;
      // A selection or a fresh availability response must not undo the user's orbit/zoom.
      if (interactiveMode && initialized && nextPresetKey === presetKey) return;
      presetKey = nextPresetKey;
      if (isOverview) {
        const scale = framingScale(camera.aspect);
        const angle = 0.7 + Math.sin(orbitTime * 0.11) * 0.055;
        const distance = Math.max(hall.dimensions.width, hall.dimensions.depth) * 1.46 * scale;
        targetPosition.set(Math.sin(angle) * distance, 15.7 * scale, overviewCenter.z + Math.cos(angle) * distance);
        targetLookAt.copy(overviewCenter);
        if (interactiveMode) {
          const span = Math.max(hall.dimensions.width, hall.dimensions.depth) * scale;
          if (current.view === 'front') targetPosition.set(0, span * 0.78, overviewCenter.z - span * 1.35);
          if (current.view === 'back') targetPosition.set(0, span * 0.85, overviewCenter.z + span * 1.42);
          // Near-vertical with world +Y up produces a map where the screen is at the top.
          if (current.view === 'top') targetPosition.set(0, span * 1.8, overviewCenter.z + 0.02);
          // Booking puts the chairs within easy reach; the hero keeps its wider composition.
          targetPosition.sub(targetLookAt).multiplyScalar(current.view === 'top' ? 0.92 : 0.75).add(targetLookAt);
          camera.position.copy(targetPosition);
          controls.target.copy(targetLookAt);
          controls.update();
          currentLookAt.copy(targetLookAt);
          velocity.set(0, 0, 0);
          initialized = true;
        }
      } else if (current.seat) {
        const position = current.seat.position;
        targetPosition.set(position.x, position.y + hall.camera.eye_height, position.z);
        targetLookAt.copy(screenCenter);
      }
      if (!initialized || (reduced.matches && !interactiveMode)) {
        camera.position.copy(targetPosition);
        currentLookAt.copy(targetLookAt);
        velocity.set(0, 0, 0);
        initialized = true;
      }
    }

    function updateSeats() {
      const current = propsRef.current;
      const highlight = current.seat || (!interactiveMode ? hall.seats.find((s) => s.row === 6 && s.number === 12) || hall.seats[Math.floor(hall.seats.length / 2)] : undefined);
      const statuses = new Map(current.availability?.seats.map((s) => [s.seat_id, s.status]));
      hall.seats.forEach((currentSeat, index) => {
        const isSelected = currentSeat.id === highlight?.id;
        const hideOwnSeat = !isOverview && isSelected;
        matrixObject.position.set(currentSeat.position.x, currentSeat.position.y, currentSeat.position.z);
        matrixObject.rotation.set(0, currentSeat.rotation_y, 0);
        matrixObject.scale.set(currentSeat.width, 1, currentSeat.depth / 0.72);
        matrixObject.updateMatrix();
        chairTransform.copy(matrixObject.matrix);
        for (const mesh of chairMeshes) {
          mesh.setMatrixAt(index, hideOwnSeat ? hiddenMatrix : chairTransform);
          mesh.setColorAt(index, isSelected ? ACCENT : statuses.get(currentSeat.id) === 'sold' ? OCCUPIED : UPHOLSTERY);
        }
        const occupied = statuses.get(currentSeat.id) === 'sold' && !hideOwnSeat;
        matrixObject.scale.set(1, 1, 1);
        matrixObject.position.set(currentSeat.position.x, currentSeat.position.y + hall.camera.eye_height, currentSeat.position.z - 0.03);
        matrixObject.updateMatrix();
        heads.setMatrixAt(index, occupied ? matrixObject.matrix : hiddenMatrix);
        matrixObject.position.y = currentSeat.position.y + 0.84;
        matrixObject.updateMatrix();
        bodies.setMatrixAt(index, occupied ? matrixObject.matrix : hiddenMatrix);
      });
      for (const mesh of chairMeshes) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
      heads.instanceMatrix.needsUpdate = bodies.instanceMatrix.needsUpdate = true;
      selectionRing.visible = !!highlight && isOverview;
      accentLight.intensity = highlight ? 4.5 : 0;
      if (highlight) {
        selectionRing.position.set(highlight.position.x, highlight.position.y + 0.028, highlight.position.z);
        accentLight.position.set(highlight.position.x, highlight.position.y + 1.8, highlight.position.z - 0.3);
      }
    }

    function renderFrame(timestamp: number) {
      if (disposed || contextLost || !visible || document.hidden) {
        renderer.setAnimationLoop(null);
        return;
      }
      const dt = Math.min(0.033, previousTime ? (timestamp - previousTime) / 1000 : 1 / 60);
      previousTime = timestamp;
      const movingOverview = isOverview && !interactiveMode && !propsRef.current.paused && !reduced.matches;
      if (movingOverview) {
        orbitTime += dt;
        updateTarget();
      }
      let controlsChanged = false;
      if (interactiveMode) {
        controlsChanged = controls.update(dt);
      } else if (reduced.matches) {
        camera.position.copy(targetPosition);
        currentLookAt.copy(targetLookAt);
      } else {
        // Critically damped spring starts from its on-screen position on every retarget.
        force.copy(targetPosition).sub(camera.position).multiplyScalar(150).addScaledVector(velocity, -24.5);
        velocity.addScaledVector(force, dt);
        camera.position.addScaledVector(velocity, dt);
        currentLookAt.lerp(targetLookAt, 1 - Math.exp(-16 * dt));
      }
      if (!interactiveMode) camera.lookAt(currentLookAt);
      renderer.render(scene, camera);
      if (interactiveMode) {
        if (!controlsChanged) renderer.setAnimationLoop(null);
        return;
      }
      const settled = camera.position.distanceToSquared(targetPosition) < 0.00001 && velocity.lengthSq() < 0.0001 && currentLookAt.distanceToSquared(targetLookAt) < 0.00001;
      if (!movingOverview && (settled || reduced.matches)) renderer.setAnimationLoop(null);
    }

    function invalidate() {
      if (disposed || contextLost || !visible || document.hidden) return;
      previousTime = 0;
      renderer.setAnimationLoop(renderFrame);
    }
    function sync() {
      updateTarget();
      updateSeats();
      invalidate();
    }
    function hitSeat(event: PointerEvent) {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(chairMeshes, false)[0];
      return hit?.instanceId === undefined ? undefined : hall.seats[hit.instanceId];
    }
    function onPointerDown(event: PointerEvent) {
      if (!interactiveMode) return;
      activePointers.add(event.pointerId);
      if (activePointers.size > 1) {
        if (pointerDown) pointerDown.dragged = true;
        return;
      }
      if (event.button !== 0) return;
      pointerDown = { x: event.clientX, y: event.clientY, id: event.pointerId, dragged: false };
    }
    function onPointerMove(event: PointerEvent) {
      if (!interactiveMode) return;
      if (pointerDown) {
        if (Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 6) pointerDown.dragged = true;
        renderer.domElement.style.cursor = pointerDown.dragged ? 'grabbing' : 'pointer';
      } else {
        renderer.domElement.style.cursor = hitSeat(event) ? 'pointer' : 'grab';
      }
    }
    function onPointerUp(event: PointerEvent) {
      activePointers.delete(event.pointerId);
      if (!interactiveMode || !pointerDown || event.pointerId !== pointerDown.id) return;
      const isClick = !pointerDown.dragged && Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) <= 6;
      pointerDown = null;
      renderer.domElement.style.cursor = 'grab';
      if (isClick) {
        const picked = hitSeat(event);
        if (picked) propsRef.current.onSeatSelect?.(picked);
      }
    }
    function onPointerCancel(event: PointerEvent) {
      activePointers.delete(event.pointerId);
      pointerDown = null;
      renderer.domElement.style.cursor = interactiveMode ? 'grab' : '';
    }
    controls.addEventListener('change', invalidate);
    controls.addEventListener('start', invalidate);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerCancel);
    syncRef.current = sync;
    function resize() {
      const width = Math.max(1, host!.clientWidth);
      const height = Math.max(1, host!.clientHeight);
      renderer.setSize(width, height, false);
      const previousScale = framingScale(camera.aspect);
      camera.aspect = width / height;
      if (interactiveMode && initialized) {
        // Preserve the user's orbit and zoom while keeping the hall in frame after rotation.
        camera.position.sub(controls.target).multiplyScalar(framingScale(camera.aspect) / previousScale).add(controls.target);
        controls.update();
      }
      updateTarget();
      invalidate();
    }
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) invalidate();
      else renderer.setAnimationLoop(null);
    }, { rootMargin: '80px' });
    intersectionObserver.observe(host);
    const visibilityChange = () => {
      if (document.hidden) renderer.setAnimationLoop(null);
      else invalidate();
    };
    const motionChange = () => { updateTarget(); invalidate(); };
    const lost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      renderer.setAnimationLoop(null);
      setUnavailable(true);
      propsRef.current.onError?.();
    };
    renderer.domElement.addEventListener('webglcontextlost', lost);
    document.addEventListener('visibilitychange', visibilityChange);
    reduced.addEventListener('change', motionChange);
    resize();
    sync();

    return () => {
      disposed = true;
      syncRef.current = null;
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', visibilityChange);
      reduced.removeEventListener('change', motionChange);
      controls.removeEventListener('change', invalidate);
      controls.removeEventListener('start', invalidate);
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerCancel);
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          geometries.add(object.geometry);
          const list = Array.isArray(object.material) ? object.material : [object.material];
          list.forEach((material) => materials.add(material));
        }
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      screenTexture?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [hall]);

  useEffect(() => { syncRef.current?.(); }, [seat, availability, overview, paused, interactive, view]);

  return (
    <div className={'cinema-scene ' + className} data-interactive={interactive || undefined} role="img" aria-label={interactive ? 'Интерактивный 3D-зал: нажмите на кресло для выбора, перетаскивайте для вращения. Для выбора с клавиатуры используйте схему 2D.' : overview || !seat ? 'Объёмная модель кинозала с подсвеченным выбранным креслом' : 'Вид на экран: ряд ' + seat.row + ', ' + (seat.type === 'sofa' ? 'диван ' : 'место ') + seat.number}>
      <div className="cinema-scene__canvas" ref={hostRef} />
      {unavailable && (
        <div className="cinema-scene__fallback" role="status">
          <svg viewBox="0 0 240 120" aria-hidden="true"><path d="M30 18 Q120 38 210 18v42Q120 80 30 60Z" fill="#f0eadd"/><circle cx="120" cy="44" r="18" fill="#ff4b2b"/><path d="M32 92h28m12 0h28m12 0h28m12 0h28m12 0h28M44 108h28m12 0h28m12 0h28m12 0h28" stroke="#aaa89c" strokeWidth="11" strokeLinecap="round"/></svg>
          <p>На этом устройстве 3D недоступен.</p>
          <span>Выберите место на схеме — покупка по-прежнему доступна.</span>
        </div>
      )}
    </div>
  );
}

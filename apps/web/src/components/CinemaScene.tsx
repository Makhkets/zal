import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
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
  onHoverSeat?: (seat: Seat | null) => void;
  view?: 'overview' | 'front' | 'back' | 'top' | 'sofas';
  videoElement?: HTMLVideoElement | null;
  videoPoster?: string;
  videoAspect?: number;
  audience?: boolean;
  lookAround?: boolean;
  resetViewKey?: number;
}

const ACCENT = new THREE.Color('#ff4b2b');
const UPHOLSTERY = new THREE.Color('#44413e');
const OCCUPIED = new THREE.Color('#24282d');
const HOVER = new THREE.Color('#dfb091');
const TERRACOTTA = new THREE.Color('#684438');

function makeScreenTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1920;
  canvas.height = 800;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const sky = context.createLinearGradient(0, 0, 0, 800);
  sky.addColorStop(0, '#09131d');
  sky.addColorStop(0.65, '#273744');
  sky.addColorStop(0.82, '#b75f39');
  sky.addColorStop(1, '#0b1015');
  context.fillStyle = sky;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const halo = context.createRadialGradient(1180, 410, 20, 1180, 410, 410);
  halo.addColorStop(0, 'rgba(255,219,156,0.8)');
  halo.addColorStop(0.5, 'rgba(242,119,59,0.25)');
  halo.addColorStop(1, 'rgba(255,119,50,0)');
  context.fillStyle = halo;
  context.fillRect(0, 0, 1920, 800);
  const sun = context.createLinearGradient(0, 200, 0, 610);
  sun.addColorStop(0, '#ffe1a3'); sun.addColorStop(1, '#f45b32');
  context.fillStyle = sun;
  context.beginPath();
  context.arc(1180, 408, 192, 0, Math.PI * 2);
  context.fill();
  for (let index = 0; index < 6; index++) {
    const y = 570 + index * 27;
    context.fillStyle = index < 3 ? '#1a242c' : '#0b1118';
    context.beginPath();
    context.moveTo(0, 800);
    for (let x = 0; x <= 1920; x += 16) context.lineTo(x, y + Math.sin(x * 0.003 + index * 1.7) * 26 + Math.sin(x * 0.012 + index) * 7);
    context.lineTo(1920, 800); context.fill();
  }
  context.fillStyle = '#fff6e6';
  context.font = '700 42px Arial, sans-serif';
  context.fillText('ZAL.', 80, 90);
  context.font = '500 20px Arial, sans-serif';
  context.fillText('БОЛЬШОЕ КИНО. ВАШЕ МЕСТО.', 80, 730);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function makeFabricTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.fillStyle = '#b9b9b9'; context.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 2) for (let x = 0; x < 128; x += 2) {
    const value = 145 + ((x * 17 + y * 31) % 73);
    context.fillStyle = `rgb(${value},${value},${value})`;
    context.fillRect(x, y, 1, 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  return texture;
}

function makeChairBack(width: number, height: number, depth: number) {
  const shape = new THREE.Shape();
  const x = width / 2; const y = height / 2;
  const topRadius = width * 0.23; const bottomRadius = width * 0.08;
  shape.moveTo(-x + bottomRadius, -y);
  shape.lineTo(x - bottomRadius, -y);
  shape.quadraticCurveTo(x, -y, x, -y + bottomRadius);
  shape.lineTo(x, y - topRadius);
  shape.quadraticCurveTo(x, y, x - topRadius, y);
  shape.lineTo(-x + topRadius, y);
  shape.quadraticCurveTo(-x, y, -x, y - topRadius);
  shape.lineTo(-x, -y + bottomRadius);
  shape.quadraticCurveTo(-x, -y, -x + bottomRadius, -y);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.045, bevelSegments: 3, curveSegments: 7, steps: 1 });
  geometry.translate(0, 0, -depth / 2);
  geometry.rotateX(0.06);
  return toCreasedNormals(geometry, Math.PI / 3);
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
  onHoverSeat,
  view = 'overview',
  videoElement = null,
  videoPoster,
  videoAspect,
  audience = true,
  lookAround = true,
  resetViewKey = 0,
}: CinemaSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const hoverLabelRef = useRef<HTMLDivElement>(null);
  const syncRef = useRef<(() => void) | null>(null);
  const propsRef = useRef({ seat, availability, overview, paused, onError, interactive, onSeatSelect, onHoverSeat, view, videoElement, videoPoster, videoAspect, audience, lookAround, resetViewKey });
  propsRef.current = { seat, availability, overview, paused, onError, interactive, onSeatSelect, onHoverSeat, view, videoElement, videoPoster, videoAspect, audience, lookAround, resetViewKey };
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
    renderer.shadowMap.autoUpdate = false;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#090c11');
    scene.fog = new THREE.Fog('#090c11', hall.dimensions.depth * 1.65, hall.dimensions.depth * 4);
    const camera = new THREE.PerspectiveCamera(hall.camera.fov_degrees, 1, hall.camera.near, hall.camera.far * 2);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enabled = false;
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.rotateSpeed = 0.6;
    controls.zoomSpeed = 0.75;
    controls.minDistance = Math.max(4, hall.dimensions.width * 0.22);
    controls.maxDistance = Math.max(hall.dimensions.width, hall.dimensions.depth) * 2.2;
    controls.minPolarAngle = 0.015;
    controls.maxPolarAngle = Math.PI / 2 - 0.06;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const screenCenter = new THREE.Vector3(hall.screen.center.x, hall.screen.center.y, hall.screen.center.z);
    const maxSeatY = Math.max(...hall.seats.map(s => s.position.y));
    const maxSeatZ = Math.max(...hall.seats.map(s => s.position.z));
    const minSeatZ = Math.min(...hall.seats.map(s => s.position.z));
    const roomWidth = hall.dimensions.width;
    const roomDepth = hall.dimensions.depth;
    const roomHeight = hall.dimensions.height;
    const overviewCenter = new THREE.Vector3(0, Math.max(2.5, screenCenter.y * 0.68, maxSeatY * 0.8), roomDepth * 0.38);
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
    let renderedFrames = 0;
    let initialized = false;
    let previousTime = 0;
    let orbitTime = 0;
    let isOverview = true;
    let presetKey = '';
    let interactiveMode = false;
    let lookMode = false;
    let headYaw = 0;
    let headPitch = 0;
    let lookKey = '';
    let hoveredId: string | null = null;
    let video: HTMLVideoElement | null = null;
    let videoTexture: THREE.VideoTexture | null = null;
    let posterTexture: THREE.Texture | null = null;
    let posterUrl: string | undefined;
    let posterRevision = 0;
    let posterAspect = 0;
    const headEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    let pointerDown: { x: number; y: number; lastX: number; lastY: number; id: number; dragged: boolean } | null = null;
    const activePointers = new Set<number>();

    const box = new THREE.BoxGeometry(1, 1, 1);
    const fabricTexture = makeFabricTexture();
    const floorMaterial = new THREE.MeshStandardMaterial({ color: '#191c21', roughness: 0.98, bumpMap: fabricTexture, bumpScale: 0.012 });
    const edgeMaterial = new THREE.MeshStandardMaterial({ color: '#101317', roughness: 0.38, metalness: 0.7 });
    const wallMaterial = new THREE.MeshStandardMaterial({ color: '#161b22', roughness: 0.95 });
    const panelMaterial = new THREE.MeshStandardMaterial({ color: '#292827', roughness: 0.92, bumpMap: fabricTexture, bumpScale: 0.025 });
    const revealMaterial = new THREE.MeshStandardMaterial({ color: '#07090d', roughness: 0.7 });
    const glowMaterial = new THREE.MeshBasicMaterial({ color: '#ff873f', toneMapped: false });
    const ceilingLightMaterial = new THREE.MeshBasicMaterial({ color: '#e9d7bc', toneMapped: false });
    const room = new THREE.Group();
    const backWall = new THREE.Group();
    const ceiling = new THREE.Group();
    const stage = new THREE.Group();
    scene.add(room, backWall, ceiling, stage);
    const cube = (parent: THREE.Object3D, x: number, y: number, z: number, width: number, height: number, depth: number, material: THREE.Material) => {
      const mesh = new THREE.Mesh(box, material);
      mesh.position.set(x, y, z);
      mesh.scale.set(width, height, depth);
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    // Architecture frames the seats at real-world scale; the booking camera sits inside it.
    for (const side of [-1, 1]) {
      cube(room, side * roomWidth / 2, roomHeight / 2, roomDepth / 2, 0.24, roomHeight, roomDepth + 1.2, wallMaterial);
      for (let z = 1; z < roomDepth; z += 1.65) {
        cube(room, side * (roomWidth / 2 - 0.15), roomHeight * 0.46, z, 0.18, roomHeight * 0.73, 1.45, panelMaterial);
        cube(room, side * (roomWidth / 2 - 0.255), roomHeight * 0.46, z + 0.7, 0.02, roomHeight * 0.73, 0.025, revealMaterial);
      }
      cube(room, side * (roomWidth / 2 - 0.27), roomHeight * 0.88, roomDepth / 2, 0.025, 0.025, roomDepth, glowMaterial);
      cube(room, side * (roomWidth / 2 - 0.27), 0.16, roomDepth / 2, 0.025, 0.035, roomDepth, glowMaterial);
      for (let z = 2.5; z < roomDepth; z += 4.5) {
        cube(room, side * (roomWidth / 2 - 0.27), roomHeight * 0.42, z, 0.16, 1.35, 0.22, edgeMaterial);
        cube(room, side * (roomWidth / 2 - 0.37), roomHeight * 0.42, z, 0.03, 1.1, 0.08, ceilingLightMaterial);
      }
      cube(ceiling, side * (roomWidth * 0.38), roomHeight - 0.12, roomDepth / 2, 0.075, 0.025, roomDepth - 0.8, ceilingLightMaterial);
      for (let z = 3; z < roomDepth; z += 6) {
        const warm = new THREE.PointLight('#ff7a3d', 10, 7, 2);
        warm.position.set(side * (roomWidth / 2 - 0.7), 1.5, z);
        scene.add(warm);
      }
    }
    cube(backWall, 0, roomHeight / 2, roomDepth + 0.3, roomWidth, roomHeight, 0.24, panelMaterial);
    for (let x = -roomWidth / 2 + 0.9; x < roomWidth / 2; x += 1.6) cube(backWall, x, roomHeight * 0.55, roomDepth + 0.13, 1.4, roomHeight * 0.68, 0.18, wallMaterial);
    cube(backWall, 0, roomHeight * 0.88, roomDepth, roomWidth - 0.5, 0.025, 0.025, glowMaterial);
    cube(backWall, 0, maxSeatY + 0.2, roomDepth, roomWidth - 0.5, 0.025, 0.025, glowMaterial);
    cube(backWall, 0, roomHeight * 0.74, roomDepth - 0.01, 2.3, 0.8, 0.12, edgeMaterial);
    cube(ceiling, 0, roomHeight + 0.06, roomDepth / 2, roomWidth, 0.16, roomDepth + 0.8, wallMaterial);
    for (let z = 2; z < roomDepth; z += 3) cube(ceiling, 0, roomHeight - 0.15, z, roomWidth, 0.16, 0.28, revealMaterial);
    cube(stage, 0, roomHeight / 2, -0.7, roomWidth, roomHeight, 0.2, revealMaterial);
    cube(stage, 0, -0.05, 0.55, roomWidth, 0.12, 1.8, edgeMaterial);
    cube(stage, 0, 0.025, 1.35, roomWidth - 0.6, 0.02, 0.035, glowMaterial);
    const platformWidth = roomWidth - 0.3;
    cube(scene, 0, -0.2, roomDepth / 2, roomWidth, 0.35, roomDepth + 1, floorMaterial);
    const rows = [...new Set(hall.seats.map((s) => s.row))].sort((a, b) => a - b);
    for (const row of rows) {
      const seats = hall.seats.filter((s) => s.row === row);
      const z = Math.min(...seats.map((s) => s.position.z));
      const y = Math.min(...seats.map((s) => s.position.y));
      // Platforms are generated from seat elevations, never from an independent seating grid.
      const back = roomDepth + 0.15;
      cube(scene, 0, y / 2 - 0.06, (z - 0.55 + back) / 2, platformWidth, y + 0.12, back - z + 0.55, floorMaterial);
      const minX = Math.min(...seats.map(s => s.position.x - s.width / 2));
      const maxX = Math.max(...seats.map(s => s.position.x + s.width / 2));
      for (const side of [-1, 1]) {
        const aisleX = side < 0 ? minX - 0.4 : maxX + 0.4;
        cube(scene, aisleX, y + 0.025, z - 0.36, Math.max(0.3, roomWidth / 2 - Math.abs(aisleX) - 0.4), 0.025, 0.035, glowMaterial);
        cube(scene, aisleX, y + 0.025, z + 0.05, 0.025, 0.025, 0.8, glowMaterial);
      }
      // Illuminate actual aisles derived from geometry, including a central aisle where present.
      const sorted = [...seats].sort((a, b) => a.position.x - b.position.x);
      for (let index = 1; index < sorted.length; index++) {
        const previous = sorted[index - 1]; const next = sorted[index];
        const gap = next.position.x - previous.position.x - (next.width + previous.width) / 2;
        if (gap > 0.72) {
          const center = (previous.position.x + next.position.x) / 2;
          cube(scene, center, y + 0.027, z - 0.37, Math.min(gap - 0.1, 1.7), 0.025, 0.035, glowMaterial);
          for (const side of [-1, 1]) cube(scene, center + side * (gap / 2 - 0.05), y + 0.028, z + 0.1, 0.035, 0.025, 1.15, glowMaterial);
        }
      }
    }

    const chairMaterial = new THREE.MeshPhysicalMaterial({ color: 'white', roughness: 0.87, metalness: 0, sheen: 0.45, sheenColor: '#b9afa1', sheenRoughness: 0.85, bumpMap: fabricTexture, bumpScale: 0.009 });
    const chairTrimMaterial = new THREE.MeshStandardMaterial({ color: '#141a22', roughness: 0.42, metalness: 0.55 });
    const chairMeshes: THREE.InstancedMesh[] = [];
    const chairParts = [
      { dimensions: [0.84, 0.62, 0.16], position: [0, 0.76, 0.24], radius: 0.12, material: chairMaterial, curvedBack: true },
      { dimensions: [0.84, 0.2, 0.7], position: [0, 0.47, -0.06], radius: 0.085, material: chairMaterial },
      { dimensions: [0.14, 0.15, 0.75], position: [-0.47, 0.67, -0.04], radius: 0.06, material: chairMaterial },
      { dimensions: [0.14, 0.15, 0.75], position: [0.47, 0.67, -0.04], radius: 0.06, material: chairMaterial },
      { dimensions: [0.66, 0.32, 0.5], position: [0, 0.24, 0.02], radius: 0.045, material: chairTrimMaterial },
    ];
    for (const part of chairParts) {
      const geometry = 'curvedBack' in part ? makeChairBack(part.dimensions[0], part.dimensions[1], part.dimensions[2]) : new RoundedBoxGeometry(part.dimensions[0], part.dimensions[1], part.dimensions[2], 3, part.radius);
      geometry.translate(part.position[0], part.position[1], part.position[2]);
      const mesh = new THREE.InstancedMesh(geometry, part.material, hall.seats.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      chairMeshes.push(mesh);
      scene.add(mesh);
    }
    for (const side of [-1, 1]) {
      const geometry = new THREE.CylinderGeometry(0.046, 0.037, 0.009, 12);
      geometry.translate(side * 0.47, 0.749, -0.21);
      const mesh = new THREE.InstancedMesh(geometry, chairTrimMaterial, hall.seats.length);
      mesh.frustumCulled = false;
      chairMeshes.push(mesh);
      scene.add(mesh);
    }
    const headMaterial = new THREE.MeshStandardMaterial({ color: 'white', roughness: 0.96, transparent: true, opacity: 0.94 });
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 'white', roughness: 0.92 });
    const skinMaterial = new THREE.MeshStandardMaterial({ color: '#ab8064', roughness: 0.82 });
    const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.15, 16, 12), headMaterial, hall.seats.length);
    const bodies = new THREE.InstancedMesh(new RoundedBoxGeometry(0.46, 0.52, 0.29, 3, 0.13), bodyMaterial, hall.seats.length);
    const necks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.065, 0.08, 0.16, 10), skinMaterial, hall.seats.length);
    heads.frustumCulled = bodies.frustumCulled = false;
    necks.frustumCulled = false;
    scene.add(heads, bodies, necks);
    const hairColors = ['#4b3328', '#80796b', '#302b29', '#69442e'].map(color => new THREE.Color(color));
    const clothingColors = ['#465361', '#6a4436', '#373f48', '#736452'].map(color => new THREE.Color(color));

    const screenTexture = makeScreenTexture();
    const screenMaterial = new THREE.MeshBasicMaterial({ map: screenTexture, color: 'white', toneMapped: false });
    const screenAssembly = new THREE.Group();
    scene.add(screenAssembly);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(hall.screen.width, hall.screen.height), screenMaterial);
    screen.position.copy(screenCenter);
    screenAssembly.add(screen);
    cube(screenAssembly, screenCenter.x, screenCenter.y, screenCenter.z - 0.15, hall.screen.width + 0.45, hall.screen.height + 0.4, 0.22, edgeMaterial);
    cube(screenAssembly, screenCenter.x, screenCenter.y - hall.screen.height / 2 - 0.25, screenCenter.z - 0.05, hall.screen.width + 0.45, 0.015, 0.025, ceilingLightMaterial);
    for (const side of [-1, 1]) cube(screenAssembly, screenCenter.x + side * (hall.screen.width / 2 + 0.32), screenCenter.y, screenCenter.z - 0.18, 0.035, hall.screen.height + 0.55, 0.025, glowMaterial);
    cube(screenAssembly, screenCenter.x, screenCenter.y + hall.screen.height / 2 + 0.3, screenCenter.z - 0.18, hall.screen.width + 0.65, 0.035, 0.025, glowMaterial);

    const speakersMaterial = new THREE.MeshStandardMaterial({ color: '#0b0f15', roughness: 0.84, bumpMap: fabricTexture, bumpScale: 0.035 });
    for (const speaker of hall.speakers) {
      cube(scene, speaker.position.x, speaker.position.y, speaker.position.z, 0.6, 1.2, 0.5, speakersMaterial);
    }
    scene.add(new THREE.HemisphereLight('#d9dde2', '#201b17', 0.85));
    const keyLight = new THREE.DirectionalLight('#ffdec0', 1.8);
    keyLight.position.set(-roomWidth * 0.22, roomHeight + 5, roomDepth * 0.5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    Object.assign(keyLight.shadow.camera, { left: -roomWidth, right: roomWidth, top: roomDepth, bottom: -roomDepth, near: 0.1, far: roomDepth * 3 });
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.03;
    keyLight.target.position.set(0, 0, roomDepth * 0.5);
    scene.add(keyLight, keyLight.target);
    RectAreaLightUniformsLib.init();
    const screenLight = new THREE.RectAreaLight('#d7e4f5', 3, hall.screen.width, hall.screen.height);
    screenLight.position.set(screenCenter.x, screenCenter.y, screenCenter.z + 0.15);
    screenLight.lookAt(screenCenter.x, screenCenter.y, screenCenter.z + 5);
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
      if (propsRef.current.interactive && propsRef.current.view !== 'top') return 1;
      const minimumAspect = propsRef.current.view === 'top' ? 1.5 : 0.95;
      return Math.max(1, minimumAspect / aspect);
    }

    function videoChanged() {
      const usePoster = posterTexture && (!video || (video.paused && video.currentTime < 0.05));
      if (video && video.readyState >= 2 || usePoster) {
        screenMaterial.map = usePoster ? posterTexture : videoTexture;
        const sourceAspect = (usePoster ? posterAspect : video ? video.videoWidth / video.videoHeight : 0) || propsRef.current.videoAspect || hall.screen.width / hall.screen.height;
        const aspect = hall.screen.width / hall.screen.height;
        screen.scale.set(1, 1, 1);
        const map = screenMaterial.map;
        if (map) {
          // Cover the physical screen, retaining proportions and cropping only outside edges.
          map.repeat.set(Math.min(1, aspect / sourceAspect), Math.min(1, sourceAspect / aspect));
          map.offset.set((1 - map.repeat.x) / 2, (1 - map.repeat.y) / 2);
        }
      } else {
        screenMaterial.map = screenTexture;
        screen.scale.set(1, 1, 1);
      }
      screenMaterial.needsUpdate = true;
      if (import.meta.env.DEV) {
        renderer.domElement.dataset.screenSource = usePoster ? 'poster' : screenMaterial.map === videoTexture ? 'video' : 'ident';
        renderer.domElement.dataset.posterReady = posterTexture ? String(posterAspect) : 'no';
      }
      invalidate();
    }
    function syncVideo() {
      if (propsRef.current.videoPoster !== posterUrl) {
        posterUrl = propsRef.current.videoPoster;
        const revision = ++posterRevision;
        posterTexture?.dispose(); posterTexture = null;
        if (posterUrl) new THREE.TextureLoader().load(posterUrl, texture => {
          if (disposed || revision !== posterRevision) { texture.dispose(); return; }
          texture.colorSpace = THREE.SRGBColorSpace;
          posterTexture = texture;
          const image = texture.image as HTMLImageElement;
          posterAspect = image.width / image.height;
          videoChanged();
        }, undefined, () => { /* The locally drawn ident remains available. */ });
      }
      const next = propsRef.current.videoElement;
      if (next === video) { videoChanged(); return; }
      for (const event of ['loadeddata', 'loadedmetadata', 'play', 'pause', 'seeked', 'ended']) video?.removeEventListener(event, videoChanged);
      videoTexture?.dispose();
      video = next;
      videoTexture = video ? new THREE.VideoTexture(video) : null;
      if (videoTexture) { videoTexture.colorSpace = THREE.SRGBColorSpace; videoTexture.minFilter = THREE.LinearFilter; videoTexture.magFilter = THREE.LinearFilter; }
      for (const event of ['loadeddata', 'loadedmetadata', 'play', 'pause', 'seeked', 'ended']) video?.addEventListener(event, videoChanged);
      videoChanged();
    }

    function updateTarget() {
      const current = propsRef.current;
      isOverview = current.overview || !current.seat;
      interactiveMode = isOverview && current.interactive;
      lookMode = !isOverview && current.lookAround;
      controls.enabled = interactiveMode && !current.paused;
      renderer.domElement.tabIndex = lookMode ? 0 : -1;
      if (lookMode) {
        renderer.domElement.removeAttribute('aria-hidden');
        renderer.domElement.setAttribute('aria-label', 'Осмотр зала: перетаскивайте или нажимайте стрелки. Home возвращает взгляд на экран.');
      } else renderer.domElement.setAttribute('aria-hidden', 'true');
      renderer.domElement.style.touchAction = interactiveMode || lookMode ? 'none' : 'pan-y';
      renderer.domElement.style.cursor = interactiveMode || lookMode ? 'grab' : '';
      const overviewFov = current.view === 'top' ? 45 : current.view === 'sofas' ? 55 : current.view === 'back' ? 64 : 62;
      camera.fov = isOverview ? overviewFov : hall.camera.fov_degrees;
      if (interactiveMode && current.view !== 'top') camera.fov = Math.min(105, 2 * Math.atan(Math.tan(overviewFov * Math.PI / 360) * Math.max(1, 1.5 / camera.aspect)) * 180 / Math.PI);
      camera.updateProjectionMatrix();
      room.visible = !isOverview || current.view !== 'top';
      backWall.visible = !isOverview;
      ceiling.visible = !isOverview;
      stage.visible = !(interactiveMode && current.view === 'front');
      volume.visible = false;
      screenAssembly.visible = !(interactiveMode && current.view === 'front');
      const nextLookKey = (current.seat?.id ?? '') + ':' + current.resetViewKey;
      if (nextLookKey !== lookKey) { headYaw = headPitch = 0; lookKey = nextLookKey; }
      const nextPresetKey = String(isOverview) + ':' + String(interactiveMode) + ':' + current.view;
      // A selection or a fresh availability response must not undo the user's orbit/zoom.
      if (interactiveMode && initialized && nextPresetKey === presetKey) return;
      presetKey = nextPresetKey;
      if (isOverview) {
        const scale = framingScale(camera.aspect);
        const angle = Math.sin(orbitTime * 0.09) * 0.055;
        targetPosition.set(Math.sin(angle) * roomWidth * 0.4, maxSeatY + roomWidth * 0.24, maxSeatZ + roomDepth * 0.2);
        targetLookAt.copy(overviewCenter);
        if (interactiveMode) {
          const isTop = current.view === 'top';
          const azimuthCenter = current.view === 'front' || current.view === 'sofas' ? Math.PI : 0;
          controls.minAzimuthAngle = isTop ? -Infinity : azimuthCenter - 0.78;
          controls.maxAzimuthAngle = isTop ? Infinity : azimuthCenter + 0.78;
          controls.minPolarAngle = isTop ? 0.01 : 0.32;
          controls.maxPolarAngle = isTop ? 0.28 : Math.PI / 2 - 0.12;
          controls.minDistance = isTop ? Math.max(roomWidth, roomDepth) * 0.7 : roomWidth * 0.23;
          controls.maxDistance = Math.max(roomWidth, roomDepth) * (isTop ? 1.8 : 1.3);
          if (current.view === 'front') {
            targetLookAt.set(0, maxSeatY * 0.55, roomDepth * 0.7);
            targetPosition.set(0, maxSeatY + roomWidth * 0.22, 0.5);
          }
          if (current.view === 'back') targetPosition.set(0, maxSeatY + roomWidth * 0.13, maxSeatZ + roomDepth * 0.14);
          if (current.view === 'sofas') {
            targetLookAt.set(0, maxSeatY + 0.55, maxSeatZ - 0.35);
            targetPosition.set(0, maxSeatY + 5, Math.max(1.4, maxSeatZ - roomWidth * 0.56));
          }
          if (current.view === 'top') {
            targetLookAt.set(0, maxSeatY * 0.5, (minSeatZ + maxSeatZ) / 2);
            const height = maxSeatY + Math.max(roomWidth / 1.5, maxSeatZ - minSeatZ + 3) / (2 * Math.tan(Math.PI / 8)) * 1.07;
            targetPosition.set(0, height, targetLookAt.z + 0.02);
          }
          targetPosition.sub(targetLookAt).multiplyScalar(scale).add(targetLookAt);
          camera.position.copy(targetPosition);
          controls.target.copy(targetLookAt);
          controls.enableDamping = false;
          controls.update();
          controls.enableDamping = !reduced.matches;
          constrainCamera();
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
          const fabricColor = currentSeat.type === 'sofa' || (currentSeat.row + Math.floor((currentSeat.number - 1) / 3)) % 4 === 0 ? TERRACOTTA : UPHOLSTERY;
          mesh.setColorAt(index, isSelected ? ACCENT : hoveredId === currentSeat.id ? HOVER : statuses.get(currentSeat.id) === 'sold' ? OCCUPIED : fabricColor);
        }
        const occupied = current.audience && statuses.get(currentSeat.id) === 'sold' && !hideOwnSeat;
        matrixObject.scale.set(1, 1.12, 1);
        matrixObject.position.set(currentSeat.position.x, currentSeat.position.y + hall.camera.eye_height + 0.1, currentSeat.position.z - 0.03);
        matrixObject.updateMatrix();
        heads.setMatrixAt(index, occupied ? matrixObject.matrix : hiddenMatrix);
        heads.setColorAt(index, hairColors[(currentSeat.number + currentSeat.row) % hairColors.length]);
        matrixObject.scale.set(1, 1, 1);
        matrixObject.position.y = currentSeat.position.y + 0.88;
        matrixObject.updateMatrix();
        bodies.setMatrixAt(index, occupied ? matrixObject.matrix : hiddenMatrix);
        bodies.setColorAt(index, clothingColors[(currentSeat.number * 3 + currentSeat.row) % clothingColors.length]);
        matrixObject.position.y = currentSeat.position.y + 1.09;
        matrixObject.updateMatrix();
        necks.setMatrixAt(index, occupied ? matrixObject.matrix : hiddenMatrix);
      });
      for (const mesh of chairMeshes) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
      heads.instanceMatrix.needsUpdate = bodies.instanceMatrix.needsUpdate = true;
      necks.instanceMatrix.needsUpdate = true;
      if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
      if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
      renderer.shadowMap.needsUpdate = true;
      selectionRing.visible = !!highlight && isOverview;
      accentLight.intensity = highlight ? 4.5 : 0;
      if (highlight) {
        selectionRing.position.set(highlight.position.x, highlight.position.y + 0.028, highlight.position.z);
        accentLight.position.set(highlight.position.x, highlight.position.y + 1.8, highlight.position.z - 0.3);
      }
    }

    function canRender() {
      // Chrome's intersection observer can treat a native dialog's top-layer children as clipped.
      return visible || (!isOverview && !!host!.closest('dialog[open]'));
    }
    function constrainCamera() {
      if (!interactiveMode || propsRef.current.view === 'top') return;
      camera.position.x = THREE.MathUtils.clamp(camera.position.x, -roomWidth / 2 + 0.65, roomWidth / 2 - 0.65);
      camera.position.y = THREE.MathUtils.clamp(camera.position.y, maxSeatY + 1.65, roomHeight - 0.4);
      camera.position.z = THREE.MathUtils.clamp(camera.position.z, 1.0, roomDepth - 0.4);
      camera.lookAt(controls.target);
    }
    function renderFrame(timestamp: number) {
      if (disposed || contextLost || (renderedFrames > 0 && (!canRender() || document.hidden))) {
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
        constrainCamera();
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
      if (!interactiveMode) {
        camera.lookAt(currentLookAt);
        if (lookMode) {
          force.copy(currentLookAt).sub(camera.position).normalize();
          const pitch = THREE.MathUtils.clamp(Math.asin(force.y) + headPitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
          headEuler.set(pitch, Math.atan2(-force.x, -force.z) + headYaw, 0, 'YXZ');
          camera.quaternion.setFromEuler(headEuler);
        }
      }
      // A ceiling is visible from inside; it opens naturally when the orbit rises above it.
      ceiling.visible = !isOverview || (propsRef.current.view !== 'top' && camera.position.y < roomHeight - 0.3);
      backWall.visible = !isOverview || (propsRef.current.view !== 'top' && camera.position.z < roomDepth - 0.4);
      renderer.render(scene, camera);
      renderedFrames++;
      if (import.meta.env.DEV) {
        renderer.domElement.dataset.cameraPosition = camera.position.toArray().map(value => value.toFixed(3)).join(',');
        renderer.domElement.dataset.cameraDirection = camera.getWorldDirection(force).toArray().map(value => value.toFixed(3)).join(',');
        renderer.domElement.dataset.cameraMode = isOverview ? propsRef.current.view : 'seated';
        renderer.domElement.dataset.renderCount = String(renderedFrames);
      }
      const playingVideo = video && !video.paused && !video.ended && video.readyState >= 2 && !propsRef.current.paused;
      if (interactiveMode) {
        if (!controlsChanged && !playingVideo) renderer.setAnimationLoop(null);
        return;
      }
      const settled = camera.position.distanceToSquared(targetPosition) < 0.00001 && velocity.lengthSq() < 0.0001 && currentLookAt.distanceToSquared(targetLookAt) < 0.00001;
      if (!movingOverview && !playingVideo && (settled || reduced.matches)) renderer.setAnimationLoop(null);
    }

    function invalidate() {
      if (disposed || contextLost || !canRender() || document.hidden) return;
      previousTime = 0;
      renderer.setAnimationLoop(renderFrame);
    }
    function sync() {
      updateTarget();
      updateSeats();
      syncVideo();
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
      if ((!interactiveMode && !lookMode) || propsRef.current.paused) return;
      activePointers.add(event.pointerId);
      if (activePointers.size > 1) {
        if (pointerDown) pointerDown.dragged = true;
        return;
      }
      if (event.button !== 0) return;
      pointerDown = { x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, id: event.pointerId, dragged: false };
      if (lookMode) renderer.domElement.setPointerCapture(event.pointerId);
      renderer.domElement.style.cursor = 'grabbing';
    }
    function setHover(picked?: Seat, event?: PointerEvent) {
      if ((picked?.id ?? null) !== hoveredId) {
        hoveredId = picked?.id ?? null;
        propsRef.current.onHoverSeat?.(picked ?? null);
        updateSeats(); invalidate();
      }
      const label = hoverLabelRef.current;
      if (!label) return;
      label.hidden = !picked || !event;
      if (picked && event) {
        const bounds = host!.getBoundingClientRect();
        const status = propsRef.current.availability?.seats.find(s => s.seat_id === picked.id);
        label.textContent = 'Ряд ' + picked.row + ' · ' + (picked.type === 'sofa' ? 'диван ' : 'место ') + picked.number + (status?.status === 'sold' ? ' · занято' : status?.status === 'held' ? ' · бронь' : '');
        label.style.left = Math.max(12, Math.min(bounds.width - 210, event.clientX - bounds.left + 15)) + 'px';
        label.style.top = Math.max(12, event.clientY - bounds.top - 42) + 'px';
      }
    }
    function onPointerMove(event: PointerEvent) {
      if ((!interactiveMode && !lookMode) || propsRef.current.paused) return;
      if (pointerDown) {
        if (Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 6) pointerDown.dragged = true;
        if (lookMode && pointerDown.id === event.pointerId) {
          headYaw = THREE.MathUtils.clamp(headYaw + (event.clientX - pointerDown.lastX) * 0.004, -Math.PI * 0.56, Math.PI * 0.56);
          headPitch = THREE.MathUtils.clamp(headPitch + (event.clientY - pointerDown.lastY) * 0.0035, -Math.PI * 0.34, Math.PI * 0.34);
          pointerDown.lastX = event.clientX; pointerDown.lastY = event.clientY;
          invalidate();
        }
        renderer.domElement.style.cursor = 'grabbing';
        setHover();
      } else if (interactiveMode) {
        const picked = hitSeat(event);
        renderer.domElement.style.cursor = picked ? 'pointer' : 'grab';
        setHover(picked, event);
      }
    }
    function onPointerUp(event: PointerEvent) {
      activePointers.delete(event.pointerId);
      if ((!interactiveMode && !lookMode) || !pointerDown || event.pointerId !== pointerDown.id) return;
      const isClick = !pointerDown.dragged && Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) <= 6;
      pointerDown = null;
      renderer.domElement.style.cursor = 'grab';
      if (lookMode && renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
      if (isClick && interactiveMode) {
        const picked = hitSeat(event);
        if (picked) propsRef.current.onSeatSelect?.(picked);
      }
    }
    function onPointerCancel(event: PointerEvent) {
      activePointers.delete(event.pointerId);
      pointerDown = null;
      renderer.domElement.style.cursor = interactiveMode || lookMode ? 'grab' : '';
    }
    function resetLook() { if (lookMode) { headYaw = headPitch = 0; invalidate(); } }
    function leavePointer() { setHover(); }
    function onLookKey(event: KeyboardEvent) {
      if (!lookMode) return;
      const directions: Record<string, [number, number]> = { ArrowLeft: [0.09, 0], ArrowRight: [-0.09, 0], ArrowUp: [0, 0.07], ArrowDown: [0, -0.07] };
      if (event.key === 'Home') { event.preventDefault(); resetLook(); return; }
      const delta = directions[event.key];
      if (!delta) return;
      event.preventDefault();
      headYaw = THREE.MathUtils.clamp(headYaw + delta[0], -Math.PI * 0.56, Math.PI * 0.56);
      headPitch = THREE.MathUtils.clamp(headPitch + delta[1], -Math.PI * 0.34, Math.PI * 0.34);
      invalidate();
    }
    controls.addEventListener('change', invalidate);
    controls.addEventListener('start', invalidate);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerCancel);
    renderer.domElement.addEventListener('pointerleave', leavePointer);
    renderer.domElement.addEventListener('dblclick', resetLook);
    renderer.domElement.addEventListener('keydown', onLookKey);
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
      if (canRender()) invalidate();
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
    // A static first frame also exists before the native dialog is promoted to the top layer.
    renderFrame(performance.now());

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
      renderer.domElement.removeEventListener('pointerleave', leavePointer);
      renderer.domElement.removeEventListener('dblclick', resetLook);
      renderer.domElement.removeEventListener('keydown', onLookKey);
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      for (const event of ['loadeddata', 'loadedmetadata', 'play', 'pause', 'seeked', 'ended']) video?.removeEventListener(event, videoChanged);
      videoTexture?.dispose();
      posterTexture?.dispose();
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
      fabricTexture?.dispose();
      keyLight.shadow.map?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [hall]);

  useEffect(() => { syncRef.current?.(); }, [seat, availability, overview, paused, interactive, view, videoElement, videoPoster, videoAspect, audience, lookAround, resetViewKey]);

  return (
    <div className={'cinema-scene ' + className} data-interactive={interactive || undefined} role={interactive || (!overview && lookAround) ? 'group' : 'img'} aria-label={interactive ? 'Интерактивный 3D-зал: нажмите на кресло для выбора, перетаскивайте для вращения. Для выбора с клавиатуры используйте схему 2D.' : overview || !seat ? 'Объёмная модель кинозала с подсвеченным выбранным креслом' : 'Вид на экран: ряд ' + seat.row + ', ' + (seat.type === 'sofa' ? 'диван ' : 'место ') + seat.number}>
      <div className="cinema-scene__canvas" ref={hostRef} />
      <div className="cinema-scene__seat-tooltip" ref={hoverLabelRef} hidden aria-hidden="true" />
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

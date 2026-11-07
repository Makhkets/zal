import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Hall, Seat } from './types';

export type SeatFamily = 'standard' | 'premium' | 'sofa';
export const seatFamily = (seat: Seat): SeatFamily => seat.type === 'sofa' ? 'sofa' : seat.zone === 'front' ? 'standard' : 'premium';
export const upholstery = {
  standard: new THREE.Color('#363c43'),
  premium: new THREE.Color('#35312e'),
  sofa: new THREE.Color('#865636'),
};

/** Small deterministic grain; no downloaded maps or per-frame texture work. */
export function makeLeatherTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const pixels = ctx.createImageData(256, 256);
  let seed = 41;
  for (let i = 0; i < pixels.data.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const value = 155 + (seed >>> 26);
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
    pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  return texture;
}

/** Instance only actual members of each category, retaining the Hall ID for picking. */
export function addLuxurySeating(scene: THREE.Scene, hall: Hall, leather: THREE.Texture | null, fabric: THREE.Texture | null) {
  const meshes: THREE.InstancedMesh[] = [];
  const woven = new THREE.MeshPhysicalMaterial({ color: 'white', roughness: 0.88, sheen: 0.32, sheenRoughness: 0.9, bumpMap: fabric, bumpScale: 0.007 });
  const hide = new THREE.MeshPhysicalMaterial({ color: 'white', roughness: 0.43, clearcoat: 0.13, clearcoatRoughness: 0.5, bumpMap: leather, bumpScale: 0.0035, envMapIntensity: 0.45 });
  const shell = new THREE.MeshStandardMaterial({ color: '#181a1d', roughness: 0.5, metalness: 0.18 });
  const metal = new THREE.MeshStandardMaterial({ color: '#b6a58d', roughness: 0.27, metalness: 0.9 });
  const recess = new THREE.MeshStandardMaterial({ color: '#08090a', roughness: 0.75 });
  const thread = new THREE.MeshStandardMaterial({ color: '#9c8067', roughness: 0.9 });
  for (const family of ['standard', 'premium', 'sofa'] as const) {
    const seats = hall.seats.filter(seat => seatFamily(seat) === family);
    if (!seats.length) continue;
    const seatSlots = new Map(seats.map((seat, index) => [seat.id, index]));
    const material = family === 'standard' ? woven : hide;
    const add = (geometry: THREE.BufferGeometry, mat: THREE.Material = material, tint = 1, shadow = false) => {
      const mesh = new THREE.InstancedMesh(geometry, mat, seats.length);
      mesh.userData = { seats, seatSlots, tint, upholstery: mat === material };
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      scene.add(mesh); meshes.push(mesh);
    };
    const cushion = (w: number, h: number, d: number, x: number, y: number, z: number, radius: number, mat: THREE.Material = material, tint = 1, angle = 0, shadow = false) => {
      const geo = new RoundedBoxGeometry(w, h, d, 2, radius);
      geo.rotateX(angle); geo.translate(x, y, z); add(geo, mat, tint, shadow);
    };
    // Seat envelopes stay within the existing map footprint and below seated eye height.
    cushion(0.78, 0.25, 0.6, 0, 0.23, 0.05, 0.035, shell, 1, 0, true);
    if (family === 'standard') {
      cushion(0.84, 0.72, 0.19, 0, 0.74, 0.24, 0.085, material, 0.9, -0.09, true);
      cushion(0.7, 0.44, 0.14, 0, 0.76, 0.12, 0.065, material, 1.08, -0.09);
      cushion(0.66, 0.18, 0.16, 0, 1, 0.16, 0.07, material, 1.06);
      cushion(0.8, 0.22, 0.65, 0, 0.47, -0.075, 0.085);
      for (const side of [-1, 1]) cushion(0.12, 0.15, 0.68, side * 0.46, 0.64, -0.03, 0.045, shell);
    } else if (family === 'premium') {
      cushion(0.94, 0.71, 0.25, 0, 0.75, 0.23, 0.1, material, 0.84, -0.12, true);
      cushion(0.59, 0.36, 0.18, 0, 0.78, 0.085, 0.08, material, 1.06, -0.12);
      cushion(0.66, 0.17, 0.22, 0, 0.58, 0.03, 0.07, material, 0.98);
      cushion(0.7, 0.2, 0.22, 0, 1.01, 0.16, 0.085, material, 1.13, -0.1);
      cushion(0.81, 0.24, 0.7, 0, 0.46, -0.1, 0.095, material, 1.08);
      // Folded leg support, broad consoles and rounded shoulder bolsters.
      cushion(0.78, 0.25, 0.15, 0, 0.29, -0.39, 0.05, material, 0.88, -0.18);
      for (const side of [-1, 1]) {
        cushion(0.14, 0.43, 0.2, side * 0.365, 0.79, 0.075, 0.055, material, 0.96, -0.12);
        cushion(0.2, 0.37, 0.8, side * 0.445, 0.47, -0.015, 0.055, material, 0.82);
        cushion(0.2, 0.12, 0.8, side * 0.445, 0.69, -0.015, 0.045, material, 1.06);
      }
    } else {
      cushion(0.94, 0.61, 0.24, 0, 0.73, 0.25, 0.065, material, 0.86, -0.1, true);
      for (const side of [-1, 1]) {
        cushion(0.402, 0.4, 0.18, side * 0.213, 0.77, 0.1, 0.06, material, 1.06, -0.1);
        cushion(0.39, 0.19, 0.21, side * 0.213, 1, 0.17, 0.06, material, 1.12);
        cushion(0.4, 0.24, 0.7, side * 0.213, 0.47, -0.075, 0.07, material, 1.05);
        cushion(0.39, 0.22, 0.13, side * 0.213, 0.29, -0.39, 0.04, material, 0.9, -0.15);
        cushion(0.115, 0.37, 0.81, side * 0.465, 0.49, -0.01, 0.035, material, 0.88);
        cushion(0.115, 0.1, 0.81, side * 0.465, 0.72, -0.01, 0.03, material, 1.1);
      }
    }
    if (family !== 'standard') {
      // Subtle stitched seam across the rear shell, visible from the overview.
      const points = [new THREE.Vector3(-0.37, 0.99, 0.37), new THREE.Vector3(0, 1.015, 0.37), new THREE.Vector3(0.37, 0.99, 0.37)];
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 12, 0.003, 4, false), thread);
      for (const side of [-1, 1]) {
        // Sofas are stretched in X only: compensate so the metal rim remains round.
        const ratio = family === 'sofa' ? 0.5 : 1;
        const x = side * (family === 'sofa' ? 0.465 : 0.445);
        const y = family === 'sofa' ? 0.778 : 0.756;
        const rim = new THREE.TorusGeometry(0.061, 0.009, 6, 20);
        rim.rotateX(Math.PI / 2); rim.scale(ratio, 1, 1); rim.translate(x, y, -0.24); add(rim, metal);
        const well = new THREE.CylinderGeometry(0.051, 0.043, 0.024, 16);
        well.scale(ratio, 1, 1); well.translate(x, y - 0.015, -0.24); add(well, recess);
        cushion(0.035 * ratio, 0.008, 0.06, x, y - 0.005, -0.07, 0.002, metal);
      }
    }
  }
  return meshes;
}

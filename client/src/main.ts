import * as THREE from 'three';
import { GAME_TITLE } from '@sp/shared';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6ec6ff);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
camera.position.set(0, 3, 6);
camera.lookAt(0, 1, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x4060a0, 2));
const ball = new THREE.Mesh(
  new THREE.SphereGeometry(1, 48, 32),
  new THREE.MeshStandardMaterial({ color: 0xff5a8a, roughness: 0.3 }),
);
ball.position.y = 1;
scene.add(ball);
document.title = GAME_TITLE;

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
renderer.setAnimationLoop((t) => {
  ball.position.y = 1 + Math.abs(Math.sin(t / 400));
  renderer.render(scene, camera);
});

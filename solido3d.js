// =====================================================================
//  solido3d.js — el sólido de revolución en 3D, interactivo
// =====================================================================
//  Lee el número del problema de la dirección (solido.html?p=23), toma
//  sus datos de datos.js (los escribe generar.py con el mismo motor que
//  dibuja las figuras del libro) y rehace el sólido a partir de las
//  fórmulas: las piezas del borde de la región giran alrededor del eje,
//  y las dos caras del corte son la región misma.
//
//  Arrastrar gira, la rueda acerca y el botón derecho desplaza.
// =====================================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const DATOS = window.PROBLEMAS || {};
const claves = Object.keys(DATOS).sort((a, b) => Number(a) - Number(b));
//  El problema va en la dirección: solido.html#23 (o ?p=23).
function claveDeDireccion() {
  const h = location.hash.match(/^#p?(\d+)$/);
  if (h && DATOS[h[1]]) return h[1];
  const q = new URLSearchParams(location.search).get('p');
  if (q && DATOS[q]) return q;
  return claves[0];
}
const clave = claveDeDireccion();
window.addEventListener('hashchange', () => location.reload());
const D = DATOS[clave];

// ---- el texto de la página ---------------------------------------------
async function conFormulas(elemento, texto) {
  elemento.textContent = texto;
  const mj = window.MathJax;
  if (mj && mj.startup && mj.startup.promise) {
    try { await mj.startup.promise; await mj.typesetPromise([elemento]); } catch (e) { }
  }
}
document.getElementById('titulo').textContent = 'Problema ' + clave;
document.title = 'Problema ' + clave + ' · Sólido de revolución';
conFormulas(document.getElementById('enunciado'), D.enunciado || '');

const idx = claves.indexOf(clave);
const ant = document.getElementById('anterior');
const sig = document.getElementById('siguiente');
if (idx > 0) ant.href = '#' + claves[idx - 1]; else ant.classList.add('inactivo');
if (idx < claves.length - 1) sig.href = '#' + claves[idx + 1]; else sig.classList.add('inactivo');

// ---- las fórmulas ------------------------------------------------------
//  La raíz no revienta en el borde: sqrt(-1e-16) por redondeo daba NaN.
const raiz = t => Math.sqrt(Math.max(t, 0));
const funcion = s => {
  const f = new Function('uu', 'raiz', '"use strict"; return (' +
                         s.replaceAll('Math.sqrt(', 'raiz(') + ');');
  return u => f(u, raiz);
};
const piezas = D.piezas.map(p => ({ ...p, fx: funcion(p.X), fy: funcion(p.Y) }));
const trozos = D.trozos.map(t => ({ ...t, flo: funcion(t.lo), fhi: funcion(t.hi) }));

//  El punto (X, Y) de la región girado un ángulo: la misma cuenta que en
//  giro3d.py. d es la distancia al eje, positiva en la región.
function giro(X, Y, ang, escala = 1) {
  const d = escala * D.s * ((D.horizontal ? Y : X) - D.k);
  if (D.horizontal) return [X, D.k + d * Math.cos(ang), d * Math.sin(ang)];
  return [D.k + d * Math.cos(ang), Y, d * Math.sin(ang)];
}
const coseno = (a, b, i, n) => a + (b - a) * (1 - Math.cos(Math.PI * i / n)) / 2;

// ---- la escena ---------------------------------------------------------
const lienzo = document.getElementById('lienzo');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setClearColor(0xffffff, 1);
lienzo.appendChild(renderer.domElement);
const rotulos = new CSS2DRenderer();
rotulos.domElement.className = 'rotulos';
lienzo.appendChild(rotulos.domElement);

const scene = new THREE.Scene();
const tam = D.tam;
const camera = new THREE.PerspectiveCamera(30, 1, tam * 0.01, tam * 200);
camera.up.set(0, 0, 1);
camera.position.set(...D.camara);
scene.add(camera);
scene.add(new THREE.AmbientLight(0xffffff, 0.62));
const foco = new THREE.DirectionalLight(0xffffff, 0.95);
foco.position.set(0.6, 0.8, 1.0);
camera.add(foco);          // la luz sigue al que mira

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(...D.centro);
controls.enableDamping = true;
controls.update();

// ---- el sólido ---------------------------------------------------------
const matSolido = new THREE.MeshPhongMaterial({
  color: D.colores.solido, side: THREE.DoubleSide, shininess: 40,
  polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
const matCorte = new THREE.MeshPhongMaterial({
  color: D.colores.corte, side: THREE.DoubleSide, shininess: 10,
  polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
const matMalla = new THREE.LineBasicMaterial({
  color: D.colores.malla, transparent: true, opacity: 0.55 });

function malla(puntos, nu, nv, material) {
  const idx = [];
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j, b = a + nv + 1;
      idx.push(a, b, b + 1, a, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(puntos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, material);
}

function superficie(p, a0, a1) {
  const nu = p.tapa ? 8 : 64;
  const nv = Math.max(12, Math.round(128 * (a1 - a0) / (2 * Math.PI)));
  const pts = [];
  for (let i = 0; i <= nu; i++) {
    const u = coseno(p.u0, p.u1, i, nu), X = p.fx(u), Y = p.fy(u);
    for (let j = 0; j <= nv; j++) pts.push(...giro(X, Y, a0 + (a1 - a0) * j / nv));
  }
  return malla(pts, nu, nv, matSolido);
}

function cara(t, ang) {
  const nu = 48, nv = 10, pts = [];
  for (let i = 0; i <= nu; i++) {
    const U = coseno(t.a, t.b, i, nu), lo = t.flo(U), hi = t.fhi(U);
    for (let j = 0; j <= nv; j++) {
      const w = lo + (hi - lo) * j / nv;
      const [X, Y] = D.orden === 'dydx' ? [U, w] : [w, U];
      pts.push(...giro(X, Y, ang));
    }
  }
  return malla(pts, nu, nv, matCorte);
}

function linea(pts, material) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
  return new THREE.Line(g, material);
}

//  Un poco por fuera de la superficie, para que no se hunda en ella.
const FUERA = 1.004;

function lineasMalla(a0, a1) {
  const grupo = new THREE.Group();
  const paso = tam / 7.5;
  for (const p of piezas) {
    const us = Array.from({ length: 121 }, (_, i) => p.u0 + (p.u1 - p.u0) * i / 120);
    const XY = us.map(u => [p.fx(u), p.fy(u)]);
    if (!p.tapa) {
      //  Meridianos cada 30 grados.
      for (let g = 0; g < 12; g++) {
        const ang = g * Math.PI / 6;
        const dentro = (ang >= a0 - 1e-9 && ang <= a1 + 1e-9) ||
                       (ang + 2 * Math.PI >= a0 - 1e-9 && ang + 2 * Math.PI <= a1 + 1e-9);
        if (dentro) grupo.add(linea(XY.map(([X, Y]) => giro(X, Y, ang, FUERA)), matMalla));
      }
      //  Paralelos repartidos por la longitud del meridiano.
      let arco = [0];
      for (let i = 1; i < XY.length; i++)
        arco.push(arco[i - 1] + Math.hypot(XY[i][0] - XY[i - 1][0], XY[i][1] - XY[i - 1][1]));
      const total = arco[arco.length - 1], n = Math.floor(total / paso);
      for (let k = 1; k <= n; k++) {
        const obj = total * k / (n + 1);
        const i = arco.findIndex(v => v >= obj);
        const [X, Y] = XY[Math.max(i, 0)];
        const pts = [];
        for (let j = 0; j <= 96; j++) pts.push(giro(X, Y, a0 + (a1 - a0) * j / 96, FUERA));
        grupo.add(linea(pts, matMalla));
      }
    }
  }
  return grupo;
}

//  El borde de la región en las dos caras del corte, en el color de su
//  curva en la figura plana de la solución.
function bordesCorte() {
  const grupo = new THREE.Group();
  for (const p of piezas) {
    const mat = new THREE.LineBasicMaterial({ color: p.borde || D.colores.malla });
    const us = Array.from({ length: 121 }, (_, i) => p.u0 + (p.u1 - p.u0) * i / 120);
    for (const ang of [D.alfa, D.alfa + Math.PI / 2])
      grupo.add(linea(us.map(u => giro(p.fx(u), p.fy(u), ang, FUERA)), mat));
  }
  return grupo;
}

let solido = null;
function construir() {
  if (solido) {
    scene.remove(solido);
    solido.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
  solido = new THREE.Group();
  const cortar = document.getElementById('verCorte').checked;
  const a0 = cortar ? D.alfa + Math.PI / 2 : 0;
  const a1 = cortar ? D.alfa + 2 * Math.PI : 2 * Math.PI;
  for (const p of piezas) solido.add(superficie(p, a0, a1));
  if (cortar) {
    for (const t of trozos) {
      solido.add(cara(t, D.alfa));
      solido.add(cara(t, D.alfa + Math.PI / 2));
    }
    solido.add(bordesCorte());
  }
  const lm = lineasMalla(a0, a1);
  lm.visible = document.getElementById('verMalla').checked;
  lm.name = 'malla';
  solido.add(lm);
  scene.add(solido);
}

// ---- el suelo, los ejes y el eje de giro -----------------------------------
//  Los rótulos son texto: las letras de los ejes en cursiva por su clase,
//  y el de la recta de giro, que viene en LaTeX, con \frac{a}{b} como a/b.
function rotulo(texto, pos, clase = 'rotulo') {
  const div = document.createElement('div');
  div.className = clase;
  div.textContent = texto.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1/$2')
                         .replace(/\\,/g, ' ').replace(/[{}\\]/g, '')
                         .replace(/-/g, '−');
  const obj = new CSS2DObject(div);
  obj.position.set(...pos);
  return obj;
}

const [lo, hi] = D.caja;
const m = 0.12 * tam;
const suelo = new THREE.Group();
{
  const x0 = Math.min(lo[0], 0) - m, x1 = Math.max(hi[0], 0) + m;
  const y0 = Math.min(lo[1], 0) - m, y1 = Math.max(hi[1], 0) + m;
  const plano = new THREE.Mesh(
    new THREE.PlaneGeometry(x1 - x0, y1 - y0),
    new THREE.MeshBasicMaterial({ color: 0xc9cad0, transparent: true, opacity: 0.28,
                                  side: THREE.DoubleSide, depthWrite: false }));
  plano.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
  suelo.add(plano);
  suelo.add(linea([[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0], [x0, y0, 0]],
                  new THREE.LineBasicMaterial({ color: 0xa8a9b0 })));
}
scene.add(suelo);

const ejes = new THREE.Group();
{
  const negro = new THREE.LineBasicMaterial({ color: 0x111111 });
  const conoMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const nombres = ['x', 'y', 'z'];
  nombres.forEach((n, i) => {
    const [a, b] = D.ejes[n];
    const p0 = [0, 0, 0], p1 = [0, 0, 0];
    p0[i] = a; p1[i] = b;
    ejes.add(linea([p0, p1], negro));
    const cono = new THREE.Mesh(new THREE.ConeGeometry(0.018 * tam, 0.06 * tam, 18), conoMat);
    cono.position.set(...p1);
    const dir = new THREE.Vector3(...p1).sub(new THREE.Vector3(...p0)).normalize();
    cono.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    ejes.add(cono);
    const fin = [...p1]; fin[i] += 0.06 * tam;
    ejes.add(rotulo(n.toUpperCase(), fin, 'rotulo eje'));
    if (!D.numeros) return;
    const paso = D.paso;
    for (let k = Math.ceil((a + 0.3 * m) / paso); k * paso <= b - 0.9 * m; k++) {
      if (k === 0) continue;
      const q = [0, 0, 0]; q[i] = k * paso;
      const t = 0.012 * tam, r0 = [...q], r1 = [...q];
      const perp = i === 2 ? 0 : 2;
      r0[perp] -= t; r1[perp] += t;
      ejes.add(linea([r0, r1], negro));
      const et = [...q]; et[i === 2 ? 0 : 2] -= 0.05 * tam;
      const v = Math.round(k * paso * 1000) / 1000;
      ejes.add(rotulo(String(v).replace('.', ','), et, 'rotulo numero'));
    }
  });
}
scene.add(ejes);

if (D.eje_giro) {
  const mat = new THREE.LineDashedMaterial({ color: 0xe07000, dashSize: 0.05 * tam, gapSize: 0.025 * tam });
  const p0 = D.horizontal ? [lo[0] - m, D.k, 0] : [D.k, lo[1] - m, 0];
  const p1 = D.horizontal ? [hi[0] + m, D.k, 0] : [D.k, hi[1] + m, 0];
  const l = linea([p0, p1], mat);
  l.computeLineDistances();
  scene.add(l);
  scene.add(rotulo(D.eje_giro, p1, 'rotulo giro'));
}

construir();

// ---- los mandos --------------------------------------------------------
document.getElementById('verCorte').addEventListener('change', construir);
document.getElementById('verMalla').addEventListener('change', e => {
  const lm = solido.getObjectByName('malla');
  if (lm) lm.visible = e.target.checked;
});
document.getElementById('verSuelo').addEventListener('change', e => { suelo.visible = e.target.checked; });
document.getElementById('verEjes').addEventListener('change', e => { ejes.visible = e.target.checked; });
document.getElementById('vistaInicial').addEventListener('click', () => {
  camera.position.set(...D.camara);
  controls.target.set(...D.centro);
  controls.update();
});

function ajustar() {
  const w = lienzo.clientWidth, h = lienzo.clientHeight;
  renderer.setSize(w, h);
  rotulos.setSize(w, h);
  camera.aspect = w / Math.max(h, 1);
  camera.updateProjectionMatrix();
}
new ResizeObserver(ajustar).observe(lienzo);
ajustar();

(function animar() {
  requestAnimationFrame(animar);
  controls.update();
  renderer.render(scene, camera);
  rotulos.render(scene, camera);
})();

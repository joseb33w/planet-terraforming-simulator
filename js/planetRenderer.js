import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BIOMES, BARREN_COLOR, TEX_SIZE, createBiomeTexture, paintBiome, countBiomes } from './biomes.js';

export class PlanetRenderer {
  constructor(container, options = {}) {
    this.container = container;
    this.interactive = options.interactive !== false;
    this.size = options.size || null;
    this.moons = [];
    this.moonMeshes = [];
    this.atmosphere = { oxygen: 0, co2: 0.95, temperature: -40 };
    this.textureData = createBiomeTexture();
    this.activeBiome = null;
    this.brushSize = 8;
    this.isPainting = false;
    this.onPaint = options.onPaint || null;
    this.disposed = false;

    this._init();
  }

  _init() {
    const w = this.size || this.container.clientWidth;
    const h = this.size || this.container.clientHeight;

    // Scene
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
    this.camera.position.set(0, 0, 3.2);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // Controls
    if (this.interactive) {
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.08;
      this.controls.minDistance = 1.8;
      this.controls.maxDistance = 6;
      this.controls.enablePan = false;
    }

    // Lights
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(5, 3, 5);
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0x404060, 0.6));

    // Stars background
    if (this.interactive) {
      const starGeo = new THREE.BufferGeometry();
      const starVerts = [];
      for (let i = 0; i < 2000; i++) {
        const r = 50 + Math.random() * 50;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        starVerts.push(r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi));
      }
      starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starVerts, 3));
      this.scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.15 })));
    }

    // Planet
    this.planetTexture = new THREE.DataTexture(this.textureData, TEX_SIZE, TEX_SIZE, THREE.RGBAFormat);
    this.planetTexture.needsUpdate = true;
    this.planetTexture.wrapS = THREE.RepeatWrapping;

    this.planetMat = new THREE.MeshStandardMaterial({
      map: this.planetTexture,
      roughness: 0.7,
      metalness: 0.1
    });
    this.planetMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), this.planetMat);
    this.scene.add(this.planetMesh);

    // Atmosphere glow
    this.atmosMat = new THREE.ShaderMaterial({
      uniforms: {
        skyColor: { value: new THREE.Color(0.2, 0.2, 0.3) },
        intensity: { value: 0.4 }
      },
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 skyColor;
        uniform float intensity;
        varying vec3 vNormal;
        void main() {
          float glow = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 3.0) * intensity;
          gl_FragColor = vec4(skyColor, glow);
        }
      `,
      transparent: true,
      side: THREE.FrontSide,
      depthWrite: false
    });
    this.atmosMesh = new THREE.Mesh(new THREE.SphereGeometry(1.08, 48, 48), this.atmosMat);
    this.scene.add(this.atmosMesh);

    // Cloud layer
    const cloudCanvas = document.createElement('canvas');
    cloudCanvas.width = 256; cloudCanvas.height = 128;
    this.cloudCtx = cloudCanvas.getContext('2d');
    this.cloudTexture = new THREE.CanvasTexture(cloudCanvas);
    this.cloudMat = new THREE.MeshStandardMaterial({
      map: this.cloudTexture, transparent: true, opacity: 0.0,
      depthWrite: false, side: THREE.DoubleSide
    });
    this.cloudMesh = new THREE.Mesh(new THREE.SphereGeometry(1.03, 48, 48), this.cloudMat);
    this.scene.add(this.cloudMesh);
    this._generateClouds();

    // Raycaster for painting
    if (this.interactive) {
      this.raycaster = new THREE.Raycaster();
      this.pointer = new THREE.Vector2();
      this._bindPaintEvents();
    }

    // Animation
    this._animate();
  }

  _bindPaintEvents() {
    const canvas = this.renderer.domElement;

    const getPointer = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    };

    const startPaint = (e) => {
      if (!this.activeBiome) return;
      this.isPainting = true;
      if (this.controls) this.controls.enabled = false;
      getPointer(e);
      this._doPaint();
    };
    const movePaint = (e) => {
      if (!this.isPainting) return;
      e.preventDefault();
      getPointer(e);
      this._doPaint();
    };
    const endPaint = () => {
      this.isPainting = false;
      if (this.controls) this.controls.enabled = true;
    };

    canvas.addEventListener('mousedown', startPaint);
    canvas.addEventListener('mousemove', movePaint);
    canvas.addEventListener('mouseup', endPaint);
    canvas.addEventListener('touchstart', startPaint, { passive: false });
    canvas.addEventListener('touchmove', movePaint, { passive: false });
    canvas.addEventListener('touchend', endPaint);
  }

  _doPaint() {
    if (!this.activeBiome) return;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.planetMesh);
    if (hits.length > 0) {
      const uv = hits[0].uv;
      paintBiome(this.textureData, uv.x, uv.y, this.activeBiome, this.brushSize);
      this.planetTexture.needsUpdate = true;
      if (this.onPaint) this.onPaint();
    }
  }

  _generateClouds() {
    const ctx = this.cloudCtx;
    const w = 256, h = 128;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const rw = 15 + Math.random() * 30;
      const rh = 5 + Math.random() * 12;
      ctx.beginPath();
      ctx.ellipse(x, y, rw, rh, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    this.cloudTexture.needsUpdate = true;
  }

  updateAtmosphere(atmos) {
    this.atmosphere = { ...atmos };
    // Sky color based on atmosphere
    const o2 = atmos.oxygen / 100;
    const co2 = atmos.co2;
    const temp = atmos.temperature;
    // More O2 = bluer, more CO2 = orange/yellow, temp shifts warm/cool
    const r = Math.min(1, 0.1 + co2 * 0.5 + Math.max(0, (temp - 20) / 100) * 0.3);
    const g = Math.min(1, 0.1 + o2 * 0.4 + Math.max(0, (30 - Math.abs(temp - 20)) / 60) * 0.3);
    const b = Math.min(1, 0.2 + o2 * 0.8 - co2 * 0.2);
    this.atmosMat.uniforms.skyColor.value.setRGB(r, g, b);

    // Atmosphere intensity based on total atmosphere density
    const density = Math.min(1, (o2 + co2) * 0.8);
    this.atmosMat.uniforms.intensity.value = 0.1 + density * 1.2;

    // Cloud density based on temperature + water
    const cloudOpacity = Math.min(0.6, Math.max(0, (o2 * 0.3 + Math.max(0, temp + 20) / 100 * 0.4)));
    this.cloudMat.opacity = cloudOpacity;
  }

  addMoon() {
    const moonGeo = new THREE.SphereGeometry(0.12 + Math.random() * 0.08, 24, 24);
    const moonColor = [0x888888, 0xaaaaaa, 0xbbaa88, 0xcc9977][Math.floor(Math.random() * 4)];
    const moonMat = new THREE.MeshStandardMaterial({ color: moonColor, roughness: 0.8 });
    const moonMesh = new THREE.Mesh(moonGeo, moonMat);
    const orbitRadius = 1.6 + this.moonMeshes.length * 0.4;
    const speed = 0.3 + Math.random() * 0.4;
    const tilt = (Math.random() - 0.5) * 0.6;
    const startAngle = Math.random() * Math.PI * 2;
    this.moonMeshes.push({ mesh: moonMesh, radius: orbitRadius, speed, tilt, angle: startAngle });
    this.scene.add(moonMesh);
    return this.moonMeshes.length;
  }

  removeMoon(index) {
    if (index < 0 || index >= this.moonMeshes.length) return;
    const m = this.moonMeshes[index];
    this.scene.remove(m.mesh);
    m.mesh.geometry.dispose();
    m.mesh.material.dispose();
    this.moonMeshes.splice(index, 1);
  }

  loadFromData(planetData) {
    if (planetData.textureData) {
      const arr = Uint8Array.from(atob(planetData.textureData), c => c.charCodeAt(0));
      if (arr.length === this.textureData.length) {
        this.textureData.set(arr);
        this.planetTexture.needsUpdate = true;
      }
    }
    if (planetData.atmosphere) this.updateAtmosphere(planetData.atmosphere);
    if (planetData.moons) {
      // Clear existing
      while (this.moonMeshes.length > 0) this.removeMoon(0);
      for (let i = 0; i < planetData.moons; i++) this.addMoon();
    }
  }

  exportData() {
    // Base64-encode texture
    const b64 = btoa(String.fromCharCode(...this.textureData));
    return {
      textureData: b64,
      atmosphere: { ...this.atmosphere },
      moons: this.moonMeshes.length
    };
  }

  getBiomeCounts() {
    return countBiomes(this.textureData);
  }

  _animate() {
    if (this.disposed) return;
    requestAnimationFrame(() => this._animate());
    // Slow planet rotation
    this.planetMesh.rotation.y += 0.001;
    this.cloudMesh.rotation.y += 0.0015;
    this.atmosMesh.rotation.y += 0.0005;

    // Moon orbits
    const time = Date.now() * 0.001;
    for (const m of this.moonMeshes) {
      m.angle += m.speed * 0.01;
      m.mesh.position.set(
        Math.cos(m.angle) * m.radius,
        Math.sin(m.tilt) * Math.sin(m.angle) * m.radius * 0.3,
        Math.sin(m.angle) * m.radius
      );
    }

    if (this.controls) this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  dispose() {
    this.disposed = true;
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
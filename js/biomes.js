// Biome definitions
export const BIOMES = [
  { id: 'ocean',   name: 'Ocean',   emoji: '🌊', color: [0.1, 0.3, 0.8] },
  { id: 'forest',  name: 'Forest',  emoji: '🌲', color: [0.1, 0.5, 0.15] },
  { id: 'desert',  name: 'Desert',  emoji: '🏜️', color: [0.85, 0.7, 0.35] },
  { id: 'ice',     name: 'Ice Cap', emoji: '🧊', color: [0.85, 0.92, 0.98] },
  { id: 'jungle',  name: 'Jungle',  emoji: '🌴', color: [0.05, 0.6, 0.1] },
  { id: 'mountain', name: 'Mountain', emoji: '⛰️', color: [0.45, 0.4, 0.35] },
  { id: 'lava',    name: 'Lava',    emoji: '🌋', color: [0.8, 0.2, 0.05] },
  { id: 'plains',  name: 'Plains',  emoji: '🌾', color: [0.55, 0.7, 0.25] }
];

export const BARREN_COLOR = [0.4, 0.35, 0.3];

// Texture size for biome painting
export const TEX_SIZE = 256;

export function createBiomeTexture() {
  const size = TEX_SIZE;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const idx = i * 4;
    // Barren rocky surface with slight noise
    const noise = (Math.random() - 0.5) * 0.06;
    data[idx]     = Math.floor((BARREN_COLOR[0] + noise) * 255);
    data[idx + 1] = Math.floor((BARREN_COLOR[1] + noise) * 255);
    data[idx + 2] = Math.floor((BARREN_COLOR[2] + noise) * 255);
    data[idx + 3] = 255;
  }
  return data;
}

export function paintBiome(textureData, u, v, biome, brushSize) {
  const size = TEX_SIZE;
  const cx = Math.floor(u * size);
  const cy = Math.floor((1 - v) * size);
  const radius = brushSize;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const px = (cx + dx + size) % size;
      const py = Math.max(0, Math.min(size - 1, cy + dy));
      const idx = (py * size + px) * 4;
      const noise = (Math.random() - 0.5) * 0.08;
      textureData[idx]     = Math.floor(Math.max(0, Math.min(255, (biome.color[0] + noise) * 255)));
      textureData[idx + 1] = Math.floor(Math.max(0, Math.min(255, (biome.color[1] + noise) * 255)));
      textureData[idx + 2] = Math.floor(Math.max(0, Math.min(255, (biome.color[2] + noise) * 255)));
    }
  }
}

export function countBiomes(textureData) {
  const counts = {};
  BIOMES.forEach(b => counts[b.id] = 0);
  counts.barren = 0;
  const size = TEX_SIZE;
  const total = size * size;
  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    const r = textureData[idx] / 255;
    const g = textureData[idx + 1] / 255;
    const b = textureData[idx + 2] / 255;
    let closestBiome = 'barren';
    let closestDist = colorDist(r, g, b, BARREN_COLOR[0], BARREN_COLOR[1], BARREN_COLOR[2]);
    for (const biome of BIOMES) {
      const d = colorDist(r, g, b, biome.color[0], biome.color[1], biome.color[2]);
      if (d < closestDist) { closestDist = d; closestBiome = biome.id; }
    }
    counts[closestBiome]++;
  }
  // Convert to percentages
  const pcts = {};
  for (const k in counts) pcts[k] = Math.round((counts[k] / total) * 100);
  return pcts;
}

function colorDist(r1, g1, b1, r2, g2, b2) {
  return (r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2;
}

export function calcHabitability(atmosphere, biomeCounts) {
  let score = 0;
  // Oxygen: sweet spot around 20-25%
  const o2 = atmosphere.oxygen;
  if (o2 >= 18 && o2 <= 28) score += 25;
  else if (o2 >= 10 && o2 <= 40) score += 15;
  else score += 5;

  // CO2: lower is better, some is needed
  const co2 = atmosphere.co2;
  if (co2 >= 0.02 && co2 <= 0.06) score += 20;
  else if (co2 < 0.5) score += 12;
  else score += 3;

  // Temperature: sweet spot 10-30°C
  const temp = atmosphere.temperature;
  if (temp >= 10 && temp <= 30) score += 25;
  else if (temp >= -10 && temp <= 45) score += 15;
  else score += 3;

  // Biome diversity
  const biomeTypes = Object.entries(biomeCounts).filter(([k, v]) => k !== 'barren' && v > 2).length;
  score += Math.min(20, biomeTypes * 4);

  // Ocean coverage (20-60% ideal)
  const oceanPct = biomeCounts.ocean || 0;
  if (oceanPct >= 20 && oceanPct <= 60) score += 10;
  else if (oceanPct >= 5 && oceanPct <= 80) score += 5;

  return Math.min(100, Math.round(score));
}

export function calcPopulation(habitability) {
  if (habitability < 20) return 0;
  if (habitability < 40) return Math.round((habitability - 20) * 500);
  if (habitability < 60) return Math.round(10000 + (habitability - 40) * 5000);
  if (habitability < 80) return Math.round(110000 + (habitability - 60) * 50000);
  return Math.round(1110000 + (habitability - 80) * 500000);
}

export function formatPopulation(pop) {
  if (pop === 0) return 'Uninhabited';
  if (pop < 1000) return pop.toLocaleString();
  if (pop < 1000000) return (pop / 1000).toFixed(1) + 'K';
  if (pop < 1000000000) return (pop / 1000000).toFixed(1) + 'M';
  return (pop / 1000000000).toFixed(1) + 'B';
}
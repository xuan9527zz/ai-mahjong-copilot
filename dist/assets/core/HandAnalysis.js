import { TILE_LABELS } from './constants.js';

export const TILE_CODES = Object.keys(TILE_LABELS);
const INDEX = new Map(TILE_CODES.map((code, index) => [code, index]));
const ORPHANS = ['1m', '9m', '1p', '9p', '1s', '9s', 'east', 'south', 'west', 'north', 'red', 'green', 'white'];

export function tileCounts(tiles) {
  const counts = Array(34).fill(0);
  for (const tile of tiles) {
    const index = INDEX.get(typeof tile === 'string' ? tile : tile.code);
    if (index === undefined) throw new Error('存在无效牌码');
    counts[index] += 1;
    if (counts[index] > 4) throw new Error('同一种牌不能超过四张');
  }
  return counts;
}

export function standardWin(tiles, exposedMelds = 0) {
  const counts = tileCounts(tiles);
  if (tiles.length !== 14 - 3 * exposedMelds) return false;
  const meldsNeeded = 4 - exposedMelds;
  for (let index = 0; index < 34; index += 1) {
    if (counts[index] < 2) continue;
    counts[index] -= 2;
    if (completeMelds(counts, meldsNeeded)) return true;
    counts[index] += 2;
  }
  return false;
}

function completeMelds(counts, needed) {
  const index = counts.findIndex(Boolean);
  if (index === -1) return needed === 0;
  if (needed === 0) return false;
  if (counts[index] >= 3) {
    counts[index] -= 3;
    if (completeMelds(counts, needed - 1)) return true;
    counts[index] += 3;
  }
  if (index < 27 && index % 9 < 7 && counts[index + 1] && counts[index + 2]) {
    counts[index] -= 1; counts[index + 1] -= 1; counts[index + 2] -= 1;
    if (completeMelds(counts, needed - 1)) return true;
    counts[index] += 1; counts[index + 1] += 1; counts[index + 2] += 1;
  }
  return false;
}

export function sevenPairs(tiles, exposedMelds = 0) {
  if (exposedMelds || tiles.length !== 14) return null;
  const counts = tileCounts(tiles);
  if (counts.reduce((sum, count) => sum + Math.floor(count / 2), 0) !== 7) return null;
  return counts.filter((count) => count === 4).length;
}

export function thirteenOrphans(tiles, exposedMelds = 0) {
  if (exposedMelds || tiles.length !== 14) return false;
  const counts = tileCounts(tiles);
  return ORPHANS.every((code) => counts[INDEX.get(code)] >= 1) && ORPHANS.some((code) => counts[INDEX.get(code)] === 2);
}

const shantenCache = new Map();
export function shanten(tiles, exposedMelds = 0) {
  const counts = tileCounts(tiles);
  const key = `${exposedMelds}:${counts.join('')}`;
  if (shantenCache.has(key)) return shantenCache.get(key);
  let best = 8;
  const search = (index, melds, pairs, taatsu) => {
    while (index < 34 && counts[index] === 0) index += 1;
    if (index === 34) {
      const totalMelds = exposedMelds + melds;
      const usableTaatsu = Math.min(taatsu, 4 - totalMelds);
      best = Math.min(best, 8 - totalMelds * 2 - usableTaatsu - Math.min(pairs, 1));
      return;
    }
    if (exposedMelds + melds > 4) return;
    if (counts[index] >= 3) { counts[index] -= 3; search(index, melds + 1, pairs, taatsu); counts[index] += 3; }
    if (index < 27 && index % 9 < 7 && counts[index + 1] && counts[index + 2]) {
      counts[index]--; counts[index + 1]--; counts[index + 2]--;
      search(index, melds + 1, pairs, taatsu);
      counts[index]++; counts[index + 1]++; counts[index + 2]++;
    }
    if (counts[index] >= 2) { counts[index] -= 2; search(index, melds, pairs + 1, taatsu); search(index, melds, pairs, taatsu + 1); counts[index] += 2; }
    if (index < 27 && index % 9 < 8 && counts[index + 1]) {
      counts[index]--; counts[index + 1]--;
      search(index, melds, pairs, taatsu + 1);
      counts[index]++; counts[index + 1]++;
    }
    if (index < 27 && index % 9 < 7 && counts[index + 2]) {
      counts[index]--; counts[index + 2]--;
      search(index, melds, pairs, taatsu + 1);
      counts[index]++; counts[index + 2]++;
    }
    counts[index]--; search(index, melds, pairs, taatsu); counts[index]++;
  };
  search(0, 0, 0, 0);
  if (!exposedMelds && tiles.length >= 13) {
    const uniquePairs = counts.filter((count) => count >= 2).length;
    const quads = counts.filter((count) => count === 4).length;
    best = Math.min(best, 6 - uniquePairs + Math.max(0, 7 - uniquePairs - (34 - counts.filter(Boolean).length)) - quads);
    const orphanUnique = ORPHANS.filter((code) => counts[INDEX.get(code)] > 0).length;
    const orphanPair = ORPHANS.some((code) => counts[INDEX.get(code)] > 1);
    best = Math.min(best, 13 - orphanUnique - Number(orphanPair));
  }
  shantenCache.set(key, best);
  return best;
}

export function effectiveDraws(handAfterDiscard, visibleTiles = [], exposedMelds = 0) {
  const base = shanten(handAfterDiscard, exposedMelds);
  const known = tileCounts([...handAfterDiscard, ...visibleTiles]);
  const usefulTiles = [];
  let remainingCount = 0;
  TILE_CODES.forEach((tile, index) => {
    const left = 4 - known[index];
    if (left <= 0) return;
    if (shanten([...handAfterDiscard, tile], exposedMelds) < base) {
      usefulTiles.push(tile);
      remainingCount += left;
    }
  });
  return { shanten: base, usefulTiles, remainingCount };
}

import { INITIAL_HAND } from '../core/constants.js';

export class VisionService {
  async detectHand() {
    await wait(450);
    return { tiles: [...INITIAL_HAND], confidence: 0.96, stable: true, count: 13 };
  }

  async compareHands(before, after) {
    const beforeCounts = count(before);
    const afterCounts = count(after);
    const added = after.find((tile) => (afterCounts[tile] || 0) > (beforeCounts[tile] || 0));
    const removed = before.find((tile) => (beforeCounts[tile] || 0) > (afterCounts[tile] || 0));
    return { added, removed, stable: true };
  }

  async detectDraw(tile = '8p') { await wait(300); return { tile, confidence: 0.95, source: 'VISION' }; }
  async detectDiscard(tile) { await wait(300); return { tile, confidence: 0.95, source: 'VISION' }; }
}

function count(tiles) { return tiles.reduce((map, tile) => ({ ...map, [tile]: (map[tile] || 0) + 1 }), {}); }
function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

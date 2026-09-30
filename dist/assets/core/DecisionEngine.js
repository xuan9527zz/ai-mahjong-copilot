import { tileLabel } from './constants.js';

export class DecisionEngine {
  analyze(gameState) {
    if (gameState.currentPlayer !== 'self' || gameState.myHand.length !== 14) return null;
    const preferred = gameState.myHand.some((tile) => tile.code === 'east') ? 'east' : gameState.myHand.at(-1)?.code;
    const index = gameState.myHand.findIndex((tile) => tile.code === preferred);
    const count = gameState.myHand.length;
    const fromLeft = index + 1;
    const fromRight = count - index;
    const physicalPosition = fromRight < fromLeft
      ? { side: 'right', index: fromRight, text: `右边第${toChinese(fromRight)}张` }
      : { side: 'left', index: fromLeft, text: `左边第${toChinese(fromLeft)}张` };

    return {
      recommendedAction: 'DISCARD', tile: preferred, physicalPosition,
      alternatives: gameState.myHand.filter((tile) => tile.code !== preferred).slice(-2).map((tile) => tile.code),
      shanten: 1, usefulTiles: ['1s', '4s', '7s'], remainingCount: 10, risk: '低',
      reason: `打${tileLabel(preferred)}后保持一向听，有效牌最多。`,
    };
  }
}

function toChinese(number) {
  return ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四'][number] || String(number);
}

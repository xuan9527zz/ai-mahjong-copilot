import { PLAYER_LABELS, tileLabel } from './constants.js';
import { effectiveDraws } from './HandAnalysis.js';
import { RulesEngine } from './RulesEngine.js';

export class DecisionEngine {
  constructor(rules = new RulesEngine()) { this.rules = rules; }

  analyze(gameState) {
    const meldCount = gameState.melds.filter((meld) => meld.actor === 'self').length;
    if (gameState.currentPlayer !== 'self' || gameState.myHand.length !== 14 - 3 * meldCount) return null;
    this.rules.validatePublicState(gameState);
    const hand = gameState.myHand.map((item) => item.code);
    const mode = gameState.strategyMode || this.rules.profile.defaultStrategy;
    const candidates = [...new Set(hand)].map((tile) => {
      const after = [...hand]; after.splice(after.indexOf(tile), 1);
      const effectiveness = effectiveDraws(after, [...gameState.visibleTiles, tile], meldCount);
      const opponents = ['right', 'opposite', 'left'].map((actor) => opponentRisk(gameState, actor, tile));
      const expectedRonLoss = opponents.reduce((sum, opponent) => sum + opponent.expectedLoss, 0);
      const ronProbabilityAny = 1 - opponents.reduce((product, opponent) => product * (1 - opponent.ronEstimate), 1);
      const disruption = opponents.reduce((sum, opponent) => sum + Number(opponent.pongPossible) + Number(opponent.exposedKongPossible), 0);
      return { tile, ...effectiveness, opponents, expectedRonLoss, ronProbabilityAny, disruption };
    });
    const compare = (a, b) => {
      const loss = a.expectedRonLoss - b.expectedRonLoss;
      const shanten = a.shanten - b.shanten;
      const ukeire = b.remainingCount - a.remainingCount;
      if (mode === 'ATTACK_FIRST') return shanten || ukeire || loss || a.disruption - b.disruption;
      if (mode === 'BALANCED') return (Math.abs(shanten) > 1 ? shanten : loss * 0.5 + shanten * 0.35 - (a.remainingCount - b.remainingCount) * 0.012) || ukeire;
      return loss || a.ronProbabilityAny - b.ronProbabilityAny || a.disruption - b.disruption || shanten || ukeire;
    };
    candidates.sort(compare);
    const best = candidates[0];
    const index = hand.indexOf(best.tile);
    const count = gameState.myHand.length;
    const fromLeft = index + 1;
    const fromRight = count - index;
    const physicalPosition = fromRight < fromLeft
      ? { side: 'right', index: fromRight, text: `右边第${toChinese(fromRight)}张` }
      : { side: 'left', index: fromLeft, text: `左边第${toChinese(fromLeft)}张` };

    return {
      recommendedAction: 'DISCARD', tile: best.tile, physicalPosition,
      alternatives: candidates.slice(1, 3).map((candidate) => candidate.tile),
      shanten: best.shanten, usefulTiles: best.usefulTiles, remainingCount: best.remainingCount,
      risk: '相对估计', ruleProfile: this.rules.profile.id, strategyMode: mode,
      candidates, uncertainty: '对手暗手未知；风险值是同一局面内的启发式排序，未经真实概率校准。',
      reason: `${mode === 'ATTACK_FIRST' ? '进攻优先：先比较向听与有效牌。' : mode === 'BALANCED' ? '攻守平衡：综合比较牌效与相对风险。' : '防守优先：先比较相对点炮损失。'}建议打${tileLabel(best.tile)}；打后${best.shanten}向听，未见有效牌${best.remainingCount}张。`,
    };
  }
}

function opponentRisk(state, actor, tile) {
  const river = state.discardPiles[actor] || [];
  const sameRiver = river.filter((item) => item.tile === tile).length;
  const melds = (state.melds || []).filter((meld) => meld.actor === actor);
  const exposedCount = melds.reduce((sum, meld) => sum + (meld.type === 'KONG' ? 4 : 3), 0);
  const profile = inferProfile(melds);
  const activeLock = (state.responseLocks || []).some((lock) => lock.actor === actor && lock.tile === tile && lock.action === 'ron' && lock.active);
  const readyLikelihood = Math.min(0.75, 0.25 + Math.min(0.3, (state.turn - 1) * 0.025) + melds.length * 0.06);
  const profileCompatibility = compatibility(profile, tile);
  const ownRiverModifier = Math.max(0.46, 0.62 ** sameRiver);
  const openHandModifier = exposedCount < 6 ? 1 : exposedCount < 9 ? 1.05 : exposedCount < 12 ? 1.10 : 1.14;
  const ronEstimate = activeLock ? 0 : Math.min(0.42, Math.max(0.004, readyLikelihood * 0.17 * profileCompatibility * ownRiverModifier * openHandModifier));
  const valueWeight = profile.kind === 'PURE_SUIT' ? 8 : profile.kind === 'HONORS' ? 16 : 4;
  const matchesHighDirection = ['MIXED_SUIT', 'PURE_SUIT', 'HONORS'].includes(profile.kind) && profileCompatibility > 1;
  const liabilityMultiplier = matchesHighDirection && exposedCount >= 9 ? exposedCount >= 12 ? 2.5 : 1.85 : 1;
  const visibleSame = state.visibleTiles.filter((item) => item === tile).length;
  const selfSame = state.myHand.filter((item) => item.code === tile).length;
  const otherCopies = Math.max(0, 4 - visibleSame - selfSame);
  const pongLocked = (state.responseLocks || []).some((lock) => lock.actor === actor && lock.tile === tile && lock.action === 'pong' && lock.active);
  const kongLocked = (state.responseLocks || []).some((lock) => lock.actor === actor && lock.tile === tile && lock.action === 'exposedKong' && lock.active);
  return {
    actor, label: PLAYER_LABELS[actor], profile: profile.kind, ronEstimate,
    expectedLoss: ronEstimate * valueWeight * liabilityMultiplier, valueWeight, liabilityMultiplier,
    pongPossible: !pongLocked && otherCopies >= 2, exposedKongPossible: !kongLocked && otherCopies >= 3,
    hardRonLock: activeLock, priorSameDiscard: sameRiver,
    note: activeLock ? '本轮活动同牌荣和响应锁' : sameRiver ? '旧牌河同牌仅作软修正，不保证安全' : '暗手未知，按未校准模型估计',
  };
}

function inferProfile(melds) {
  if (melds.length < 2 || melds.some((meld) => !meld.tiles?.length)) return { kind: 'UNKNOWN' };
  const exposed = melds.flatMap((meld) => meld.tiles);
  const suits = new Set(exposed.filter((tile) => tile.length === 2).map((tile) => tile.at(-1)));
  const honors = exposed.filter((tile) => tile.length > 2).length;
  if (honors === exposed.length) return { kind: 'HONORS' };
  if (suits.size === 1) return { kind: honors ? 'MIXED_SUIT' : 'PURE_SUIT', suit: [...suits][0] };
  if (melds.every((meld) => ['PONG', 'KONG'].includes(meld.type))) return { kind: 'ALL_TRIPLETS' };
  return { kind: 'NORMAL' };
}

function compatibility(profile, tile) {
  const honor = tile.length > 2;
  const terminal = !honor && ['1', '9'].includes(tile[0]);
  if (profile.kind === 'MIXED_SUIT') return honor ? 1.28 : tile.at(-1) === profile.suit ? 1.8 : 0.36;
  if (profile.kind === 'PURE_SUIT') return !honor && tile.at(-1) === profile.suit ? 2.05 : 0.18;
  if (profile.kind === 'HONORS') return honor ? 2.55 : 0.24;
  if (profile.kind === 'ALL_TRIPLETS') return honor ? 1.35 : terminal ? 1.18 : 1;
  if (profile.kind === 'NORMAL') return honor ? 0.8 : terminal ? 0.92 : Number(tile[0]) >= 3 && Number(tile[0]) <= 7 ? 1.15 : 1;
  return honor ? 0.86 : 1;
}

function toChinese(number) {
  return ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四'][number] || String(number);
}

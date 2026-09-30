import { sevenPairs, standardWin, thirteenOrphans, tileCounts } from './HandAnalysis.js';

export const RULE_PROFILE = Object.freeze({
  id: 'GD-SZ-DEFENSE-V1', name: '广东麻将 · 防点炮训练', players: 4, tileCount: 136,
  flowers: false, chi: false, multiRon: true, chickenHandTsumoOnly: true,
  defaultStrategy: 'DEFENSE_FIRST',
  scores: Object.freeze({
    鸡胡: 2, 对对胡: 4, 混一色: 4, 七小对: 8, 豪七: 12, 双豪七: 24, 三豪: 36,
    清一色: 8, 幺九: 12, 清幺九: 16, 四暗刻: 24, 十三幺: 20, 十八罗汉: 36,
    小三元: 12, 大三元: 16, 小四喜: 16, 大四喜: 20, 字一色: 16, 地胡: 25, 天胡: 50,
  }),
  unresolved: ['牌型叠加与封顶', '庄闲和自摸结算', '杠分与抢杠胡', '多人碰杠优先级', '包牌精确结算'],
});

const honors = new Set(['east', 'south', 'west', 'north', 'red', 'green', 'white']);
const terminals = new Set(['1m', '9m', '1p', '9p', '1s', '9s']);

export class RulesEngine {
  constructor() { this.profile = RULE_PROFILE; this.rule = RULE_PROFILE.id; }
  getName() { return this.profile.name; }
  canCall(action) { return ['PONG', 'KONG', 'PASS', 'WIN'].includes(action); }
  nextRound(round) { return Number(round || 0) + 1; }
  validateTiles(tiles) { tileCounts(tiles); return true; }

  validatePublicState(state) {
    if (state.integrityErrors?.length) throw new Error(state.integrityErrors[0]);
    const all = [...state.myHand.map((item) => item.code), ...state.visibleTiles];
    tileCounts(all);
    if (state.myHand.length > 14) throw new Error('手牌超过 14 张');
    for (const meld of state.melds || []) validateMeld(meld);
    if (state.discardModes) for (const [actor, modes] of Object.entries(state.discardModes)) {
      if (modes.length !== state.discardPiles[actor]?.length) throw new Error('舍牌方式与牌河长度不一致');
    }
    return true;
  }

  analyzeWin(tiles, { method = 'TSUMO', melds = [] } = {}) {
    if (!['TSUMO', 'RON'].includes(method)) throw new Error('胡牌方式必须是自摸或荣和');
    if (melds.length > 4) throw new Error('副露组数超限');
    melds.forEach(validateMeld);
    this.validateTiles(tiles);
    const exposedMelds = melds.length;
    const normal = standardWin(tiles, exposedMelds);
    const luxuryQuads = sevenPairs(tiles, exposedMelds);
    const orphans = thirteenOrphans(tiles, exposedMelds);
    if (!normal && luxuryQuads === null && !orphans) return { legal: false, reason: '手牌未组成可识别的和牌结构', patterns: [] };
    const all = [...tiles, ...melds.flatMap((meld) => meld.tiles?.length ? meld.tiles : Array(meld.type === 'KONG' ? 4 : 3).fill(meld.tile))];
    tileCounts(all);
    const patterns = [];
    if (orphans) patterns.push('十三幺');
    if (luxuryQuads !== null) patterns.push(['七小对', '豪七', '双豪七', '三豪'][Math.min(luxuryQuads, 3)]);
    const suitSet = new Set(all.filter((tile) => !honors.has(tile)).map((tile) => tile.at(-1)));
    if (all.every((tile) => honors.has(tile))) patterns.push('字一色');
    else if (suitSet.size === 1) patterns.push(all.some((tile) => honors.has(tile)) ? '混一色' : '清一色');
    if (normal && all.every((tile) => honors.has(tile) || terminals.has(tile))) patterns.push('幺九');
    if (normal && all.every((tile) => terminals.has(tile))) patterns.push('清幺九');
    if (normal && isAllTriplets(tiles, exposedMelds) && melds.every((meld) => ['PONG', 'KONG'].includes(meld.type))) patterns.push('对对胡');
    if (normal) {
      const count = (code) => all.filter((tile) => tile === code).length;
      const dragons = ['red', 'green', 'white'];
      const winds = ['east', 'south', 'west', 'north'];
      if (dragons.every((code) => count(code) >= 3)) patterns.push('大三元');
      else if (dragons.filter((code) => count(code) >= 3).length === 2 && dragons.some((code) => count(code) === 2)) patterns.push('小三元');
      if (winds.every((code) => count(code) >= 3)) patterns.push('大四喜');
      else if (winds.filter((code) => count(code) >= 3).length === 3 && winds.some((code) => count(code) === 2)) patterns.push('小四喜');
      if (method === 'TSUMO' && melds.length === 0 && isAllTriplets(tiles, 0)) patterns.push('四暗刻');
      if (melds.length === 4 && melds.every((meld) => meld.type === 'KONG')) patterns.push('十八罗汉');
    }
    if (patterns.length === 0 && method === 'TSUMO') patterns.push('鸡胡');
    if (patterns.length === 0) return { legal: false, reason: '鸡胡仅可自摸，不能荣和', patterns: [] };
    return {
      legal: true, patterns: patterns.map((name) => ({ name, points: this.profile.scores[name] })),
      totalPoints: null, reason: '牌型可识别；叠加和结算未定义，不提供总分',
      unresolved: this.profile.unresolved,
    };
  }
}

function validateMeld(meld) {
  if (!['PONG', 'KONG'].includes(meld.type)) throw new Error('此规则不允许该副露');
  if (meld.tiles?.length) {
    const expected = meld.type === 'KONG' ? 4 : 3;
    if (meld.tiles.length !== expected || meld.tiles.some((tile) => tile !== meld.tile)) throw new Error('副露牌型不一致');
  }
}

function isAllTriplets(tiles, exposedMelds) {
  const counts = tileCounts(tiles);
  if (tiles.length !== 14 - 3 * exposedMelds) return false;
  for (let index = 0; index < 34; index += 1) {
    if (counts[index] < 2) continue;
    counts[index] -= 2;
    if (counts.every((count) => count % 3 === 0)) return true;
    counts[index] += 2;
  }
  return false;
}

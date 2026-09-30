globalThis.localStorage = {
  data: new Map(),
  getItem(key) { return this.data.get(key) ?? null; },
  setItem(key, value) { this.data.set(key, String(value)); },
  removeItem(key) { this.data.delete(key); },
};

const { EventStore } = await import('../dist/assets/core/EventStore.js');
const { GameStateEngine } = await import('../dist/assets/core/GameStateEngine.js');
const { RulesEngine } = await import('../dist/assets/core/RulesEngine.js');
const { DecisionEngine } = await import('../dist/assets/core/DecisionEngine.js');
const { INITIAL_HAND } = await import('../dist/assets/core/constants.js');

const store = new EventStore('test-game');
const game = new GameStateEngine(store, new RulesEngine());
const decision = new DecisionEngine();
const assert = (condition, message) => { if (!condition) throw new Error(message); };

game.startGame({ tiles: INITIAL_HAND });
assert(game.getState().currentPlayer === 'right', '牌局应从下家开始');
assert(game.getState().myHand.length === 13, '初始应有 13 张牌');

game.recordDiscard('9m');
assert(game.getState().currentPlayer === 'opposite', '下家出牌后应轮到对家');
game.recordDiscard('1p');
assert(game.getState().currentPlayer === 'left', '对家出牌后应轮到上家');
const lastOpponentDiscard = game.recordDiscard('7s');
assert(game.getState().currentPlayer === 'self', '上家出牌后应轮到我');

game.recordDraw('8p');
assert(game.getState().myHand.length === 14, '摸牌后应有 14 张牌');
const recommendation = decision.analyze(game.getState());
assert(recommendation.tile === 'east', '应推荐东');
assert(recommendation.physicalPosition.text === '右边第二张', '东应位于右边第二张');
game.recordRecommendation(recommendation);
game.recordDiscard('east', { actor: 'self', source: 'VISION', confidence: 0.95 });
assert(game.getState().currentPlayer === 'right', '我出牌后应轮到下家');
assert(game.getState().myHand.length === 13, '出牌后应恢复 13 张');

game.undoLast();
assert(game.getState().currentPlayer === 'self', '撤销后应恢复我的回合');
assert(game.getState().myHand.length === 14, '撤销后应恢复 14 张');
game.recordCall('opposite', 'PONG');
assert(game.getState().currentPlayer === 'opposite', '对家碰后应改为对家出牌');

game.correct(lastOpponentDiscard.id, '7p');
assert(game.getState().discardPiles.left.at(-1).tile === '7p', '纠错事件应重建为七筒');

console.log('MVP event flow smoke test passed');

globalThis.localStorage = {
  data: new Map(), getItem(key) { return this.data.get(key) ?? null; },
  setItem(key, value) { this.data.set(key, String(value)); }, removeItem(key) { this.data.delete(key); },
};

import assert from 'node:assert/strict';
import { RulesEngine, RULE_PROFILE } from '../dist/assets/core/RulesEngine.js';
import { shanten, effectiveDraws, standardWin } from '../dist/assets/core/HandAnalysis.js';
import { EventStore } from '../dist/assets/core/EventStore.js';
import { GameStateEngine } from '../dist/assets/core/GameStateEngine.js';
import { DecisionEngine } from '../dist/assets/core/DecisionEngine.js';
import { SpeechService } from '../dist/assets/services/SpeechService.js';
import { INITIAL_HAND } from '../dist/assets/core/constants.js';

const rules = new RulesEngine();
assert.equal(RULE_PROFILE.id, 'GD-SZ-DEFENSE-V1');
assert.equal(rules.canCall('CHI'), false);
assert.equal(new SpeechService().parse('吃七条').action, 'UNSUPPORTED');
assert.throws(() => rules.validateTiles(['1m', '1m', '1m', '1m', '1m']), /四张/);

const chicken = ['1m', '2m', '3m', '4m', '5m', '6m', '1p', '2p', '3p', '4s', '5s', '6s', 'east', 'east'];
assert(standardWin(chicken));
assert.equal(rules.analyzeWin(chicken, { method: 'RON' }).legal, false);
assert.deepEqual(rules.analyzeWin(chicken, { method: 'TSUMO' }).patterns[0], { name: '鸡胡', points: 2 });
const sevenPairs = ['1m', '1m', '2m', '2m', '3m', '3m', '4p', '4p', '5p', '5p', '6s', '6s', 'east', 'east'];
assert.equal(rules.analyzeWin(sevenPairs, { method: 'RON' }).patterns[0].name, '七小对');
const luxury = ['1m', '1m', '1m', '1m', '2m', '2m', '3m', '3m', '4p', '4p', '5p', '5p', 'east', 'east'];
assert.equal(rules.analyzeWin(luxury, { method: 'RON' }).patterns[0].name, '豪七');
const orphans = ['1m', '9m', '1p', '9p', '1s', '9s', 'east', 'south', 'west', 'north', 'red', 'green', 'white', 'east'];
assert.equal(rules.analyzeWin(orphans, { method: 'RON' }).patterns[0].name, '十三幺');
const dragons = ['red', 'red', 'red', 'green', 'green', 'green', 'white', 'white', 'white', '1m', '2m', '3m', 'east', 'east'];
assert(rules.analyzeWin(dragons, { method: 'RON' }).patterns.some((pattern) => pattern.name === '大三元'));
const winds = ['east', 'east', 'east', 'south', 'south', 'south', 'west', 'west', 'west', 'north', 'north', 'north', 'red', 'red'];
assert(rules.analyzeWin(winds, { method: 'RON' }).patterns.some((pattern) => pattern.name === '大四喜'));
const allTerminals = ['1m', '1m', '1m', '9m', '9m', '9m', '1p', '1p', '1p', '9p', '9p', '9p', '1s', '1s'];
assert(rules.analyzeWin(allTerminals, { method: 'RON' }).patterns.some((pattern) => pattern.name === '清幺九'));
const fourKongs = ['east', 'east'];
assert(rules.analyzeWin(fourKongs, { method: 'RON', melds: ['1m', '2m', '3m', '4m'].map((tile) => ({ type: 'KONG', tile, tiles: [tile, tile, tile, tile] })) }).patterns.some((pattern) => pattern.name === '十八罗汉'));
assert.equal(shanten(chicken.slice(0, 13)), 0);
assert.equal(shanten(chicken), -1);
assert(effectiveDraws(chicken.slice(0, 13)).usefulTiles.includes('east'));

const store = new EventStore('rule-test');
const game = new GameStateEngine(store, rules);
game.startGame({ tiles: INITIAL_HAND });
assert.throws(() => game.recordCall('left', 'CHI'), /不允许/);
assert.deepEqual(new SpeechService().parse('对家上家胡').actors, ['left', 'opposite']);
game.recordResponsePass('left', '2p', ['ron'], 'source-1');
assert(game.getState().responseLocks.some((lock) => lock.actor === 'left' && lock.tile === '2p' && lock.action === 'ron' && lock.active));
game.recordDiscard('9m'); game.recordDiscard('1p'); game.recordDiscard('7s');
game.recordDraw('8p');
const rec = new DecisionEngine(rules).analyze(game.getState());
assert.equal(rec.tile, '2p', '活动荣和锁应改变防守推荐');
assert.equal(rec.physicalPosition.text, '左边第七张');
assert.equal(rec.candidates.length, new Set(game.getState().myHand.map((item) => item.code)).size);
assert(rec.candidates.every((candidate) => candidate.opponents.length === 3));
assert.equal(rec.candidates.find((candidate) => candidate.tile === '2p').opponents.find((item) => item.actor === 'left').ronEstimate, 0);
game.recordRecommendation(rec);
const discard = game.recordDiscard('east', { actor: 'self' });
assert.equal(discard.metadata.discardMode, 'hand');
assert.equal(game.getState().currentPlayer, 'right');
const multi = game.recordMultipleRon(['opposite', 'left'], 'east', discard.id);
assert.deepEqual(multi.metadata.winners, ['opposite', 'left']);
assert.deepEqual(game.getState().winners, ['opposite', 'left']);
assert.equal(game.getState().responseLocks.find((lock) => lock.actor === 'left').active, true);

game.startGame({ tiles: INITIAL_HAND });
game.recordResponsePass('right', '9m', ['ron', 'pong'], 'source-2');
game.recordDiscard('9m', { discardMode: 'draw' });
assert(game.getState().responseLocks.find((lock) => lock.actor === 'right').active, true, '摸切不应清除旧响应锁');
game.recordDiscard('1p', { discardMode: 'hand' });
assert(game.getState().responseLocks.find((lock) => lock.actor === 'right').active, true);
game.recordDiscard('7s', { discardMode: 'hand' });
game.recordDraw('8p');
game.recordDiscard('east', { actor: 'self' });
game.recordDiscard('4m', { actor: 'right', discardMode: 'hand' });
assert(game.getState().responseLocks.filter((lock) => lock.actor === 'right').every((lock) => !lock.active), '手切应清除该家旧响应锁');

const pongStore = new EventStore('pong-test');
const pongGame = new GameStateEngine(pongStore, rules);
pongGame.startGame({ tiles: ['1m', '1m', '2m', '3m', '4m', '5m', '6m', '7m', '2p', '3p', '4p', 'east', 'east'] });
pongGame.recordDiscard('1m');
pongGame.recordCall('self', 'PONG');
assert.equal(pongGame.getState().myHand.length, 11);
assert.equal(pongGame.getState().melds[0].tiles.length, 3);
assert(new DecisionEngine(rules).analyze(pongGame.getState()));
pongGame.recordDiscard('east', { actor: 'self' });
pongGame.recordDiscard('9p'); pongGame.recordDiscard('9s'); pongGame.recordDiscard('8m');
pongGame.recordDraw('1m');
pongGame.recordCall('self', 'KONG', '1m');
assert.equal(pongGame.getState().myHand.length, 10);
assert.equal(pongGame.getState().melds.length, 1);
assert.equal(pongGame.getState().melds[0].kongKind, 'ADDED');
pongGame.recordDraw('8p');
assert.equal(pongGame.getState().myHand.length, 11);

console.log('Guangdong rule profile tests passed');

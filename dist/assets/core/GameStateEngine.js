import { INITIAL_HAND, NEXT_PLAYER } from './constants.js';

const emptyDiscards = () => ({ self: [], right: [], opposite: [], left: [] });

export class GameStateEngine {
  constructor(eventStore, rulesEngine) {
    this.store = eventStore;
    this.rules = rulesEngine;
    this.listeners = new Set();
    this.state = this.rebuild();
    this.store.subscribe(() => {
      this.state = this.rebuild();
      this.listeners.forEach((listener) => listener(this.state));
    });
  }

  baseState() {
    return {
      rules: 'shenzhen', round: 1, dealer: 'self', seat: 'east', currentPlayer: 'right', turn: 1,
      myHand: [], discardPiles: emptyDiscards(), melds: [], visibleTiles: [], unknownTileCounts: {},
      events: [], cameraState: 'idle', microphoneState: 'idle', audioOutputState: 'idle',
      lastRecommendation: null, started: false, paused: false, ended: false,
    };
  }

  rebuild() {
    const rawEvents = this.store.getEvents();
    const state = this.baseState();
    const voided = new Set();
    const replacements = new Map();
    rawEvents.filter((event) => event.type === 'CORRECTION').forEach((event) => {
      const targetId = event.metadata?.corrects;
      if (!targetId) return;
      if (event.metadata?.operation === 'UNDO') voided.add(targetId);
      if (event.metadata?.operation === 'REPLACE') replacements.set(targetId, event.tile);
    });

    rawEvents.forEach((original) => {
      if (original.type === 'CORRECTION' || voided.has(original.id)) return;
      const event = replacements.has(original.id) ? { ...original, tile: replacements.get(original.id) } : original;
      this.reduce(state, event);
    });
    state.events = rawEvents;
    state.visibleTiles = Object.values(state.discardPiles).flat().map((item) => item.tile);
    return state;
  }

  reduce(state, event) {
    switch (event.type) {
      case 'GAME_START':
        Object.assign(state, { ...event.metadata, started: true, ended: false, currentPlayer: event.metadata.currentPlayer || 'right' });
        break;
      case 'INITIAL_HAND':
        state.myHand = (event.tiles || []).map((code, index) => ({ uid: `${event.id}-${index}`, code }));
        break;
      case 'DRAW':
        if (event.actor === 'self') state.myHand.push({ uid: event.id, code: event.tile });
        state.currentPlayer = event.actor;
        break;
      case 'DISCARD': {
        if (event.actor === 'self') {
          const index = state.myHand.findIndex((tile) => tile.code === event.tile);
          if (index >= 0) state.myHand.splice(index, 1);
          state.turn += 1;
        }
        state.discardPiles[event.actor].push({ tile: event.tile, eventId: event.id });
        state.currentPlayer = NEXT_PLAYER[event.actor];
        break;
      }
      case 'CHI': case 'PONG': case 'KONG':
        state.melds.push({ actor: event.actor, type: event.type, tile: event.tile, tiles: event.tiles || [] });
        state.currentPlayer = event.actor;
        break;
      case 'RECOMMENDATION':
        state.lastRecommendation = event.metadata;
        break;
      case 'PAUSE': state.paused = true; break;
      case 'RESUME': state.paused = false; break;
      case 'WIN': case 'END_GAME': state.ended = true; break;
      default: break;
    }
  }

  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  getState() { return this.state; }

  startGame({ tiles = INITIAL_HAND, rules = 'shenzhen', seat = 'east', dealer = 'self' } = {}) {
    this.store.clear();
    this.store.appendMany([
      { actor: 'system', type: 'GAME_START', metadata: { rules, seat, dealer, currentPlayer: 'right', round: 1 } },
      { actor: 'self', type: 'INITIAL_HAND', tiles, source: 'VISION', confidence: 0.96 },
    ]);
  }

  recordDiscard(tile, { actor = this.state.currentPlayer, source = 'VOICE', confidence = 0.97 } = {}) {
    return this.store.append({
      actor, type: 'DISCARD', tile, source, confidence,
      metadata: actor === 'self' ? { recommendedDiscard: this.state.lastRecommendation?.tile || null, actualDiscard: tile } : {},
    });
  }

  recordDraw(tile, source = 'VISION') { return this.store.append({ actor: 'self', type: 'DRAW', tile, source, confidence: 0.95 }); }
  recordCall(actor, type, tile = null) { return this.store.append({ actor, type, tile, source: 'VOICE', confidence: 0.92 }); }
  recordRecommendation(recommendation) { return this.store.append({ actor: 'system', type: 'RECOMMENDATION', tile: recommendation.tile, metadata: recommendation }); }
  pause() { return this.store.append({ actor: 'system', type: 'PAUSE', source: 'MANUAL' }); }
  resume() { return this.store.append({ actor: 'system', type: 'RESUME', source: 'MANUAL' }); }
  endGame() { return this.store.append({ actor: 'system', type: 'END_GAME', source: 'MANUAL' }); }

  undoLast() {
    const inactive = new Set(this.store.getEvents().filter((e) => e.type === 'CORRECTION' && e.metadata?.operation === 'UNDO').map((e) => e.metadata.corrects));
    const target = [...this.store.getEvents()].reverse().find((event) => !['CORRECTION', 'GAME_START', 'INITIAL_HAND'].includes(event.type) && !inactive.has(event.id));
    if (!target) return null;
    return this.store.append({ actor: 'system', type: 'CORRECTION', source: 'MANUAL', metadata: { operation: 'UNDO', corrects: target.id, old: target.tile || target.type } });
  }

  correct(targetId, tile) {
    const target = this.store.getEvents().find((event) => event.id === targetId);
    if (!target) return null;
    return this.store.append({ actor: 'system', type: 'CORRECTION', tile, source: 'MANUAL', metadata: { operation: 'REPLACE', corrects: targetId, old: target.tile, next: tile } });
  }
}

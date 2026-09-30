export const PLAYERS = ['self', 'right', 'opposite', 'left'];

export const PLAYER_LABELS = {
  self: '我',
  right: '下家',
  opposite: '对家',
  left: '上家',
};

export const NEXT_PLAYER = {
  self: 'right',
  right: 'opposite',
  opposite: 'left',
  left: 'self',
};

export const TILE_LABELS = {
  '1m': '一万', '2m': '二万', '3m': '三万', '4m': '四万', '5m': '五万',
  '6m': '六万', '7m': '七万', '8m': '八万', '9m': '九万',
  '1p': '一筒', '2p': '二筒', '3p': '三筒', '4p': '四筒', '5p': '五筒',
  '6p': '六筒', '7p': '七筒', '8p': '八筒', '9p': '九筒',
  '1s': '一条', '2s': '二条', '3s': '三条', '4s': '四条', '5s': '五条',
  '6s': '六条', '7s': '七条', '8s': '八条', '9s': '九条',
  east: '东', south: '南', west: '西', north: '北', red: '红中', green: '发财', white: '白板',
};

export const TILE_GLYPHS = {
  '1m': '🀇', '2m': '🀈', '3m': '🀉', '4m': '🀊', '5m': '🀋', '6m': '🀌', '7m': '🀍', '8m': '🀎', '9m': '🀏',
  '1s': '🀐', '2s': '🀑', '3s': '🀒', '4s': '🀓', '5s': '🀔', '6s': '🀕', '7s': '🀖', '8s': '🀗', '9s': '🀘',
  '1p': '🀙', '2p': '🀚', '3p': '🀛', '4p': '🀜', '5p': '🀝', '6p': '🀞', '7p': '🀟', '8p': '🀠', '9p': '🀡',
  east: '🀀', south: '🀁', west: '🀂', north: '🀃', red: '🀄', green: '🀅', white: '🀆',
};

export const INITIAL_HAND = ['1m', '2m', '3m', '5m', '6m', '7m', '2p', '3p', '4p', '3s', '4s', '5s', 'east'];

export const EVENT_LABELS = {
  GAME_START: '开局', INITIAL_HAND: '初始手牌', DRAW: '摸牌', DISCARD: '打出',
  CHI: '吃', PONG: '碰', KONG: '杠', WIN: '胡', PASS: '过',
  RECOMMENDATION: '建议', CORRECTION: '纠错', PAUSE: '暂停', RESUME: '继续', END_GAME: '结束',
};

export function tileLabel(code) { return TILE_LABELS[code] || code || '—'; }
export function tileGlyph(code) { return TILE_GLYPHS[code] || '◻'; }

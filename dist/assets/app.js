import { AudioService } from './services/AudioService.js';
import { CameraService } from './services/CameraService.js';
import { SpeechService } from './services/SpeechService.js';
import { VisionService } from './services/VisionService.js';
import { DecisionEngine } from './core/DecisionEngine.js';
import { EventStore } from './core/EventStore.js';
import { GameStateEngine } from './core/GameStateEngine.js';
import { RulesEngine } from './core/RulesEngine.js';
import { EVENT_LABELS, INITIAL_HAND, PLAYER_LABELS, TILE_LABELS, tileGlyph, tileLabel } from './core/constants.js';

const app = document.querySelector('#app');
const eventStore = new EventStore();
const rulesEngine = new RulesEngine();
const game = new GameStateEngine(eventStore, rulesEngine);
const camera = new CameraService();
const vision = new VisionService();
const audio = new AudioService();
const speech = new SpeechService(() => audio.active);
const decision = new DecisionEngine();

const setup = {
  step: Number(sessionStorage.getItem('mahjong-setup-step') || 1),
  rule: 'shenzhen', seat: 'east', dealer: 'self',
  permissions: { camera: camera.state === 'ready', microphone: Boolean(speech.stream), audio: false, wake: false },
  initialHand: [...INITIAL_HAND],
};
const runtime = { lastMessage: '', speechFallback: false, wakeLock: null };
let toastTimer;

function route() {
  const path = location.pathname.replace(/\/$/, '') || '/';
  if (path.endsWith('/setup')) return 'setup';
  if (path.endsWith('/play')) return 'play';
  if (path.endsWith('/review')) return 'review';
  return 'home';
}
function navigate(path) { history.pushState({}, '', path); render(); }
function render() {
  app.className = `app-shell route-${route()}`;
  if (route() === 'setup') renderSetup();
  else if (route() === 'play') renderPlay();
  else if (route() === 'review') renderReview();
  else renderHome();
}

function renderHome() {
  speech.stop();
  const sessions = getSessions();
  app.innerHTML = `
    <main class="home">
      <div class="brand-row"><div class="brand-mark" aria-hidden="true">中</div><div class="status-chip"><span class="pulse"></span>设备端原型</div></div>
      <section class="home-intro"><div class="eyebrow">Realtime Mahjong Copilot</div><h1>AI 麻将<br />助手</h1><p>看住你的手牌，听懂牌桌变化，在你摸牌后立即给出清楚的出牌建议。</p></section>
      <section class="start-card" aria-label="开始牌局">
        <div class="start-meta"><span>深圳麻将 · 标准模式</span><span>约 1 分钟设置</span></div>
        <button class="primary-btn" id="start-game"><span>开始新牌局</span><span class="button-icon">›</span></button>
        <nav class="home-nav" aria-label="其他功能"><button type="button" data-toast="设置会在牌局中随时可用">设置</button><button type="button" id="recognition-test">识别测试</button><button type="button" id="history-button">历史记录${sessions.length ? ` · ${sessions.length}` : ''}</button></nav>
      </section>
      ${sessions.length ? `<section class="recent-games"><div class="section-kicker">最近牌局</div>${sessions.slice(0, 2).map((session) => `<button data-review-session="${session.id}"><span>${formatDate(session.endedAt)}</span><b>${session.turns} 巡</b></button>`).join('')}</section>` : ''}
      <div class="toast" id="toast" role="status"></div>
    </main>`;
  byId('start-game').onclick = () => { setup.step = 1; sessionStorage.setItem('mahjong-setup-step', '1'); navigate('/setup'); };
  byId('recognition-test').onclick = () => { setup.step = 4; sessionStorage.setItem('mahjong-setup-step', '4'); navigate('/setup'); };
  byId('history-button').onclick = () => sessions.length ? navigate('/review') : showToast('还没有已保存的牌局');
  document.querySelectorAll('[data-toast]').forEach((button) => button.onclick = () => showToast(button.dataset.toast));
  document.querySelectorAll('[data-review-session]').forEach((button) => button.onclick = () => navigate('/review'));
}

function renderSetup() {
  speech.stop();
  const steps = ['规则', '座位', '权限', '校准', '手牌'];
  app.innerHTML = `
    <main class="setup-page">
      <header class="setup-header"><button class="icon-btn" id="setup-back" aria-label="返回">‹</button><div class="setup-progress" aria-label="设置进度">${steps.map((label, index) => `<span class="${index + 1 <= setup.step ? 'active' : ''}"></span>`).join('')}</div><span class="step-count">${setup.step}/5</span></header>
      <section class="setup-content">${setupStepTemplate()}</section>
      <footer class="setup-footer">${setup.step > 1 ? '<button class="secondary-btn" id="previous-step">上一步</button>' : ''}<button class="primary-btn compact" id="next-step" ${canContinueSetup() ? '' : 'disabled'}>${setup.step === 5 ? '开始牌局' : '下一步'}<span>›</span></button></footer>
      <dialog class="tile-dialog" id="tile-picker"></dialog><div class="toast" id="toast" role="status"></div>
    </main>`;
  byId('setup-back').onclick = () => setup.step > 1 ? changeSetupStep(-1) : navigate('/');
  if (byId('previous-step')) byId('previous-step').onclick = () => changeSetupStep(-1);
  byId('next-step').onclick = () => setup.step === 5 ? startGame() : changeSetupStep(1);
  bindSetupStep();
}

function setupStepTemplate() {
  if (setup.step === 1) return `
    <div class="setup-title"><span class="section-kicker">STEP 01</span><h2>选择麻将规则</h2><p>原型先使用深圳麻将，规则引擎已独立封装。</p></div>
    <div class="choice-list">${[['shenzhen', '深圳麻将', 'MVP 可用'], ['guangdong', '广东麻将', '即将支持'], ['national', '国标麻将', '即将支持'], ['custom', '自定义', '即将支持']].map(([value, label, note]) => `<button class="choice-row ${setup.rule === value ? 'selected' : ''} ${value !== 'shenzhen' ? 'disabled' : ''}" data-rule="${value}" ${value !== 'shenzhen' ? 'disabled' : ''}><span class="radio-dot"></span><span><b>${label}</b><small>${note}</small></span></button>`).join('')}</div>`;
  if (setup.step === 2) return `
    <div class="setup-title"><span class="section-kicker">STEP 02</span><h2>确认你的位置</h2><p>系统会按牌桌方向自动推算下一位出牌者。</p></div>
    <div class="seat-map"><button data-seat="north" class="seat top ${setup.seat === 'north' ? 'selected' : ''}">北<span>对家</span></button><button data-seat="west" class="seat left ${setup.seat === 'west' ? 'selected' : ''}">西<span>上家</span></button><div class="table-mark">牌桌</div><button data-seat="east" class="seat bottom ${setup.seat === 'east' ? 'selected' : ''}">东<span>我</span></button><button data-seat="south" class="seat right ${setup.seat === 'south' ? 'selected' : ''}">南<span>下家</span></button></div>
    <label class="field-label" for="dealer-select">庄家是谁？</label><select class="select-control" id="dealer-select"><option value="self">我</option><option value="right">下家</option><option value="opposite">对家</option><option value="left">上家</option></select>`;
  if (setup.step === 3) return `
    <div class="setup-title"><span class="section-kicker">STEP 03</span><h2>检查设备权限</h2><p>摄像头与麦克风会在浏览器内同时保持运行。</p></div>
    <div class="permission-list">${permissionRow('camera', '摄像头', '观察手牌', '允许摄像头')}${permissionRow('microphone', '麦克风', '听取出牌', '允许麦克风')}${permissionRow('audio', '音频播放', '播报建议', '测试扬声器')}${permissionRow('wake', '屏幕常亮', '避免牌局中锁屏', '保持常亮')}</div>
    <p class="privacy-note">视频不会持续上传。原型中的牌面识别在本机以 Mock 事件模拟。</p>`;
  if (setup.step === 4) return `
    <div class="setup-title"><span class="section-kicker">STEP 04</span><h2>校准摄像头</h2><p>请让全部手牌落在框内，并保持机位稳定。</p></div>
    <div class="camera-frame"><video id="camera-preview" autoplay muted playsinline></video><div class="camera-placeholder"><span>摄像头预览</span><small>允许权限后显示实时画面</small></div><div class="roi"><span>请将手牌放在这里</span><div>${INITIAL_HAND.slice(0, 8).map(tileGlyph).join(' ')}</div></div><span class="camera-live">LIVE</span></div>
    <div class="calibration-status"><span>✓ 画面稳定</span><span>✓ 光线正常</span><span>✓ 检测到 13 张牌</span></div><button class="secondary-btn full" id="scan-hand">模拟扫描 13 张手牌</button>`;
  return `
    <div class="setup-title"><span class="section-kicker">STEP 05</span><h2>确认初始手牌</h2><p>从左到右保留物理位置。点任意牌可手动修改。</p></div>
    <div class="scan-summary"><span><b>识别完成</b><small>置信度 96% · 13 张</small></span><span class="success-badge">稳定</span></div>
    <div class="initial-hand-grid">${setup.initialHand.map((tile, index) => tileButton(tile, index, true)).join('')}</div><div class="hand-order"><span>左</span><div></div><span>右</span></div>
    <div class="confirm-note"><span>✓</span><p><b>请务必核对一次</b><small>初始手牌会成为整局状态的基准。</small></p></div><button class="text-btn" id="rescan-hand">重新扫描</button>`;
}

function permissionRow(key, title, note, action) {
  const ready = setup.permissions[key];
  return `<div class="permission-row"><span class="permission-icon">${{ camera: '▣', microphone: '◉', audio: '◖', wake: '☀' }[key]}</span><span class="permission-copy"><b>${title}</b><small>${note}</small></span>${ready ? '<span class="permission-ok">✓ 已就绪</span>' : `<button data-permission="${key}">${action}</button>`}</div>`;
}
function bindSetupStep() {
  document.querySelectorAll('[data-rule]').forEach((button) => button.onclick = () => { setup.rule = button.dataset.rule; renderSetup(); });
  document.querySelectorAll('[data-seat]').forEach((button) => button.onclick = () => { setup.seat = button.dataset.seat; renderSetup(); });
  if (byId('dealer-select')) { byId('dealer-select').value = setup.dealer; byId('dealer-select').onchange = (event) => setup.dealer = event.target.value; }
  document.querySelectorAll('[data-permission]').forEach((button) => button.onclick = () => requestPermission(button.dataset.permission));
  if (byId('scan-hand')) byId('scan-hand').onclick = async () => { byId('scan-hand').disabled = true; byId('scan-hand').textContent = '正在识别…'; const result = await vision.detectHand(); setup.initialHand = result.tiles; showToast('已检测到 13 张牌'); setTimeout(() => changeSetupStep(1), 350); };
  if (byId('camera-preview')) { camera.attach(byId('camera-preview')); if (!camera.stream) camera.request(byId('camera-preview')).then(() => setup.permissions.camera = true).catch(() => showToast('摄像头未开启，可继续使用 Mock 模式')); }
  document.querySelectorAll('[data-initial-index]').forEach((button) => button.onclick = () => showTilePicker((tile) => { setup.initialHand[Number(button.dataset.initialIndex)] = tile; renderSetup(); }, `修改第 ${Number(button.dataset.initialIndex) + 1} 张`));
  if (byId('rescan-hand')) byId('rescan-hand').onclick = () => { setup.step = 4; renderSetup(); };
}
function canContinueSetup() { return setup.step !== 3 || (setup.permissions.camera && setup.permissions.microphone && setup.permissions.audio); }
async function requestPermission(key) {
  try {
    if (key === 'camera') await camera.request();
    if (key === 'microphone') await speech.requestPermission();
    if (key === 'audio') await audio.test();
    if (key === 'wake') { if ('wakeLock' in navigator) runtime.wakeLock = await navigator.wakeLock.request('screen'); else showToast('浏览器不支持常亮锁，建议关闭自动锁屏'); }
    setup.permissions[key] = true; renderSetup();
  } catch (error) { showToast(error?.message || `${key} 权限未开启`); }
}
function changeSetupStep(delta) { setup.step = Math.max(1, Math.min(5, setup.step + delta)); sessionStorage.setItem('mahjong-setup-step', String(setup.step)); renderSetup(); }
function startGame() { game.startGame({ tiles: setup.initialHand, rules: setup.rule, seat: setup.seat, dealer: setup.dealer }); navigate('/play'); }

function renderPlay() {
  const state = game.getState();
  if (!state.started) { navigate('/setup'); return; }
  const recommendation = state.lastRecommendation;
  app.innerHTML = `
    <main class="play-page">
      <header class="play-header"><div><span class="round-label">第 ${state.turn} 巡</span><small>${rulesEngine.getName()}</small></div><div class="header-actions"><button class="icon-btn" id="settings" aria-label="设置">⚙</button><button class="icon-btn ${state.paused ? 'active' : ''}" id="pause" aria-label="暂停">${state.paused ? '▶' : 'Ⅱ'}</button></div></header>
      <section class="table-zone" aria-label="牌桌状态">${playerSeat('opposite', state)}${playerSeat('left', state)}${playerSeat('right', state)}<div class="table-center"><span>当前</span><b>${PLAYER_LABELS[state.currentPlayer]}</b><i></i></div></section>
      <section class="hand-panel"><div class="panel-heading"><span><b>我的手牌</b><small>从左到右</small></span><strong>${state.myHand.length}<small> 张</small></strong></div><div class="hand-row">${state.myHand.map((tile, index) => tileButton(tile.code, index)).join('')}</div><div class="vision-line"><span class="camera-dot"></span><b>手牌识别正常</b><span>${state.myHand.length} 张 · 画面稳定</span><video id="play-camera" muted playsinline></video></div></section>
      ${recommendation && state.currentPlayer === 'self' && state.myHand.length === 14 ? recommendationCard(recommendation) : waitingCard(state)}
      <section class="listen-panel"><div class="listen-state"><span class="listen-orb ${audio.active ? 'locked' : ''}">${audio.active ? '🔊' : '🎤'}</span><span><b>${audio.active ? '正在播报 · 语音录入已锁定' : speech.listening ? '正在监听' : '麦克风待启动'}</b><small>${runtime.lastMessage || `当前：${PLAYER_LABELS[state.currentPlayer]}${state.currentPlayer === 'self' ? '摸牌' : '出牌'}`}</small></span></div><form class="speech-input" id="speech-form"><input id="speech-text" autocomplete="off" placeholder="也可输入：七条 / 对家碰 / 撤销" aria-label="输入语音命令" /><button>记录</button></form><div class="sim-row">${simulationControls(state)}</div></section>
      <nav class="play-nav"><button id="undo"><span>↶</span>撤销</button><button id="correct"><span>✎</span>纠正</button><button id="log"><span>≡</span>记录</button><button id="end"><span>■</span>结束</button></nav>
      ${state.paused ? '<div class="pause-overlay"><div><span>Ⅱ</span><h2>牌局已暂停</h2><p>摄像头仍可预览，语音事件停止记录。</p><button class="primary-btn" id="resume">继续牌局</button></div></div>' : ''}
      <dialog class="sheet-dialog" id="event-log">${eventLogTemplate(state.events)}</dialog><dialog class="sheet-dialog" id="settings-dialog">${settingsTemplate()}</dialog><dialog class="confirm-dialog" id="confirm-dialog"></dialog><dialog class="tile-dialog" id="tile-picker"></dialog><div class="toast" id="toast" role="status"></div>
    </main>`;
  bindPlay(state);
  if (camera.stream) camera.attach(byId('play-camera'));
  ensureSpeech();
}

function playerSeat(player, state) {
  const discards = state.discardPiles[player];
  return `<div class="player-seat seat-${player} ${state.currentPlayer === player ? 'current' : ''}"><span class="player-name"><i></i>${PLAYER_LABELS[player]}</span><div class="mini-river">${discards.length ? discards.slice(-6).map((item) => `<span title="${tileLabel(item.tile)}">${tileGlyph(item.tile)}</span>`).join('') : '<small>等待出牌</small>'}</div></div>`;
}
function recommendationCard(rec) {
  return `<section class="recommendation-card"><div class="recommend-top"><span class="section-kicker">推荐出牌</span><span class="risk-badge">风险 ${rec.risk}</span></div><div class="recommend-main"><span class="hero-tile">${tileGlyph(rec.tile)}</span><div><h2>${tileLabel(rec.tile)}</h2><b>${rec.physicalPosition.text}</b></div></div><div class="decision-meta"><span><small>向听</small><b>${rec.shanten}</b></span><span><small>有效牌</small><b>${rec.usefulTiles.length} 种</b></span><span><small>剩余</small><b>${rec.remainingCount} 张</b></span></div><button class="why-btn" id="why">为什么？</button></section>`;
}
function waitingCard(state) {
  const selfTurn = state.currentPlayer === 'self';
  return `<section class="waiting-card"><span class="waiting-icon">${selfTurn ? '◫' : '···'}</span><div><span class="section-kicker">${selfTurn ? '等待摸牌' : '牌桌进行中'}</span><h3>${selfTurn ? '请将摸到的牌放在最右侧' : `等待${PLAYER_LABELS[state.currentPlayer]}出牌`}</h3><p>${selfTurn ? '检测到 14 张后会自动计算建议。' : '只需说出牌名，系统会自动归属当前玩家。'}</p></div></section>`;
}
function simulationControls(state) {
  if (state.currentPlayer === 'self' && state.myHand.length === 13) return '<button type="button" data-sim="draw">模拟摸八筒</button>';
  if (state.currentPlayer === 'self' && state.myHand.length === 14) return `<button type="button" data-sim="discard" data-tile="${state.lastRecommendation?.tile || 'east'}">模拟按建议出牌</button><button type="button" data-sim="discard" data-tile="6m">模拟改打六万</button>`;
  return '<button type="button" data-sim="sequence">演示下一步</button><button type="button" data-sim="call">模拟碰牌</button>';
}
function bindPlay(state) {
  byId('speech-form').onsubmit = (event) => { event.preventDefault(); const input = byId('speech-text'); handleSpeech({ ...speech.parse(input.value), confidence: 0.99, text: input.value }, 'MANUAL'); input.value = ''; };
  document.querySelectorAll('[data-sim]').forEach((button) => button.onclick = () => runSimulation(button.dataset.sim, button.dataset.tile));
  byId('pause').onclick = () => state.paused ? game.resume() : game.pause();
  if (byId('resume')) byId('resume').onclick = () => game.resume();
  byId('undo').onclick = () => confirmAction('撤销上一事件？', describeLastAction(), '确认撤销', () => { game.undoLast(); showToast('已撤销，牌局状态已重算'); });
  byId('correct').onclick = openCorrection;
  byId('log').onclick = () => byId('event-log').showModal();
  byId('settings').onclick = () => byId('settings-dialog').showModal();
  byId('end').onclick = () => confirmAction('结束当前牌局？', '结束后仍可在复盘中查看完整事件。', '结束本局', finishGame);
  if (byId('why')) byId('why').onclick = () => showToast(state.lastRecommendation.reason);
  document.querySelectorAll('[data-close-dialog]').forEach((button) => button.onclick = () => button.closest('dialog').close());
  document.querySelectorAll('[data-audio-mode]').forEach((button) => button.onclick = () => { audio.setMode(button.dataset.audioMode); renderPlay(); });
}
async function ensureSpeech() {
  const state = game.getState();
  if (state.paused || speech.listening) return;
  try {
    const result = await speech.start((parsed) => handleSpeech(parsed, 'VOICE'), () => showToast('语音识别暂时不可用，可使用文字输入'));
    runtime.speechFallback = result.fallback;
    if (result.fallback) showToast('浏览器不支持连续识别，请使用文字输入');
    const node = document.querySelector('.listen-state b'); if (node) node.textContent = result.fallback ? '麦克风已授权 · 使用文字输入' : '正在监听';
  } catch { showToast('麦克风未开启，可使用文字输入继续'); }
}

function handleSpeech(parsed, source = 'VOICE') {
  const state = game.getState();
  if (state.paused) { showToast('牌局已暂停'); return; }
  if (source === 'VOICE' && audio.active) return;
  if (!parsed.action || parsed.confidence < 0.72) { openLowConfidence(parsed); return; }
  if (parsed.action === 'UNDO') { game.undoLast(); showToast('已撤销上一事件'); return; }
  if (parsed.action === 'PAUSE') { game.pause(); return; }
  if (parsed.action === 'RESUME') { game.resume(); return; }
  if (parsed.action === 'END_GAME') { finishGame(); return; }
  if (parsed.action === 'RESCAN') { showToast('已请求重新识别手牌'); return; }
  if (parsed.action === 'DISCARD' && parsed.tile) {
    const actor = parsed.actor || state.currentPlayer;
    runtime.lastMessage = `已记录：${PLAYER_LABELS[actor]} → ${tileLabel(parsed.tile)} ✓`;
    game.recordDiscard(parsed.tile, { actor, source, confidence: parsed.confidence });
    showToast(runtime.lastMessage); return;
  }
  if (['PONG', 'KONG', 'CHI', 'WIN', 'PASS'].includes(parsed.action)) {
    if (!parsed.actor && ['PONG', 'KONG', 'CHI'].includes(parsed.action)) { openActorChoice(parsed.action, parsed.tile); return; }
    const actor = parsed.actor || state.currentPlayer; runtime.lastMessage = `已记录：${PLAYER_LABELS[actor]} → ${EVENT_LABELS[parsed.action]}`; game.recordCall(actor, parsed.action, parsed.tile);
  }
}

async function runSimulation(action, tile) {
  if (action === 'draw') {
    const detected = await vision.detectDraw('8p'); runtime.lastMessage = `检测到摸牌：${tileLabel(detected.tile)} · 正在计算建议`; game.recordDraw(detected.tile);
    const rec = decision.analyze(game.getState());
    if (rec) { runtime.lastMessage = `检测到摸牌：${tileLabel(detected.tile)} · 已生成建议`; game.recordRecommendation(rec); await audio.speak(audio.recommendationText(rec)); renderPlay(); }
    return;
  }
  if (action === 'discard') {
    const detected = await vision.detectDiscard(tile); const recommended = game.getState().lastRecommendation?.tile;
    runtime.lastMessage = recommended === tile ? `✓ 我打出${tileLabel(tile)}` : `实际：${tileLabel(tile)} · 推荐：${tileLabel(recommended)}`;
    game.recordDiscard(detected.tile, { actor: 'self', source: 'VISION', confidence: detected.confidence });
    showToast(runtime.lastMessage); return;
  }
  if (action === 'call') { openActorChoice('PONG'); return; }
  const nextTiles = { right: '9m', opposite: '1p', left: '7s' }; const current = game.getState().currentPlayer;
  handleSpeech({ action: 'DISCARD', tile: nextTiles[current] || '7s', actor: null, confidence: 0.99, text: tileLabel(nextTiles[current]) }, 'MANUAL');
}

function openActorChoice(action, tile = null) {
  const dialog = byId('confirm-dialog');
  dialog.innerHTML = `<div class="dialog-body"><span class="section-kicker">需要确认</span><h3>谁${EVENT_LABELS[action]}？</h3><div class="actor-grid">${['left', 'opposite', 'right'].map((actor) => `<button data-actor="${actor}">${PLAYER_LABELS[actor]}</button>`).join('')}</div><button class="text-btn" data-close-dialog>取消</button></div>`;
  dialog.querySelectorAll('[data-actor]').forEach((button) => button.onclick = () => { game.recordCall(button.dataset.actor, action, tile); runtime.lastMessage = `${PLAYER_LABELS[button.dataset.actor]} → ${EVENT_LABELS[action]}`; dialog.close(); });
  dialog.querySelector('[data-close-dialog]').onclick = () => dialog.close(); dialog.showModal();
}
function openLowConfidence(parsed) {
  const dialog = byId('confirm-dialog'); if (!dialog) return;
  dialog.innerHTML = `<div class="dialog-body"><span class="section-kicker">语音置信度较低</span><h3>听到：“${escapeHtml(parsed.text || '未识别')}”？</h3><p>未修改牌局状态，请确认后再记录。</p><div class="dialog-actions"><button class="secondary-btn" data-close-dialog>取消</button>${parsed.tile ? `<button class="primary-btn compact" id="confirm-heard">确认 ${tileLabel(parsed.tile)}</button>` : ''}</div></div>`;
  dialog.querySelector('[data-close-dialog]').onclick = () => dialog.close();
  if (byId('confirm-heard')) byId('confirm-heard').onclick = () => { dialog.close(); handleSpeech({ ...parsed, confidence: 1 }, 'MANUAL'); };
  dialog.showModal();
}
function openCorrection() {
  const corrected = new Set(eventStore.getEvents().filter((event) => event.type === 'CORRECTION').map((event) => event.metadata?.corrects));
  const target = [...eventStore.getEvents()].reverse().find((event) => event.tile && ['DISCARD', 'DRAW'].includes(event.type) && !corrected.has(event.id));
  if (!target) { showToast('暂无可纠正的牌面事件'); return; }
  showTilePicker((tile) => { game.correct(target.id, tile); showToast(`已将${tileLabel(target.tile)}纠正为${tileLabel(tile)}`); }, `纠正：${PLAYER_LABELS[target.actor]} · ${tileLabel(target.tile)}`);
}
function confirmAction(title, copy, confirmLabel, callback) {
  const dialog = byId('confirm-dialog');
  dialog.innerHTML = `<div class="dialog-body"><span class="section-kicker">请确认</span><h3>${title}</h3><p>${copy}</p><div class="dialog-actions"><button class="secondary-btn" data-close-dialog>继续牌局</button><button class="danger-btn" id="dialog-confirm">${confirmLabel}</button></div></div>`;
  dialog.querySelector('[data-close-dialog]').onclick = () => dialog.close(); byId('dialog-confirm').onclick = () => { dialog.close(); callback(); }; dialog.showModal();
}
function finishGame() {
  if (!game.getState().ended) game.endGame();
  const state = game.getState(); const session = { id: state.events[0]?.id || String(Date.now()), endedAt: new Date().toISOString(), turns: state.turn, events: state.events };
  const sessions = getSessions().filter((item) => item.id !== session.id); sessions.unshift(session); localStorage.setItem('mahjong-sessions', JSON.stringify(sessions.slice(0, 10)));
  speech.stop(); navigate('/review');
}

function eventLogTemplate(events) {
  return `<div class="sheet-handle"></div><div class="sheet-head"><div><span class="section-kicker">EVENT SOURCE</span><h3>牌局记录</h3></div><button class="icon-btn" data-close-dialog>×</button></div><div class="event-list">${events.length ? events.map((event, index) => eventRow(event, index)).join('') : '<p class="empty-state">暂无记录</p>'}</div>`;
}
function eventRow(event, index) {
  const number = String(index + 1).padStart(2, '0');
  const copy = event.type === 'INITIAL_HAND' ? `识别 ${event.tiles.length} 张初始手牌` : event.type === 'CORRECTION' ? event.metadata?.operation === 'UNDO' ? `撤销事件 · ${tileLabel(event.metadata.old)}` : `${tileLabel(event.metadata?.old)} → ${tileLabel(event.tile)}` : event.type === 'RECOMMENDATION' ? `推荐 ${tileLabel(event.tile)} · ${event.metadata.physicalPosition?.text || ''}` : `${PLAYER_LABELS[event.actor] || '系统'} ${EVENT_LABELS[event.type] || event.type}${event.tile ? ` ${tileLabel(event.tile)}` : ''}`;
  return `<div class="event-row"><span>${number}</span><div><b>${copy}</b><small>${event.source} · ${formatTime(event.timestamp)}${event.confidence < 1 ? ` · ${Math.round(event.confidence * 100)}%` : ''}</small></div></div>`;
}
function settingsTemplate() {
  return `<div class="sheet-handle"></div><div class="sheet-head"><div><span class="section-kicker">AUDIO</span><h3>播报模式</h3></div><button class="icon-btn" data-close-dialog>×</button></div><div class="mode-list">${[['quick', '快速', '“东。”'], ['standard', '标准', '“打东，右边第二张。”'], ['coach', '教练', '附带向听与有效牌说明']].map(([value, title, copy]) => `<button data-audio-mode="${value}" class="${audio.mode === value ? 'selected' : ''}"><span><b>${title}</b><small>${copy}</small></span><i></i></button>`).join('')}</div>`;
}

function renderReview() {
  speech.stop();
  const state = game.getState(); const events = state.events.length ? state.events : (getSessions()[0]?.events || []);
  const voided = new Set(events.filter((event) => event.type === 'CORRECTION' && event.metadata?.operation === 'UNDO').map((event) => event.metadata.corrects));
  const activeEvents = events.filter((event) => !voided.has(event.id));
  const recommendations = activeEvents.filter((event) => event.type === 'RECOMMENDATION'); const selfDiscards = activeEvents.filter((event) => event.type === 'DISCARD' && event.actor === 'self');
  const followed = selfDiscards.filter((event) => event.metadata?.recommendedDiscard && event.metadata.recommendedDiscard === event.tile).length; const corrected = events.filter((event) => event.type === 'CORRECTION').length; const turns = Math.max(1, selfDiscards.length || state.turn - 1);
  const endedAt = [...events].reverse().find((event) => event.type === 'END_GAME')?.timestamp || new Date().toISOString();
  app.innerHTML = `<main class="review-page"><header class="review-header"><button class="icon-btn" id="review-home">×</button><span>本局复盘</span><button class="icon-btn" id="review-share" aria-label="分享">↗</button></header><section class="review-hero"><span class="section-kicker">GAME COMPLETE</span><h1>本局完成</h1><p>${formatDate(endedAt)} · 深圳麻将</p></section><section class="score-card"><div class="score-main"><span>${turns}</span><small>总巡数</small></div><div class="score-grid"><span><b>${recommendations.length}</b><small>系统建议</small></span><span><b>${followed}</b><small>按照建议</small></span><span><b>${Math.max(0, selfDiscards.length - followed)}</b><small>自行选择</small></span><span><b>${corrected}</b><small>识别纠错</small></span></div></section><section class="review-events"><div class="panel-heading"><span><b>完整事件记录</b><small>${events.length} 个事件 · 可追溯</small></span></div><div class="event-list">${events.map((event, index) => eventRow(event, index)).join('')}</div></section><button class="primary-btn" id="new-game">开始新牌局<span>›</span></button><div class="toast" id="toast" role="status"></div></main>`;
  byId('review-home').onclick = () => navigate('/'); byId('new-game').onclick = () => { setup.step = 1; navigate('/setup'); };
  byId('review-share').onclick = async () => { const text = `AI 麻将助手：本局 ${turns} 巡，获得 ${recommendations.length} 次建议。`; if (navigator.share) await navigator.share({ title: '本局复盘', text }).catch(() => {}); else { await navigator.clipboard?.writeText(text); showToast('复盘摘要已复制'); } };
}

function showTilePicker(callback, title = '选择牌面') {
  const dialog = byId('tile-picker'); if (!dialog) return; const groups = [['万', 'm'], ['筒', 'p'], ['条', 's']];
  dialog.innerHTML = `<div class="sheet-head"><div><span class="section-kicker">MANUAL EDIT</span><h3>${title}</h3></div><button class="icon-btn" data-close-dialog>×</button></div><div class="picker-groups">${groups.map(([label, suit]) => `<div><b>${label}</b><div>${Array.from({ length: 9 }, (_, index) => `<button data-pick-tile="${index + 1}${suit}">${tileGlyph(`${index + 1}${suit}`)}<small>${index + 1}</small></button>`).join('')}</div></div>`).join('')}<div><b>字</b><div>${['east', 'south', 'west', 'north', 'red', 'green', 'white'].map((tile) => `<button data-pick-tile="${tile}">${tileGlyph(tile)}<small>${tileLabel(tile)}</small></button>`).join('')}</div></div></div>`;
  dialog.querySelector('[data-close-dialog]').onclick = () => dialog.close(); dialog.querySelectorAll('[data-pick-tile]').forEach((button) => button.onclick = () => { dialog.close(); callback(button.dataset.pickTile); }); dialog.showModal();
}
function tileButton(tile, index, editable = false) { return `<button class="mahjong-tile ${editable ? 'editable' : ''}" ${editable ? `data-initial-index="${index}"` : 'tabindex="-1"'} aria-label="${tileLabel(tile)}"><span>${tileGlyph(tile)}</span>${editable ? `<small>${index + 1}</small>` : ''}</button>`; }
function describeLastAction() { const event = [...eventStore.getEvents()].reverse().find((item) => !['CORRECTION', 'GAME_START', 'INITIAL_HAND'].includes(item.type)); return event ? `${PLAYER_LABELS[event.actor] || '系统'} → ${EVENT_LABELS[event.type] || event.type}${event.tile ? ` ${tileLabel(event.tile)}` : ''}` : '暂无可撤销事件'; }
function getSessions() { try { return JSON.parse(localStorage.getItem('mahjong-sessions') || '[]'); } catch { return []; } }
function byId(id) { return document.getElementById(id); }
function formatTime(value) { return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value)); }
function formatDate(value) { return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
function escapeHtml(value) { const node = document.createElement('div'); node.textContent = value; return node.innerHTML; }
function showToast(message) { const toast = byId('toast'); if (!toast) return; toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2200); }

game.subscribe(() => { if (route() === 'play') renderPlay(); });
audio.subscribe(() => { if (route() === 'play') renderPlay(); });
addEventListener('popstate', render);
document.addEventListener('visibilitychange', async () => { if (document.visibilityState === 'visible' && setup.permissions.wake && 'wakeLock' in navigator) runtime.wakeLock = await navigator.wakeLock.request('screen').catch(() => null); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
render();

function registerWebMcp() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  const register = (tool) => Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {});
  register({
    name: 'read_mahjong_game_state', title: '读取当前牌局',
    description: '读取当前出牌者、手牌数量、最近建议和事件数量，不修改牌局。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute() {
      const state = game.getState();
      return { currentPlayer: state.currentPlayer, handCount: state.myHand.length, recommendation: state.lastRecommendation?.tile || null, eventCount: state.events.length, paused: state.paused };
    },
  });
  register({
    name: 'start_mock_mahjong_game', title: '开始模拟牌局',
    description: '使用已确认的默认 13 张手牌和深圳麻将规则开始一局 Mock 牌局，并打开实时牌局页面。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute() {
      game.startGame({ tiles: INITIAL_HAND, rules: 'shenzhen', seat: 'east', dealer: 'self' });
      navigate('/play');
      return { started: true, currentPlayer: game.getState().currentPlayer, handCount: game.getState().myHand.length };
    },
  });
  register({
    name: 'record_mahjong_discard', title: '记录出牌',
    description: '按当前回合归属记录一张对手或自己的弃牌，并刷新可见牌局状态。',
    inputSchema: { type: 'object', properties: { tile: { type: 'string', enum: Object.keys(TILE_LABELS) } }, required: ['tile'], additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute(input) {
      if (!input || !TILE_LABELS[input.tile]) throw new Error('tile 必须是有效麻将牌代码');
      const actor = game.getState().currentPlayer;
      const event = game.recordDiscard(input.tile, { actor, source: 'SYSTEM', confidence: 1 });
      return { eventId: event.id, actor, tile: input.tile, nextPlayer: game.getState().currentPlayer };
    },
  });
}

registerWebMcp();

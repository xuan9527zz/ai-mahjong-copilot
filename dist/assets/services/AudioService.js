import { tileLabel } from '../core/constants.js';

export class AudioService {
  constructor() { this.active = false; this.mode = localStorage.getItem('mahjong-audio-mode') || 'standard'; this.listeners = new Set(); }
  setMode(mode) { this.mode = mode; localStorage.setItem('mahjong-audio-mode', mode); }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  setActive(active) { this.active = active; this.listeners.forEach((listener) => listener(active)); }

  recommendationText(recommendation) {
    const tile = tileLabel(recommendation.tile);
    if (this.mode === 'quick') return `${tile}。`;
    if (this.mode === 'coach') return `打${tile}，${recommendation.physicalPosition.text}。${recommendation.reason}`;
    return `打${tile}，${recommendation.physicalPosition.text}。`;
  }

  speak(text) {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) { resolve(false); return; }
      speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN'; utterance.rate = 1.04; utterance.pitch = 1;
      utterance.onstart = () => this.setActive(true);
      const finish = () => setTimeout(() => { this.setActive(false); resolve(true); }, 300);
      utterance.onend = finish; utterance.onerror = finish;
      speechSynthesis.speak(utterance);
    });
  }

  test() { return this.speak('麻将助手音频测试。'); }
}

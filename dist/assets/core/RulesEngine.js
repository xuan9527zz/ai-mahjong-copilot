export class RulesEngine {
  constructor(rule = 'shenzhen') { this.rule = rule; }
  getName() { return this.rule === 'shenzhen' ? '深圳麻将' : '自定义规则'; }
  canCall(action) { return ['CHI', 'PONG', 'KONG', 'PASS', 'WIN'].includes(action); }
  nextRound(round) { return Number(round || 0) + 1; }
}

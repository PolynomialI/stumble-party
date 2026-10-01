import type { Room } from '@colyseus/sdk';
import { MAPS, MAX_ROUNDS, STATUS, TICK_RATE, type MapDef } from '@sp/shared';
import { sound } from '../audio/sound';
import type { OnlineGame } from '../game/OnlineGame';

interface PlayerView {
  id: string;
  name: string;
  status: number;
  place: number;
  bot: boolean;
  points: number;
  it: boolean;
}

interface StateView {
  phase: string;
  phaseEnd: number;
  round: number;
  rounds: number;
  mapId: string;
  qualify: number;
  qualified: number;
  code: string;
  host: string;
  isPrivate: boolean;
  fillBots: boolean;
  roundsWanted: number;
  winner: string;
  players: PlayerView[];
}

export interface MatchActions {
  playAgain(): void;
  menu(): void;
}

const TYPE_LABEL: Record<string, string> = {
  race: 'Race', survival: 'Survival', points: 'Zone', tag: 'Bomb Tag', final: 'Final',
};

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** The one line a player needs before a round starts. */
function goal(map: MapDef, qualify: number): string {
  switch (map.type) {
    case 'race': return `First ${qualify} qualify`;
    case 'survival': return `Last ${qualify} qualify`;
    case 'points': return `${map.keep ? 'Hold a crown to score' : 'Stand in the zone to score'} · top ${qualify} qualify`;
    case 'tag': return 'Don’t hold a bomb at zero';
    case 'final': return map.finish ? 'First to the crown wins' : 'Last one standing wins';
    default: return '';
  }
}

/** Everything on screen that follows the match flow: lobby, round cards, counters, banners, spectating, podium. */
export class MatchUI {
  readonly root: HTMLDivElement;
  private readonly lobby: HTMLDivElement;
  private readonly card: HTMLDivElement;
  private readonly spectate: HTMLDivElement;
  private readonly results: HTMLDivElement;
  private readonly podium: HTMLDivElement;
  private lastPhase = '';
  private lastRound = -1;
  private lastStatus = -1;
  private lastCount = -1;
  private lastIt = false;
  private lobbyKey = '';
  private resultsKey = '';
  private podiumKey = '';
  private nextConfetti = 0;
  private readonly onKey = (e: KeyboardEvent) => {
    if (this.game.ownActive) return;
    if (e.code === 'KeyQ') this.game.cycleSpectate(-1);
    if (e.code === 'KeyE') this.game.cycleSpectate(1);
  };

  constructor(parent: HTMLElement, private readonly room: Room, private readonly game: OnlineGame, actions: MatchActions) {
    this.root = document.createElement('div');
    this.root.className = 'match-ui';
    this.root.innerHTML = `
      <div class="lobby-card hidden"></div>
      <div class="round-card hidden"></div>
      <div class="spectate-bar hidden">
        <button class="spec-btn" data-dir="-1" aria-label="Previous player">◀</button>
        <span class="spec-name"></span>
        <button class="spec-btn" data-dir="1" aria-label="Next player">▶</button>
      </div>
      <div class="results-card hidden"></div>
      <div class="podium-card hidden"></div>`;
    this.lobby = this.root.querySelector('.lobby-card')!;
    this.card = this.root.querySelector('.round-card')!;
    this.spectate = this.root.querySelector('.spectate-bar')!;
    this.results = this.root.querySelector('.results-card')!;
    this.podium = this.root.querySelector('.podium-card')!;
    this.spectate.querySelectorAll<HTMLButtonElement>('.spec-btn').forEach((b) =>
      b.addEventListener('click', () => this.game.cycleSpectate(Number(b.dataset.dir) as 1 | -1)));
    this.lobby.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!t) return;
      const v = this.view();
      if (t.dataset.act === 'start') this.room.send('start');
      if (t.dataset.act === 'bots') this.room.send('bots', !v.fillBots);
      if (t.dataset.act === 'copy') void navigator.clipboard?.writeText(v.code).catch(() => {});
      if (t.dataset.act === 'rounds') {
        // Auto, then 3 up to the maximum, then back to Auto.
        const next = v.roundsWanted === 0 ? 3 : v.roundsWanted >= MAX_ROUNDS ? 0 : v.roundsWanted + 1;
        this.room.send('rounds', next);
      }
    });
    this.podium.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (t?.dataset.act === 'again') actions.playAgain();
      if (t?.dataset.act === 'menu') actions.menu();
    });
    addEventListener('keydown', this.onKey);
    parent.appendChild(this.root);
  }

  private view(): StateView {
    const s = this.room.state as Record<string, unknown> & {
      players?: { forEach(cb: (p: Record<string, unknown>, id: string) => void): void };
    };
    const players: PlayerView[] = [];
    s?.players?.forEach((p, id) => players.push({
      id, name: String(p.name ?? ''), status: Number(p.status ?? 0), place: Number(p.place ?? 0), bot: !!p.bot,
      points: Number(p.points ?? 0), it: !!p.it,
    }));
    return {
      phase: String(s?.phase ?? 'lobby'), phaseEnd: Number(s?.phaseEnd ?? 0), round: Number(s?.round ?? 0),
      rounds: Number(s?.rounds ?? 0), mapId: String(s?.mapId ?? 'lobby'), qualify: Number(s?.qualify ?? 0),
      qualified: Number(s?.qualified ?? 0), code: String(s?.code ?? ''), host: String(s?.host ?? ''),
      isPrivate: !!s?.isPrivate, fillBots: !!s?.fillBots, roundsWanted: Number(s?.roundsWanted ?? 0),
      winner: String(s?.winner ?? ''), players,
    };
  }

  /** Seconds until the current phase ends (null if open-ended). */
  private remaining(v: StateView): number | null {
    if (!v.phaseEnd) return null;
    return Math.max(0, (v.phaseEnd - this.game.serverNow()) / TICK_RATE);
  }

  update() {
    const v = this.view();
    const hud = this.game.hud;
    const me = v.players.find((p) => p.id === this.room.sessionId);
    const left = this.remaining(v);
    const phaseChanged = v.phase !== this.lastPhase || v.round !== this.lastRound;

    this.lobby.classList.toggle('hidden', v.phase !== 'lobby' || !v.isPrivate);
    this.card.classList.toggle('hidden', v.phase !== 'intro');
    this.results.classList.toggle('hidden', v.phase !== 'results');
    this.podium.classList.toggle('hidden', v.phase !== 'podium');

    switch (v.phase) {
      case 'lobby':
        if (v.isPrivate) this.renderLobby(v);
        hud.setTimer(v.isPrivate ? null : left);
        hud.setStatus(v.isPrivate ? '' : `${v.players.length} / 32`);
        break;
      case 'intro':
        if (phaseChanged) this.renderIntro(v);
        hud.setTimer(null);
        hud.setStatus('');
        break;
      case 'countdown': {
        hud.setTimer(null);
        const n = left === null ? 0 : Math.ceil(left);
        if (n !== this.lastCount && n > 0 && n <= 3) {
          hud.showBanner(String(n), 'count', 900);
          sound.play('tick');
        }
        this.lastCount = n;
        break;
      }
      case 'playing': {
        if (phaseChanged) {
          hud.showBanner('GO!', 'go', 900);
          sound.play('go');
        }
        hud.setTimer(left);
        hud.setStatus(this.status(v, me));
        break;
      }
      case 'results':
        hud.setTimer(null);
        hud.setStatus('');
        this.renderResults(v);
        break;
      case 'podium':
        hud.setTimer(null);
        hud.setStatus('');
        if (phaseChanged) {
          this.game.facePodium();
          if (v.winner) sound.play('win');
        }
        this.renderPodium(v);
        // Keep the confetti coming over the champion (they appear once the stage map has loaded).
        if (v.winner && performance.now() > this.nextConfetti && this.game.celebrate(v.winner, 70)) {
          this.nextConfetti = performance.now() + 1300;
        }
        break;
    }

    // Our own fate this round.
    if (me && me.status !== this.lastStatus) {
      if (this.lastStatus === STATUS.playing && me.status === STATUS.qualified && v.phase === 'playing') {
        hud.showBanner('QUALIFIED!', 'good', 1800, me.place ? `#${me.place}` : '');
        sound.play('qualify');
        this.game.celebrate(me.id, 110);
      } else if (this.lastStatus === STATUS.playing && me.status === STATUS.eliminated && v.phase === 'playing') {
        hud.showBanner('ELIMINATED', 'bad', 2200);
        sound.play('eliminated');
      }
      this.lastStatus = me.status;
    }
    // Tag: the bomb arriving or leaving.
    if (me && me.it !== this.lastIt) {
      const crown = !!MAPS[v.mapId]?.keep;
      if (me.it && v.phase !== 'results') {
        if (crown) hud.showBanner('CROWN!', 'good', 1100, 'Keep away from everyone');
        else hud.showBanner('BOMB!', 'bad', 1100, 'Touch someone to pass it on');
        sound.play(crown ? 'qualify' : 'hit');
      } else if (!me.it && v.phase === 'playing') {
        hud.showBanner(crown ? 'STOLEN!' : 'PASSED!', crown ? 'bad' : 'good', 900);
        sound.play(crown ? 'hit' : 'bounce');
      }
      this.lastIt = me.it;
    }

    // Spectating while we are out of the round.
    const watching = !this.game.ownActive && (v.phase === 'playing' || v.phase === 'results' || v.phase === 'countdown');
    const name = this.game.spectatingName;
    this.spectate.classList.toggle('hidden', !watching || !name);
    if (watching && name) {
      const el = this.spectate.querySelector('.spec-name')!;
      if (el.textContent !== name) el.textContent = name;
    }

    this.lastPhase = v.phase;
    this.lastRound = v.round;
  }

  /** The status pill under the timer while a round is on. */
  private status(v: StateView, me: PlayerView | undefined): string {
    const map = MAPS[v.mapId];
    const running = v.players.filter((p) => p.status === STATUS.playing);
    switch (map?.type) {
      case 'race': return `${v.qualified} / ${v.qualify}`;
      case 'points': {
        if (!me || me.status !== STATUS.playing) return `Top ${v.qualify}`;
        const rank = 1 + running.filter((p) => p.points > me.points).length;
        return `${me.it ? '👑 ' : ''}${me.points} pts · #${rank} · top ${v.qualify}`;
      }
      case 'tag':
        return me?.it ? 'You have a bomb!' : `${running.filter((p) => p.it).length} bombs`;
      case 'final':
        return map.finish ? 'Get the crown!' : `${running.length} left`;
      default:
        return `${running.length} left · ${v.qualify} qualify`;
    }
  }

  private renderLobby(v: StateView) {
    const me = this.room.sessionId;
    const isHost = v.host === me;
    const humans = v.players.filter((p) => !p.bot);
    const key = JSON.stringify([v.code, v.host, v.fillBots, v.roundsWanted, humans.map((p) => p.name)]);
    if (key === this.lobbyKey) return;
    this.lobbyKey = key;
    this.lobby.className = 'lobby-card private';
    const rounds = v.roundsWanted === 0 ? 'Auto' : String(v.roundsWanted);
    this.lobby.innerHTML = `
      <button class="room-code" data-act="copy" title="Copy code">${esc(v.code)}</button>
      <ul class="lobby-players">${humans.map((p) =>
        `<li>${p.id === v.host ? '<span class="host-tag">HOST</span>' : ''}${esc(p.name)}</li>`).join('')}</ul>
      ${isHost ? `
        <div class="lobby-opts">
          <button class="btn btn-alt small" data-act="rounds">Rounds: ${rounds}</button>
          <button class="btn btn-alt small" data-act="bots">Bots: ${v.fillBots ? 'on' : 'off'}</button>
        </div>
        <button class="btn btn-play" data-act="start">Start</button>` : `<div class="lobby-wait">Rounds: ${rounds} · Bots: ${v.fillBots ? 'on' : 'off'}</div>`}`;
  }

  private renderIntro(v: StateView) {
    const map = MAPS[v.mapId];
    if (!map) return;
    const type = map.type === 'lobby' ? 'race' : map.type;
    this.card.innerHTML = `
      <div class="round-no">Round ${v.round} / ${v.rounds}</div>
      <div class="type-badge t-${type}">${TYPE_LABEL[type]}</div>
      <div class="map-name">${esc(map.name)}</div>
      <div class="map-goal">${esc(goal(map, v.qualify))}</div>`;
    this.card.classList.remove('pop');
    void this.card.offsetWidth;
    this.card.classList.add('pop');
  }

  private renderResults(v: StateView) {
    const through = v.players.filter((p) => p.status === STATUS.qualified).sort((a, b) => (a.place || 99) - (b.place || 99));
    const me = v.players.find((p) => p.id === this.room.sessionId);
    const key = JSON.stringify([v.round, through.map((p) => p.id), me?.status]);
    if (key === this.resultsKey) return;
    this.resultsKey = key;
    const ok = me?.status === STATUS.qualified;
    this.results.innerHTML = `
      <div class="results-mine ${ok ? 'good' : 'bad'}">${ok ? 'You’re through!' : 'You’re out'}</div>
      <ul class="results-list">${through.slice(0, 16).map((p) =>
        `<li class="${p.id === this.room.sessionId ? 'me' : ''}">${esc(p.name)}</li>`).join('')}</ul>`;
  }

  private renderPodium(v: StateView) {
    const w = v.players.find((p) => p.id === v.winner);
    const key = JSON.stringify([v.winner, w?.name]);
    if (key === this.podiumKey) return;
    this.podiumKey = key;
    const mine = v.winner === this.room.sessionId;
    this.podium.innerHTML = `
      <div class="podium-title">${mine ? 'YOU WIN!' : 'WINNER!'}</div>
      <div class="podium-name">${esc(w?.name ?? 'Nobody')}</div>
      <div class="podium-actions">
        ${v.isPrivate ? '' : '<button class="btn btn-play small" data-act="again">Play again</button>'}
        <button class="btn btn-sec small" data-act="menu">Menu</button>
      </div>`;
  }

  dispose() {
    removeEventListener('keydown', this.onKey);
    this.root.remove();
  }
}

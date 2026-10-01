import type { Room } from '@colyseus/sdk';
import { getMap } from '@sp/shared';
import { OnlineGame } from './game/OnlineGame';
import { PracticeGame } from './game/PracticeGame';
import type { Input } from './input/Input';
import { createPrivate, joinByCode, quickPlay, waitForServer } from './net/connection';
import { loadProfile, saveProfile, type Profile } from './profile';
import type { GameRenderer } from './render/Renderer';
import { MatchUI } from './ui/matchui';
import { Menu, Overlay } from './ui/menu';

type Game = PracticeGame | OnlineGame;
type Join = { kind: 'quick' } | { kind: 'create'; fillBots: boolean } | { kind: 'code'; code: string };

/** Top-level flow: title screen (with a live island behind it), practice, online play. */
export class App {
  game: Game | null = null;
  profile: Profile;
  private matchUi: MatchUI | null = null;
  private readonly menu: Menu;
  private readonly overlay: Overlay;
  private readonly leaveBtn: HTMLButtonElement;
  private cancel: AbortController | null = null;

  constructor(private readonly r: GameRenderer, private readonly input: Input, private readonly ui: HTMLElement) {
    this.profile = loadProfile();
    this.menu = new Menu(ui, this.profile, {
      play: () => void this.goOnline({ kind: 'quick' }),
      createPrivate: (fillBots) => void this.goOnline({ kind: 'create', fillBots }),
      joinCode: (code) => void this.goOnline({ kind: 'code', code }),
      practice: () => this.practice('tumbletop'),
      rename: (name) => {
        this.profile.name = name;
        saveProfile(this.profile);
      },
    });
    this.overlay = new Overlay(ui);
    this.leaveBtn = document.createElement('button');
    this.leaveBtn.className = 'btn-leave hidden';
    this.leaveBtn.setAttribute('aria-label', 'Leave');
    this.leaveBtn.textContent = '✕';
    this.leaveBtn.addEventListener('click', () => this.showMenu());
    ui.appendChild(this.leaveBtn);
    this.showMenu();
  }

  private setGame(g: Game | null) {
    this.matchUi?.dispose();
    this.matchUi = null;
    if (this.game instanceof OnlineGame) this.game.room.leave().catch(() => {});
    this.game?.dispose();
    this.game = g;
    this.leaveBtn.classList.toggle('hidden', !g || (g instanceof PracticeGame && g.attract));
  }

  showMenu() {
    this.cancel?.abort();
    this.overlay.hide();
    this.input.enabled = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.setGame(new PracticeGame(this.r, this.input, getMap('lobby'), this.profile.look, this.ui, { attract: true }));
    this.menu.show(true);
  }

  practice(mapId: string) {
    this.menu.show(false);
    this.input.enabled = true;
    this.setGame(new PracticeGame(this.r, this.input, getMap(mapId), this.profile.look, this.ui));
  }

  private async connect(how: Join): Promise<Room> {
    const profile = { name: this.profile.name, look: this.profile.look };
    if (how.kind === 'quick') return quickPlay(profile);
    if (how.kind === 'create') return createPrivate(profile, how.fillBots);
    try {
      return await joinByCode(how.code, profile);
    } catch {
      throw new Error(`No room with code ${how.code}. Check the code, or the match may have started already.`);
    }
  }

  async goOnline(how: Join) {
    this.menu.show(false);
    const ctl = (this.cancel = new AbortController());
    const cancel = () => this.showMenu();
    this.overlay.show('Connecting…', 'Cancel', cancel);
    try {
      await waitForServer((s) => {
        this.overlay.show(`Waking up the game server… ${s}s\n(free hosting sleeps when idle; this can take up to a minute)`, 'Cancel', cancel);
      }, ctl.signal);
      if (ctl.signal.aborted) return;
      this.overlay.show(how.kind === 'quick' ? 'Finding a match…' : 'Joining the room…', 'Cancel', cancel);
      const room = await this.connect(how);
      if (ctl.signal.aborted) {
        room.leave().catch(() => {});
        return;
      }
      this.overlay.hide();
      this.input.enabled = true;
      const game = new OnlineGame(this.r, this.input, this.ui, room);
      this.setGame(game);
      this.matchUi = new MatchUI(this.ui, room, game, {
        playAgain: () => void this.goOnline({ kind: 'quick' }),
        menu: () => this.showMenu(),
      });
      room.onLeave((code: number) => {
        if (this.game !== game) return;
        this.showMenu();
        if (code > 1001 && code !== 4000) this.overlay.show('Disconnected from the server.', 'OK', () => this.overlay.hide(), false);
      });
    } catch (e) {
      if (ctl.signal.aborted) return;
      this.overlay.show(String((e as Error)?.message ?? e), 'Back', () => this.showMenu(), false);
    }
  }

  frame(dt: number) {
    this.game?.frame(dt);
    this.matchUi?.update();
  }
}

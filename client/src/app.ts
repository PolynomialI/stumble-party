import type { Room } from '@colyseus/sdk';
import { getMap } from '@sp/shared';
import { OnlineGame } from './game/OnlineGame';
import { PracticeGame } from './game/PracticeGame';
import type { Input } from './input/Input';
import { createPrivate, joinByCode, quickPlay, waitForServer } from './net/connection';
import { loadProfile, saveProfile, type Profile } from './profile';
import type { GameRenderer } from './render/Renderer';
import type { Settings } from './settings';
import { Customizer } from './ui/customize';
import { MatchUI } from './ui/matchui';
import { GEAR_SVG, Menu, Overlay } from './ui/menu';
import { SettingsPanel } from './ui/settings';

type Game = PracticeGame | OnlineGame;
type Join = { kind: 'quick' } | { kind: 'create'; fillBots: boolean } | { kind: 'code'; code: string };

/** Top-level flow: title screen (with a live island behind it), practice, online play. */
export class App {
  game: Game | null = null;
  profile: Profile;
  private matchUi: MatchUI | null = null;
  private readonly menu: Menu;
  private readonly overlay: Overlay;
  private readonly customizer: Customizer;
  private readonly settings: SettingsPanel;
  private readonly leaveBtn: HTMLButtonElement;
  private readonly gearBtn: HTMLButtonElement;
  private cancel: AbortController | null = null;

  constructor(private readonly r: GameRenderer, private readonly input: Input, private readonly ui: HTMLElement,
    settings: Settings, applySettings: (s: Settings, reload: boolean) => void) {
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
      customize: () => this.customize(true),
      settings: () => this.settings.show(true),
    });
    this.customizer = new Customizer(ui, this.profile.look, (look) => {
      this.profile.look = look;
      saveProfile(this.profile);
      if (this.game instanceof PracticeGame) this.game.setLook(look);
    }, () => this.customize(false));
    this.overlay = new Overlay(ui);
    this.leaveBtn = document.createElement('button');
    this.leaveBtn.className = 'btn-corner hidden';
    this.leaveBtn.setAttribute('aria-label', 'Leave');
    this.leaveBtn.textContent = '✕';
    this.leaveBtn.addEventListener('click', () => this.showMenu());
    this.gearBtn = document.createElement('button');
    this.gearBtn.className = 'btn-corner btn-gear hidden';
    this.gearBtn.setAttribute('aria-label', 'Settings');
    this.gearBtn.innerHTML = GEAR_SVG;
    this.gearBtn.addEventListener('click', () => {
      if (document.pointerLockElement) document.exitPointerLock();
      this.settings.show(true, false);
    });
    ui.append(this.leaveBtn, this.gearBtn);
    this.settings = new SettingsPanel(ui, settings, applySettings);
    this.showMenu();
  }

  /** Opens/closes the outfit editor, with the title-screen camera swinging round to the character's face. */
  private customize(on: boolean) {
    this.menu.show(!on);
    this.customizer.show(on, this.profile.look);
    if (this.game instanceof PracticeGame) this.game.setCloseup(on);
  }

  private setGame(g: Game | null) {
    this.matchUi?.dispose();
    this.matchUi = null;
    if (this.game instanceof OnlineGame) this.game.room.leave().catch(() => {});
    this.game?.dispose();
    this.game = g;
    const inGame = !!g && !(g instanceof PracticeGame && g.attract);
    this.leaveBtn.classList.toggle('hidden', !inGame);
    this.gearBtn.classList.toggle('hidden', !inGame);
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

import Phaser from 'phaser';
import type { GameClient } from './client';
import { drawGame } from './art';
import { CurvedScreenPipeline } from './screen';
import { WorldLabels } from './labels';

export function mountGame(parent: HTMLElement, client: GameClient) {
  class TowerScene extends Phaser.Scene {
    private surface!: Phaser.Textures.CanvasTexture;
    private screen!: Phaser.GameObjects.Image;
    private curved = false;
    private supportsCurve = false;
    private labels!: WorldLabels;
    create() {
      this.surface = this.textures.createCanvas('tower-scene', 320, 200)!;
      this.screen = this.add.image(0, 0, 'tower-scene').setOrigin(0);
      this.labels = new WorldLabels(parent, this.game.canvas);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.labels.destroy());
      this.events.once(Phaser.Scenes.Events.DESTROY, () => this.labels.destroy());
      if (this.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
        this.renderer.pipelines.add('TowerScreen', new CurvedScreenPipeline(this.game));
        this.supportsCurve = true;
      }
    }
    update(time: number, delta: number) {
      if (!this.surface) return;
      client.update(delta);
      const curved = this.supportsCurve && client.input.settings.curvedScreen;
      if (curved !== this.curved) {
        if (curved) this.screen.setPipeline('TowerScreen');
        else this.screen.resetPipeline();
        this.curved = curved;
      }
      const annotations = drawGame(this.surface.context, [...client.chunks.values()], client.renderPlayers(), client.playerId, client.cameraY, performance.now(), client.debug, client.frontRunnerId, client.pickups, client.effects, client.motion, client.input.settings.reducedMotion, client.relics, client.bridges, client.renderPlatforms(), client.renderTick);
      this.surface.refresh();
      this.labels.update(annotations, curved);
    }
  }
  return new Phaser.Game({
    type: Phaser.AUTO, parent, width: 320, height: 200, pixelArt: true, roundPixels: true,
    backgroundColor: '#172c2d', scene: TowerScene,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    fps: { target: 60 }, audio: { noAudio: true }, banner: false,
  });
}

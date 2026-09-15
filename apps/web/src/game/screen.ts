import Phaser from 'phaser';
import { SCREEN_CURVATURE } from './label-layout';

// Distort only the finished game texture. Positions, collisions and DOM controls
// stay in their original coordinates. Nearest sampling preserves the pixel art.
export class CurvedScreenPipeline extends Phaser.Renderer.WebGL.Pipelines.SinglePipeline {
  constructor(game: Phaser.Game) {
    super({ game, fragShader: `
      precision mediump float;
      uniform sampler2D uMainSampler;
      varying vec2 outTexCoord;

      void main () {
        vec2 p = outTexCoord * 2.0 - 1.0;
        // Cross-axis barrel distortion: straight walls bow gently outwards.
        // At 6%, the playable space inside the stone walls stays visible.
        vec2 curved = p * (1.0 + ${SCREEN_CURVATURE} * p.yx * p.yx);
        vec2 uv = curved * 0.5 + 0.5;
        vec2 edge = 1.0 - abs(curved);
        float glass = smoothstep(0.0, 0.012, min(edge.x, edge.y));
        float vignette = 1.0 - 0.12 * dot(p, p) * 0.5;
        vec3 scene = texture2D(uMainSampler, clamp(uv, 0.0, 1.0)).rgb;
        gl_FragColor = vec4(mix(vec3(0.025, 0.045, 0.039), scene * vignette, glass), 1.0);
      }
    ` });
  }
}

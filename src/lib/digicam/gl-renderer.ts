// DigiCam WebGL renderer — compiles the shaders, uploads video/image
// frames as textures, sets the pipeline uniforms, and renders either to
// the screen (live preview) or to the canvas itself (used for capture:
// render once → canvas.toBlob → JPEG with real DCT/4:2:0 artifacts).
//
// Uses WebGL1 (GLSL ES 1.00) for maximum device compatibility.

import { FRAGMENT_SHADER, VERTEX_SHADER, UNIFORM_NAMES } from "./shaders";
import type { PipelineUniforms } from "./presets";

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  src: string,
): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader alloc failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile error: " + log);
  }
  return sh;
}

export class GLRenderer {
  readonly gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private texture: WebGLTexture;
  private vertexBuffer: WebGLBuffer;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private aPosLoc: number;
  private aUvLoc: number;
  private currentSource: TexImageSource | null = null;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = (canvas.getContext("webgl", {
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      antialias: false,
      powerPreference: "high-performance",
    }) ||
      canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) throw new Error("WebGL not available");
    this.gl = gl;

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!program) throw new Error("program alloc failed");
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error("program link error: " + log);
    }
    this.program = program;
    gl.useProgram(program);

    // fullscreen quad (two triangles)
    const verts = new Float32Array([
      // pos     uv
      -1, -1, 0, 0,
       1, -1, 1, 0,
      -1,  1, 0, 1,
      -1,  1, 0, 1,
       1, -1, 1, 0,
       1,  1, 1, 1,
    ]);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    this.vertexBuffer = buf;

    this.aPosLoc = gl.getAttribLocation(program, "aPos");
    this.aUvLoc = gl.getAttribLocation(program, "aUv");
    gl.enableVertexAttribArray(this.aPosLoc);
    gl.enableVertexAttribArray(this.aUvLoc);
    gl.vertexAttribPointer(this.aPosLoc, 2, gl.FLOAT, false, 16, 0);
    gl.vertexAttribPointer(this.aUvLoc, 2, gl.FLOAT, false, 16, 8);

    // texture
    const tex = gl.createTexture();
    if (!tex) throw new Error("texture alloc failed");
    this.texture = tex;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // cache uniform locations
    for (const name of UNIFORM_NAMES) {
      this.uniforms[name] = gl.getUniformLocation(program, name);
    }
    gl.uniform1i(this.uniforms.uVideo, 0);
  }

  /** Upload a video frame or image as the source texture. */
  setSource(source: TexImageSource) {
    this.currentSource = source;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    try {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source,
      );
    } catch {
      // texImage2D can throw if the source has no ready frame yet; ignore.
    }
  }

  /**
   * Set the pipeline uniforms from a PipelineUniforms object.
   * uResolution is derived from the canvas drawing buffer size.
   */
  setUniforms(u: PipelineUniforms) {
    const gl = this.gl;
    const w = this.canvas.width;
    const h = this.canvas.height;
    gl.uniform2f(this.uniforms.uResolution, w, h);
    gl.uniform1f(this.uniforms.uIntensity, u.uIntensity);
    gl.uniform1f(this.uniforms.uTime, u.uTime);
    gl.uniform1f(this.uniforms.uISOBoost, u.uISOBoost);
    gl.uniform3f(this.uniforms.uTint, u.uTint[0], u.uTint[1], u.uTint[2]);
    gl.uniform1f(this.uniforms.uWarmth, u.uWarmth);
    gl.uniform1f(this.uniforms.uSaturation, u.uSaturation);
    gl.uniform1f(this.uniforms.uContrast, u.uContrast);
    gl.uniform1f(this.uniforms.uBrightness, u.uBrightness);
    gl.uniform1f(this.uniforms.uShadowCrush, u.uShadowCrush);
    gl.uniform1f(this.uniforms.uHighlightClip, u.uHighlightClip);
    gl.uniform1f(this.uniforms.uGrainAmount, u.uGrainAmount);
    gl.uniform1f(this.uniforms.uGrainScale, u.uGrainScale);
    gl.uniform1f(this.uniforms.uChromaNoise, u.uChromaNoise);
    gl.uniform1f(this.uniforms.uVignette, u.uVignette);
    gl.uniform1f(this.uniforms.uVignetteRadius, u.uVignetteRadius);
    gl.uniform1f(this.uniforms.uAberration, u.uAberration);
    gl.uniform1f(this.uniforms.uSoftness, u.uSoftness);
    gl.uniform1f(this.uniforms.uBlockiness, u.uBlockiness);
    gl.uniform1f(this.uniforms.uSharpen, u.uSharpen);
    gl.uniform1i(this.uniforms.uFlashOn, u.uFlashOn);
    gl.uniform3f(this.uniforms.uFlashTint, u.uFlashTint[0], u.uFlashTint[1], u.uFlashTint[2]);
    gl.uniform1f(this.uniforms.uMirror, u.uMirror);
    // video-mode uniforms (no-ops when uVideoMode == 0)
    gl.uniform1i(this.uniforms.uVideoMode, u.uVideoMode);
    gl.uniform1f(this.uniforms.uVideoSoftness, u.uVideoSoftness);
    gl.uniform1f(this.uniforms.uChromaBleed, u.uChromaBleed);
    gl.uniform1f(this.uniforms.uBloomThreshold, u.uBloomThreshold);
    gl.uniform1f(this.uniforms.uInterlace, u.uInterlace);
    gl.uniform1f(this.uniforms.uInterlaceMotion, u.uInterlaceMotion);
    gl.uniform1f(this.uniforms.uBlowoutThreshold, u.uBlowoutThreshold);
    gl.uniform1f(this.uniforms.uStreakAmount, u.uStreakAmount);
    gl.uniform1f(this.uniforms.uHazeLift, u.uHazeLift);
    gl.uniform1f(this.uniforms.uHazeReduce, u.uHazeReduce);
    gl.uniform1f(this.uniforms.uVideoGrain, u.uVideoGrain);
    gl.uniform1f(this.uniforms.uVideoGrainScale, u.uVideoGrainScale);
    gl.uniform1f(this.uniforms.uVideoVignette, u.uVideoVignette);
    gl.uniform1f(this.uniforms.uVideoVignetteRadius, u.uVideoVignetteRadius);
    gl.uniform4f(this.uniforms.uCoverUv, u.uCoverUv[0], u.uCoverUv[1], u.uCoverUv[2], u.uCoverUv[3]);
  }

  /** Set the canvas drawing-buffer size (device pixels). */
  setSize(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
    const gl = this.gl;
    gl.viewport(0, 0, width, height);
  }

  /** Render one frame to the screen (default framebuffer). */
  renderToScreen() {
    const gl = this.gl;
    if (this.currentSource) this.setSource(this.currentSource);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.flush();
  }

  dispose() {
    const gl = this.gl;
    try {
      gl.deleteTexture(this.texture);
      gl.deleteBuffer(this.vertexBuffer);
      gl.deleteProgram(this.program);
    } catch {
      /* noop */
    }
    // Lose context extension if available
    const lose = gl.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
  }
}

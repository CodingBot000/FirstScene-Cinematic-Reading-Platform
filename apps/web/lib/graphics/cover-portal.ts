/**
 * Presentation-only GPU effect. The canonical reader never imports this file.
 * Inaccessible or unavailable WebGL always leaves the ordinary HTML artwork.
 */
type PortalUniforms = {
  resolution: WebGLUniformLocation | null;
  clock: WebGLUniformLocation | null;
  progress: WebGLUniformLocation | null;
  scene: WebGLUniformLocation | null;
  pointer: WebGLUniformLocation | null;
};

const VERTEX = `#version 300 es
precision highp float;
void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform vec2 uPointer;
uniform float uClock;
uniform float uProgress;
uniform float uScene;
out vec4 fragColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float envelope(float p,float a,float b) {return smoothstep(a,a+.13,p)*(1.0-smoothstep(b-.13,b,p));}
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 center = vec2(.74,.53) + (uPointer - vec2(.5)) * .055;
  vec2 p = uv - center;
  p.x *= uResolution.x / uResolution.y;
  float r = length(p);
  float angle = atan(p.y,p.x);
  float time = uClock * .17;
  float warp = .05 * sin(angle*6.0 + time*2.0 + r*11.0);
  float halo = exp(-pow((r-.23+warp)*6.5,2.0)) * .35;
  float rings = pow(max(0.0,sin(r*36.0 - angle*3.0 - time*4.0)),9.0)
                * exp(-r*4.0) * .25;
  float core = exp(-r*5.8) * .34;
  float beam = max(0.0,cos(angle*2.0 + time*.5)) * exp(-r*3.0)*.09;
  // One hashed tile instead of a per-pixel particle loop: bounded GPU work.
  vec2 field = uv * vec2(24.0, 16.0);
  vec2 cell = floor(field);
  vec2 local = fract(field + vec2(time * .013, -time * .018)) - .5;
  float starMask = step(.88, hash(cell));
  float grains = pow(max(0.0, 1.0 - length(local) * 2.0), 18.0)
    * starMask * (.25 + .10 * sin(time * 2.0 + cell.x));
  vec3 gold=vec3(.94,.52,.19);
  vec3 aqua=vec3(.21,.76,.79);
  vec3 mauve=vec3(.66,.48,.86);
  vec3 tone=mix(gold,aqua,smoothstep(.23,.49,uProgress));
  tone=mix(tone,mauve,smoothstep(.68,.92,uProgress));
  // Pair the gallery with the second scene while the scroll is paused.
  tone=mix(tone, uScene<.5?gold:(uScene<1.5?aqua:mauve), .15);
  float intensity=core+halo+rings+beam+grains*.48;
  intensity *= 0.75 + 0.25*sin(uClock*.31);
  intensity *= (1.0-smoothstep(.30,.96,r));
  fragColor = vec4(tone*intensity,clamp(intensity*.65,0.0,.54));
}
`;

function compile(gl: WebGL2RenderingContext, kind: number, code: string) {
  const shader = gl.createShader(kind);
  if (!shader) throw new Error("PORTAL_SHADER_CREATE");
  gl.shaderSource(shader, code);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    throw new Error("PORTAL_SHADER_COMPILE");
  }
  return shader;
}

export function mountCoverPortal(
  canvas: HTMLCanvasElement,
  root: HTMLElement,
): () => void {
  const maybeGL = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,
    powerPreference: "low-power",
    depth: false,
    stencil: false,
  });
  if (!maybeGL) throw new Error("WEBGL2_UNAVAILABLE");
  const gl: WebGL2RenderingContext = maybeGL;
  let program: WebGLProgram | null = null;
  let vao: WebGLVertexArrayObject | null = null;
  const shaders: WebGLShader[] = [];
  let frame = 0;
  let lastFrame = 0;
  let disposed = false;
  let visible = true;
  const pointer = { x: 0.5, y: 0.5 };

  const destroy = () => {
    if (disposed) return;
    disposed = true;
    window.cancelAnimationFrame(frame);
    observer.disconnect();
    sizeObserver.disconnect();
    root.removeEventListener("pointermove", move);
    canvas.removeEventListener("webglcontextlost", contextLost);
    if (vao) gl.deleteVertexArray(vao);
    if (program) gl.deleteProgram(program);
    for (const shader of shaders) gl.deleteShader(shader);
    canvas.dataset.renderer = "inactive";
  };

  const move = (event: PointerEvent) => {
    const rect = root.getBoundingClientRect();
    pointer.x = Math.min(
      1,
      Math.max(0, (event.clientX - rect.left) / Math.max(rect.width, 1)),
    );
    pointer.y =
      1 -
      Math.min(
        1,
        Math.max(0, (event.clientY - rect.top) / Math.max(rect.height, 1)),
      );
  };
  const contextLost = (event: Event) => {
    event.preventDefault();
    destroy();
  };
  // Declare observers before compilation so partial initialization is
  // rolled back through the same cleanup path.
  const observer = new IntersectionObserver(
    (entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
    },
    { threshold: 0 },
  );
  const sizeObserver = new ResizeObserver(() => resize());
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.max(1, Math.min(1440, Math.round(rect.width * ratio)));
    const height = Math.max(1, Math.min(1000, Math.round(rect.height * ratio)));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  }
  try {
    shaders.push(compile(gl, gl.VERTEX_SHADER, VERTEX));
    shaders.push(compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    program = gl.createProgram();
    if (!program) throw new Error("PORTAL_PROGRAM_CREATE");
    gl.attachShader(program, shaders[0]!);
    gl.attachShader(program, shaders[1]!);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error("PORTAL_PROGRAM_LINK");
    vao = gl.createVertexArray();
    if (!vao) throw new Error("PORTAL_VAO_CREATE");
    gl.bindVertexArray(vao);
    gl.useProgram(program);
    const uniforms: PortalUniforms = {
      resolution: gl.getUniformLocation(program, "uResolution"),
      clock: gl.getUniformLocation(program, "uClock"),
      progress: gl.getUniformLocation(program, "uProgress"),
      scene: gl.getUniformLocation(program, "uScene"),
      pointer: gl.getUniformLocation(program, "uPointer"),
    };
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    root.addEventListener("pointermove", move, { passive: true });
    canvas.addEventListener("webglcontextlost", contextLost);
    observer.observe(canvas);
    sizeObserver.observe(canvas);
    resize();
    canvas.dataset.renderer = "webgl2";
    const tick = (now: number) => {
      if (disposed) return;
      frame = window.requestAnimationFrame(tick);
      if (now - lastFrame < 33 || document.hidden || !visible) return; // <=30fps
      lastFrame = now;
      const progress = Number.parseFloat(
        root.style.getPropertyValue("--cinematic-progress"),
      );
      const p = Number.isFinite(progress)
        ? Math.min(1, Math.max(0, progress))
        : 0;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
      gl.uniform1f(uniforms.clock, now * 0.001);
      gl.uniform1f(uniforms.progress, p);
      gl.uniform1f(uniforms.scene, Number(root.dataset.scene) || 0);
      gl.uniform2f(uniforms.pointer, pointer.x, pointer.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    frame = window.requestAnimationFrame(tick);
    return destroy;
  } catch (error) {
    destroy();
    throw error;
  }
}

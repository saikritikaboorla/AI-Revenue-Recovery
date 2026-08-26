"use client";

import { useEffect, useRef } from "react";
import { Mesh, Program, Renderer, Triangle } from "ogl";

const vertex = `attribute vec2 position; varying vec2 vUv; void main(){ vUv=position*.5+.5; gl_Position=vec4(position,0.,1.); }`;

// A deliberately low-energy data landscape: it is a single full-screen pass, not a
// decorative canvas per route. The contour lines provide depth without competing with UI.
const fragment = `precision mediump float;
uniform float uTime; uniform vec2 uResolution; uniform vec2 uMouse; uniform float uMotion;
varying vec2 vUv;
float wave(vec2 p){
  p.x += (uMouse.x-.5)*.10; p.y += (uMouse.y-.5)*.055;
  float a=sin(p.x*5.0+p.y*2.4+uTime*.16*uMotion)*.16;
  float b=sin(p.x*10.0-p.y*3.1-uTime*.11*uMotion)*.055;
  float c=cos(p.x*2.4+p.y*7.0+uTime*.08*uMotion)*.04;
  return p.y+a+b+c;
}
void main(){
  vec2 uv=vUv; vec2 p=(uv-.5)*vec2(uResolution.x/uResolution.y,1.0);
  float h=wave(p);
  // Keep the edge order ascending. A reversed smoothstep can produce undefined
  // output on some mobile/WebGL implementations, making the whole pass vanish.
  float horizon=smoothstep(-.45,.60,h);
  float bands=abs(fract(h*17.0)-.5);
  float contour=1.0-smoothstep(.39,.5,bands);
  float falloff=smoothstep(1.05,.12,length(p-vec2(.0,-.08)));
  vec3 base=vec3(.012,.021,.042);
  vec3 navy=vec3(.025,.105,.19)*horizon*.55;
  vec3 teal=vec3(.015,.38,.46)*contour*falloff*.30;
  vec3 crest=vec3(.43,.78,.92)*pow(contour,7.0)*falloff*.24;
  float grain=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5;
  gl_FragColor=vec4(base+navy+teal+crest+grain*.012,1.0);
}`;

export default function GradientWaves() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = host.current;
    if (!element || !window.WebGLRenderingContext) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let renderer: Renderer | undefined;
    let frame = 0;
    let visible = !document.hidden;
    const mouse = [0.5, 0.5];
    let targetMouse = [0.5, 0.5];
    let program: Program;

    try {
      renderer = new Renderer({ alpha: false, dpr: Math.min(window.devicePixelRatio || 1, 1.5), powerPreference: "low-power" });
      const gl = renderer.gl;
      program = new Program(gl, { vertex, fragment, uniforms: {
        uTime: { value: 0 }, uResolution: { value: [1, 1] }, uMouse: { value: mouse }, uMotion: { value: reducedMotion.matches ? 0 : 1 },
      }});
      const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });
      element.appendChild(gl.canvas);
      element.classList.remove("gradient-waves--fallback");
      const resize = () => {
        if (!renderer) return;
        renderer.setSize(element.clientWidth, element.clientHeight);
        program.uniforms.uResolution.value = [renderer.gl.canvas.width, renderer.gl.canvas.height];
      };
      const onPointerMove = (event: PointerEvent) => {
        targetMouse = [event.clientX / window.innerWidth, 1 - event.clientY / window.innerHeight];
      };
      const onVisibility = () => { visible = !document.hidden; if (visible && !frame) render(performance.now()); };
      const onMotion = () => { program.uniforms.uMotion.value = reducedMotion.matches ? 0 : 1; };
      const render = (time: number) => {
        frame = 0;
        mouse[0] += (targetMouse[0] - mouse[0]) * .025;
        mouse[1] += (targetMouse[1] - mouse[1]) * .025;
        program.uniforms.uMouse.value = mouse;
        program.uniforms.uTime.value = reducedMotion.matches ? 0 : time * .001;
        renderer?.render({ scene: mesh });
        if (visible && !reducedMotion.matches) frame = requestAnimationFrame(render);
      };
      const observer = new ResizeObserver(resize);
      observer.observe(element); resize(); render(performance.now());
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      document.addEventListener("visibilitychange", onVisibility);
      reducedMotion.addEventListener("change", onMotion);
      return () => {
        cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("visibilitychange", onVisibility); reducedMotion.removeEventListener("change", onMotion);
        if (renderer) { renderer.gl.getExtension("WEBGL_lose_context")?.loseContext(); renderer.gl.canvas.remove(); }
      };
    } catch {
      // The CSS atmosphere remains visible on browsers without usable WebGL.
      element.classList.add("gradient-waves--fallback");
    }
  }, []);

  return <div ref={host} className="gradient-waves" aria-hidden="true" />;
}

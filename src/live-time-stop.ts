/** Live-page overlay: no document copies, screenshots or pixel readbacks. */
export class LiveTimeStop {
  private context?: AudioContext;
  private audio?: Promise<AudioBuffer>;
  private finish?: () => void;
  private disposed = false;
  constructor(private url: string) {}

  // Unlock on the user gesture; playback itself starts with the later scene.
  resumeAudio(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.context ??= new AudioContext();
    return this.context.state === 'running' ? Promise.resolve() : this.context.resume();
  }

  preloadAudio(): Promise<AudioBuffer> {
    if (this.disposed) return Promise.reject(new Error('Disposed'));
    if (!this.audio) {
      this.audio = Promise.resolve().then(async () => {
        this.context ??= new AudioContext();
        const response = await fetch(this.url);
        if (!response.ok) throw new Error('Audio loading failed');
        return this.context.decodeAudioData(await response.arrayBuffer());
      }).catch(error => { this.audio = undefined; throw error; });
    }
    return this.audio;
  }

  play(origin: { x: number; y: number }, commit: () => void, onAudioError: () => void): Promise<void> {
    if (this.disposed || this.finish) return Promise.resolve();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { commit(); return Promise.resolve(); }
    const started = performance.now();
    const radius = Math.hypot(Math.max(origin.x, innerWidth - origin.x), Math.max(origin.y, innerHeight - origin.y));
    const overlay = document.createElement('div');
    overlay.className = 'dsh-ts-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    Object.assign(overlay.style, { position: 'fixed', inset: '0', zIndex: '2147483646', pointerEvents: 'none', overflow: 'hidden' });
    const veil = document.createElement('div');
    Object.assign(veil.style, { position: 'absolute', inset: '0', backdropFilter: 'invert(1) hue-rotate(210deg) saturate(1.7)', background: 'rgba(113,55,160,.12)' });
    const circle = (r: number) => `circle(${r}px at ${origin.x}px ${origin.y}px)`;
    veil.style.clipPath = circle(36);
    overlay.append(veil);
    document.body.append(overlay);
    let ended = false, committed = false;
    let source: AudioBufferSourceNode | undefined;
    let gain: GainNode | undefined;
    const animations: Animation[] = [];
    const applyTheme = () => { if (!committed) { committed = true; commit(); } };
    return new Promise<void>(resolve => {
      const finish = () => {
        if (ended) return;
        ended = true;
        clearTimeout(themeTimer); clearTimeout(endTimer);
        window.removeEventListener('resize', finish);
        document.removeEventListener('visibilitychange', visibility);
        animations.forEach(animation => animation.cancel());
        overlay.remove();
        source?.stop(); source?.disconnect(); gain?.disconnect();
        this.finish = undefined;
        try { applyTheme(); } finally { resolve(); }
      };
      const visibility = () => { if (document.hidden) finish(); };
      const themeTimer = setTimeout(applyTheme, 380);
      const endTimer = setTimeout(finish, 3000);
      this.finish = finish;
      window.addEventListener('resize', finish);
      document.addEventListener('visibilitychange', visibility);
      try {
        animations.push(veil.animate([
          { clipPath: circle(36), opacity: .8, offset: 0 },
          { clipPath: circle(55), opacity: 1, offset: .12 },
          { clipPath: circle(radius), opacity: 1, offset: .48 },
          { clipPath: circle(radius), opacity: .85, offset: .76 },
          { clipPath: circle(radius), opacity: 0, offset: 1 },
        ], { duration: 3000, fill: 'forwards', easing: 'linear' }));
        for (let i = 0; i < 3; i++) {
          const ring = document.createElement('div');
          Object.assign(ring.style, { position: 'absolute', left: `${origin.x - radius}px`, top: `${origin.y - radius}px`, width: `${radius * 2}px`, height: `${radius * 2}px`, boxSizing: 'border-box', borderRadius: '50%', border: `${3 + i * 3}px solid ${i === 1 ? '#b678f7' : '#ffe08b'}`, boxShadow: '0 0 30px #be70ff, inset 0 0 28px #e7c770', background: 'radial-gradient(circle,transparent 66%,rgba(220,177,91,.16) 70%,transparent 72%)', transform: 'scale(.025)' });
          overlay.append(ring);
          animations.push(ring.animate([
            { transform: `scale(${36 / radius})`, opacity: 1, offset: 0 },
            { transform: `scale(${55 / radius})`, opacity: 1, offset: .12 },
            { transform: `scale(${.98 + i * .02})`, opacity: 1, offset: .48 },
            { transform: `scale(${1.04 + i * .02})`, opacity: .5, offset: .76 },
            { transform: 'scale(1.35)', opacity: 0, offset: 1 },
          ], { duration: 3000, fill: 'forwards', easing: 'linear' }));
        }
        // Resume in the click handler, but never await audio before showing the overlay.
        this.context ??= new AudioContext();
        const resumed = this.context.state === 'running' ? Promise.resolve() : this.context.resume();
        void Promise.all([resumed, this.preloadAudio()]).then(([, buffer]) => {
          const offset = (performance.now() - started) / 1000;
          if (ended || this.disposed || offset >= Math.min(3, buffer.duration)) return;
          source = this.context!.createBufferSource();
          gain = this.context!.createGain(); gain.gain.value = .65;
          source.buffer = buffer; source.connect(gain); gain.connect(this.context!.destination);
          source.start(0, offset);
        }).catch(() => { if (!ended) onAudioError(); });
      } catch { finish(); }
    });
  }

  dispose() {
    this.disposed = true;
    this.finish?.();
    void this.context?.close().catch(() => {});
  }
}

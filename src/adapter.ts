import { LiveTimeStop } from './live-time-stop';

declare const DSH_AUDIO_URL: string;
type Scheme = 'light' | 'dark';

export function install(ctx: any, theme: any, require: (id: string) => any) {
  const React = require('react');
  const Sun = ({ size }: { size: number }) => React.createElement('svg', {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round',
    'aria-hidden': 'true',
  }, React.createElement('circle', { cx: 12, cy: 12, r: 4 }),
  React.createElement('path', { d: 'M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42' }));
  const Moon = ({ size }: { size: number }) => React.createElement('svg', {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round',
    'aria-hidden': 'true',
  }, React.createElement('path', { d: 'M20.1 15.2A8.4 8.4 0 0 1 8.8 3.9 8.5 8.5 0 1 0 20.1 15.2Z' }));
  const effect = new LiveTimeStop(DSH_AUDIO_URL);
  // Decode without playing; browser audio is resumed only by the actual click.
  void effect.preloadAudio().catch(() => {});
  let busy = false;
  let disposed = false;
  let cancelSlide: (() => void) | undefined;
  const style = document.createElement('style');
  style.dataset.dshTimeStop = 'live-overlay-v1';
  style.textContent = `
    .dsh-ts-toggle{appearance:none;box-sizing:border-box;width:100%;min-height:36px;border:0;border-radius:var(--dsw-radius-md);padding:7px 6px;display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-primary);background:transparent;font-family:inherit;font-size:14px;font-weight:400;line-height:22px;cursor:pointer}
    .dsh-ts-toggle[data-wide=false]{width:36px;padding:7px;justify-content:center}
    .dsh-ts-toggle:hover{background:var(--dsw-alias-interactive-bg-hover)}
    .dsh-ts-toggle:focus-visible{outline:2px solid var(--dsw-static-deepseek-400);outline-offset:2px}
    .dsh-ts-toggle:disabled{cursor:pointer}
    .dsh-ts-toggle__label{white-space:nowrap}
    .dsh-ts-toggle>svg{flex:none}
    .dsh-ts-toggle__switch{box-sizing:border-box;display:flex;align-items:center;justify-content:flex-start;flex:none;width:54px;height:30px;margin-left:auto;margin-block:-4px;padding:3px;border-radius:999px;background:#101114;transition:background-color .2s ease}
    .dsh-ts-toggle__thumb{display:block;flex:none;width:24px;height:24px;border-radius:50%;background:#fff;transform:translateX(0);will-change:transform;transition:transform .18s ease,background-color .18s ease}
    /* DSH applies superellipse corners globally; these shapes must stay circular. */
    .dsh-ts-toggle__switch,.dsh-ts-toggle__thumb{corner-shape:round}
    .dsh-ts-toggle[data-scheme=dark] .dsh-ts-toggle__switch{background:#f8f9fa}
    .dsh-ts-toggle[data-scheme=dark] .dsh-ts-toggle__thumb{background:#101114;transform:translateX(24px)}
    @media(prefers-reduced-motion:reduce){.dsh-ts-toggle__switch,.dsh-ts-toggle__thumb{transition:none}}
  `;
  document.head.appendChild(style);
  ctx.effect(() => () => { disposed = true; cancelSlide?.(); effect.dispose(); style.remove(); }, 'time-stop: dispose renderer');

  function slideFirst(button: HTMLButtonElement): Promise<void> {
    if (!button.querySelector('.dsh-ts-toggle__thumb') || matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
    return new Promise(resolve => {
      let frame = 0;
      const finish = () => { cancelAnimationFrame(frame); clearTimeout(fallback); cancelSlide = undefined; resolve(); };
      const fallback = setTimeout(finish, 450);
      cancelSlide = finish;
      // Let React commit the intended position and CSS create the transition.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          const animations = button.querySelector('.dsh-ts-toggle__thumb')!.getAnimations();
          void Promise.all(animations.map(a => a.finished.catch(() => {}))).then(() => {
            if (cancelSlide === finish) frame = requestAnimationFrame(finish);
          });
        });
      });
    });
  }

  async function toggle(button: HTMLButtonElement, update: (phase: string) => void, showIntent: (scheme: Scheme | null) => void) {
    if (busy) return;
    busy = true;
    button.title = '切换明暗主题 · 时停';
    const snapshot = theme.getTheme();
    const current: Scheme = snapshot.active.colorScheme;
    const next: Scheme = current === 'dark' ? 'light' : 'dark';
    // A switch acknowledges the click immediately; the scene changes theme later.
    showIntent(next);
    update('playing');
    try {
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) void effect.resumeAudio().catch(() => {});
      await slideFirst(button);
      if (disposed) return;
      const bounds = (button.querySelector('.dsh-ts-toggle__switch') ?? button).getBoundingClientRect();
      await effect.play(
        { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
        () => theme.setTheme(next),
        () => { button.title = '音效加载失败，点击可重试'; },
      );
    } finally {
      busy = false;
      showIntent(null);
      update('idle');
    }
  }

  function ThemeButton({ wide }: { wide: boolean }) {
    const [scheme, setScheme] = React.useState(theme.getTheme().active.colorScheme);
    const [phase, setPhase] = React.useState('idle');
    const [intent, setIntent] = React.useState(null as Scheme | null);
    const switchScheme = intent ?? scheme;
    React.useEffect(() => ctx.on('theme/change', (snapshot: any) => setScheme(snapshot.active.colorScheme)), []);
    return React.createElement('button', {
      type: 'button', className: 'dsh-ts-toggle', 'data-wide': String(!!wide),
      'data-scheme': switchScheme, role: 'switch', 'aria-checked': switchScheme === 'dark',
      'data-dsh-time-stop-version': 'live-overlay-v1',
      'aria-label': '切换明暗主题并播放时停特效', title: '切换明暗主题 · 时停',
      'aria-busy': phase !== 'idle', disabled: phase !== 'idle',
      onClick: (event: any) => void toggle(event.currentTarget, setPhase, setIntent),
    }, React.createElement(scheme === 'dark' ? Sun : Moon, { size: wide ? 16 : 18 }),
      wide && React.createElement('span', { className: 'dsh-ts-toggle__label' }, '外观'),
      wide && React.createElement('span', { className: 'dsh-ts-toggle__switch', 'aria-hidden': 'true' },
        React.createElement('span', { className: 'dsh-ts-toggle__thumb' })));
  }
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: 'za-warudo-toggle', order: 90,
  }, ThemeButton));
}

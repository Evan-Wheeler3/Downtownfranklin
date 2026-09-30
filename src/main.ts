import { Game } from './game/game';
import { installDebugApi } from './game/debugApi';

const params = new URLSearchParams(location.search);
const container = document.getElementById('app')!;

const game = new Game({
  container,
  worldUrl: `${import.meta.env.BASE_URL}world`,
  forceWebGL: params.get('renderer') === 'webgl',
  lowQuality: params.get('quality') === 'low',
});

installDebugApi(game);

game.start().catch((err) => {
  console.error(err);
  container.innerHTML = `<pre style="color:#fff;padding:16px">Failed to start: ${String(err?.stack ?? err)}</pre>`;
  (window as unknown as { __franklinError: string }).__franklinError = String(err);
});

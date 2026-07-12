let installPrompt;

export function registerPwa() {
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; document.dispatchEvent(new Event('pwa-install-ready')); });
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) document.dispatchEvent(new Event('pwa-update-ready')); });
      });
    } catch (error) { console.warn('PWA registration failed', error); }
  });
}

export async function installPwa() {
  if (!installPrompt) return false;
  await installPrompt.prompt();
  const result = await installPrompt.userChoice;
  installPrompt = null;
  return result.outcome === 'accepted';
}

export function applyPwaUpdate() {
  navigator.serviceWorker.getRegistration().then(registration => registration?.waiting?.postMessage({ type:'SKIP_WAITING' }));
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once:true });
}

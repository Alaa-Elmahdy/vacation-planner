export function activateTab(tab, { buttons, panes, calendarToolbar }) {
  buttons.forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
  panes.forEach(pane => pane.classList.toggle('hidden', pane.id !== tab));
  if (calendarToolbar) calendarToolbar.classList.toggle('hidden', tab !== 'calendarTab');
  return tab;
}

export function pushScreen(hash, state = {}) {
  history.pushState(state, '', location.pathname + location.search + hash);
}

export function clearScreenHash(hash) {
  if (location.hash === hash) history.replaceState({}, '', location.pathname + location.search);
}

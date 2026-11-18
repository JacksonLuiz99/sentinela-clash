(function () {
  'use strict';
  const KEY = 'tigers-display';
  const defaults = { theme: 'dark', fontSize: 100 };
  const themes = ['dark', 'light', 'comfortable'];
  const root = document.documentElement;
  function sanitize(value) {
    const fontSize = Number(value?.fontSize);
    return {
      theme: themes.includes(value?.theme) ? value.theme : defaults.theme,
      fontSize: Number.isFinite(fontSize) && fontSize >= 90 && fontSize <= 140 && fontSize % 10 === 0 ? fontSize : defaults.fontSize
    };
  }
  function read() {
    try { return sanitize(JSON.parse(localStorage.getItem(KEY))); }
    catch { return { ...defaults }; }
  }
  let state = read();
  function apply(persist = false) {
    root.dataset.theme = state.theme;
    root.dataset.fontSize = String(state.fontSize);
    const color = { dark: '#0c0d0e', light: '#f4f5f6', comfortable: '#e9dfcc' }[state.theme];
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
    const select = document.getElementById('theme-select');
    if (select) select.value = state.theme;
    const output = document.getElementById('font-level');
    if (output) output.textContent = `${state.fontSize}%`;
    const decrease = document.getElementById('font-decrease');
    const increase = document.getElementById('font-increase');
    if (decrease) decrease.disabled = state.fontSize <= 90;
    if (increase) increase.disabled = state.fontSize >= 140;
    if (persist) { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* Os controles continuam funcionando sem armazenamento. */ } }
  }
  apply();
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    document.getElementById('theme-select').addEventListener('change', event => {
      state = sanitize({ ...state, theme: event.target.value }); apply(true);
    });
    document.getElementById('font-decrease').addEventListener('click', () => {
      state.fontSize = Math.max(90, state.fontSize - 10); apply(true);
    });
    document.getElementById('font-increase').addEventListener('click', () => {
      state.fontSize = Math.min(140, state.fontSize + 10); apply(true);
    });
    document.getElementById('font-reset').addEventListener('click', () => {
      state.fontSize = defaults.fontSize; apply(true);
    });
  });
  addEventListener('storage', event => {
    if (event.key === KEY || event.key === null) { state = read(); apply(); }
  });
})();

export function progressBar(el) {
  el.classList.add('progress'); el.setAttribute('role', 'progressbar'); el.setAttribute('aria-valuemin', '0'); el.setAttribute('aria-valuemax', '100');
  el.innerHTML = '<i></i>';
  const bar = el.firstElementChild;
  return {
    set(pct, state) {
      const v = Math.max(0, Math.min(100, pct));
      bar.style.width = v + '%'; el.setAttribute('aria-valuenow', String(Math.round(v)));
      el.classList.toggle('ok', state === 'ok'); el.classList.toggle('bad', state === 'bad');
    },
  };
}

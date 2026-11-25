const target = new EventTarget();
export const bus = {
  on(name, fn) { const h = (e) => fn(e.detail); target.addEventListener(name, h); return () => target.removeEventListener(name, h); },
  emit(name, detail) { target.dispatchEvent(new CustomEvent(name, { detail })); },
};

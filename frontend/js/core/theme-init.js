// Classic script in <head>: applies the saved theme before first paint to avoid a flash.
(function () {
  try {
    var t = localStorage.getItem('cc-theme');
    if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage unavailable */ }
})();

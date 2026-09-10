/* Tiny DOM helpers. Exposes WT.ui. */
(function (WT) {
  "use strict";

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === "class") node.className = v;
        else if (k === "text") node.textContent = v;
        else if (k === "html") node.innerHTML = v;
        else if (k.slice(0, 2) === "on") node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? "" : v);
      });
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  function pct(n) {
    return Math.round(n * 100) + "%";
  }

  /* Announce to screen readers without moving focus. */
  function say(message) {
    var live = document.getElementById("live");
    if (live) live.textContent = message;
  }

  /* The recurring object: a letter tile with a small value in the corner.
     `value` is whatever number belongs there — a level number, a word length —
     not a Scrabble letter score. */
  function tile(letter, value, opts) {
    var o = opts || {};
    var kids = [document.createTextNode(letter)];
    if (value != null) kids.push(el("span", { class: "tile-value", text: String(value) }));
    return el(
      o.as || "span",
      {
        class: "tile-face " + (o.class || ""),
        "aria-hidden": o.as ? null : "true",
        type: o.as === "button" ? "button" : null
      },
      kids
    );
  }

  WT.ui = { el: el, clear: clear, pct: pct, say: say, tile: tile };
})(window.WT || (window.WT = {}));

/* Food Jungle menu. The menu lives in the JSON block of the page (#menu-data).
   Customers get a read-only ordering menu. People with edit access get an Edit bar:
   changes are kept in memory, then "Save & publish" republishes the page with the new JSON. */
(function () {
  "use strict";
  var DEFAULT_ORDER_URL = "https://www.foodjungletakeaway.co.uk";
  var MENU_URL = "https://claude.ai/artifact/GfMEcrdd4hv6xmBhK5TnM6";
  function revLabel(n) { n = Number(n) || 1; return "Rev" + (n < 10 ? "0" : "") + n; }
  function head(rev) {
    return '<title>Food Jungle Menu ' + revLabel(rev) + '</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n'
      + '<link rel="preconnect" href="https://fonts.googleapis.com" />\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />\n'
      + '<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Barlow:wght@400;600;700&display=swap" rel="stylesheet" />\n'
      + '<link rel="stylesheet" href="app.css" />\n<div id="app"></div>\n';
  }
  var SKELETON_HEAD = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>'
    + ':root{color-scheme:light;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}'
    + '</style></head><body>';

  /* A downloaded copy carries its pictures inside the file (#fj-assets) and saves by downloading a new copy. */
  var assetsEl = document.getElementById("fj-assets"), STANDALONE = !!assetsEl, ASSETS = STANDALONE ? JSON.parse(assetsEl.textContent) : {};
  function asset(p) { return ASSETS[p] || p; }
  var VIEW_ONLY = STANDALONE && assetsEl.getAttribute("data-mode") === "view";   /* customer copy hosted on its own address */
  var saved = JSON.parse(document.getElementById("menu-data").textContent);
  var state = JSON.parse(JSON.stringify(saved));
  var editing = false, dirty = false, canWrite = false, artifactNs = null, query = "";
  var app = document.getElementById("app");

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function emph(s) { return esc(s).replace(/\*([^*]+)\*/g, "<b>$1</b>"); }
  function tel(s) { return "tel:" + String(s).replace(/[^0-9+]/g, ""); }
  function uid() { return "x" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); }
  function icon(n) { return '<svg aria-hidden="true"><use href="#i-' + n + '"/></svg>'; }
  function priceHTML(p) {
    return (p || []).map(function (x) {
      var label = (x[0] === "Price" || x[0] === "") ? "" : esc(x[0]) + " ";
      return '<span class="price">' + label + "<b>" + esc(x[1]) + "</b></span>";
    }).join("");
  }
  function normPrice(v) {
    v = String(v).trim();
    var m = v.replace(/^£\s*/, "");
    if (/^\d+(\.\d{1,2})?$/.test(m)) return "£" + Number(m).toFixed(2);
    return v;
  }
  function orderUrl() { var u = String(state.site.orderUrl || DEFAULT_ORDER_URL).trim(); return /^https?:\/\//i.test(u) ? u : "https://" + u; }
  function orderHost() { return orderUrl().replace(/^https?:\/\/(www\.)?/i, "").replace(/\/.*$/, ""); }
  function qrSrc(url, fallback) {
    try { if (typeof qrcode === "function") { var q = qrcode(0, "M"); q.addData(url); q.make(); return q.createDataURL(8, 16); } } catch (e) {}
    return fallback;
  }
  function catById(id) { return state.menu.filter(function (c) { return c.id === id; })[0]; }

  /* ---------------- page ---------------- */
  var ICONS = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>'
    + '<symbol id="i-phone" viewBox="0 0 24 24"><path d="M6.6 3.2c.5-.5 1.3-.5 1.8 0l2 2c.5.5.5 1.2.1 1.7L8.6 8.8a12.6 12.6 0 0 0 6.6 6.6l1.9-1.9c.5-.4 1.2-.4 1.7.1l2 2c.5.5.5 1.3 0 1.8l-1.3 1.3c-.6.6-1.4.8-2.2.6C10.6 17.7 6.3 13.4 4.7 6.7c-.2-.8 0-1.6.6-2.2z" fill="currentColor"/></symbol>'
    + '<symbol id="i-search" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.8-3.8"/></g></symbol>'
    + '<symbol id="i-eye" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></g></symbol>'
    + '<symbol id="i-bag" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></g></symbol>'
    + '<symbol id="i-pen" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></g></symbol>'
    + "</defs></svg>";

  function headerHTML() {
    var s = state.site;
    return '<header class="gutter"><div class="logo-wrap"><img src="' + esc(asset(s.logo || "brand/logo.jpg")) + '" alt="Food Jungle" /></div>'
      + "<h1>" + esc(s.descriptor) + "</h1>"
      + '' + (s.halal === false ? "" : '<div class="badges"><img class="halal-img" src="' + esc(asset("brand/halal.jpg")) + '" alt="Halal" /><span class="halal">100% HALAL</span></div>')
      + '<div class="head-meta">' + esc(s.tagline) + "<br />" + esc(s.hours) + '<br /><span class="addr">' + esc(s.address) + "</span></div>"
      + '<p class="photo-note">' + esc(s.note == null ? "Tap any dish to see its photo with full details and prices." : s.note) + "</p>"
      + '<div class="call-row"><a class="call-btn order" href="' + esc(orderUrl()) + '" target="_blank" rel="noopener">' + icon("bag") + "Order Online</a>"
      + '<a class="call-btn" href="' + tel(s.phone) + '">' + icon("phone") + esc(s.phone) + "</a>"
      + (s.whatsapp ? '<a class="call-btn" href="' + tel(s.whatsapp) + '">' + icon("phone") + esc(s.whatsapp) + "</a>" : "")
      + "</div></header>"
      + '<div class="offers gutter" aria-label="Offers">' + (s.offers || []).map(function (o) { return '<div class="offer">' + emph(o) + "</div>"; }).join("") + "</div>";
  }
  function footerHTML() {
    var s = state.site;
    return '<section class="scan gutter" id="scan" aria-labelledby="scanTitle"><h2 id="scanTitle">Scan &amp; Order</h2><p>Point your phone camera at a code. No app needed.</p><div class="qr-row">'
      + '<div class="qr-card"><div class="qr-box"><img src="' + qrSrc(VIEW_ONLY && /^https?:/.test(location.protocol) ? location.href.split("#")[0] : MENU_URL, "brand/qr-menu.svg") + '" alt="QR code that opens this menu" /></div><h3>View the menu</h3><p>Scan with your phone camera to open this menu.</p></div>'
      + '<div class="qr-card"><div class="qr-box"><img src="' + qrSrc(orderUrl(), "brand/qr-order.svg") + '" alt="QR code that opens online ordering" /></div><h3>Order online</h3><p>Opens <a href="' + esc(orderUrl()) + '" target="_blank" rel="noopener">' + esc(orderHost()) + "</a>.</p></div>"
      + "</div></section>"
      + '<footer class="gutter"><div class="f-name">FOOD JUNGLE</div><p class="f-tag">' + esc(s.tagline) + "</p>"
      + "<p>" + esc(s.address) + "<br />" + esc(s.hours) + "</p>"
      + '<p>Phone <a href="' + tel(s.phone) + '">' + esc(s.phone) + "</a>" + (s.whatsapp ? ' &nbsp;•&nbsp; WhatsApp <a href="' + tel(s.whatsapp) + '">' + esc(s.whatsapp) + "</a>" : "")
      + '<br /><a href="' + esc(orderUrl()) + '" target="_blank" rel="noopener">' + esc(orderHost()) + "</a></p>"
      + (s.delivery || []).map(function (l) { return "<p>" + esc(l) + "</p>"; }).join("")
      + "</footer>";
  }
  function menuHTML() {
    var html = "";
    state.menu.forEach(function (cat) {
      var items = (cat.items || []).filter(function (it) { return editing || !it.hide; });
      if (!editing && !cat.chips && !items.length) return;
      html += '<section id="sec-' + cat.id + '" data-cat="' + cat.id + '">'
        + '<div class="sec-head"><img class="sec-thumb" src="' + esc(asset(cat.th)) + '" alt="" /><h2>' + esc(cat.name) + "</h2></div>"
        + (cat.note ? '<p class="sec-note">' + esc(cat.note) + "</p>" : "");
      if (editing) html += '<div class="ed-row"><button type="button" class="ed-btn" data-act="add-item" data-cat="' + cat.id + '">+ Add dish</button>' + (cat.items && cat.items.length ? '<button type="button" class="ed-btn" data-act="price-list" data-cat="' + cat.id + '">Price list</button>' : "") + '<button type="button" class="ed-btn" data-act="edit-cat" data-cat="' + cat.id + '">Edit section</button></div>';
      if (cat.chips) {
        html += '<div class="chips">' + cat.chips.map(function (c) { return '<span class="chip" data-name="' + esc(c.toLowerCase()) + '">' + esc(c) + "</span>"; }).join("") + "</div>";
      } else {
        html += '<div class="grid">';
        (cat.items || []).forEach(function (it, i) {
          if (!editing && it.hide) return;
          html += '<button type="button" class="item' + (it.hide ? " is-hidden" : "") + '" data-name="' + esc((it.n + " " + it.d + " " + cat.name).toLowerCase()) + '" data-cat="' + cat.id + '" data-idx="' + i + '" aria-label="' + esc(it.n) + (editing ? ", edit" : ", view photo and details") + '">'
            + '<img class="item-photo" src="' + esc(asset(it.ph || cat.th)) + '" alt="" loading="lazy" />'
            + '<span class="item-main"><span class="item-top"><h3>' + esc(it.n) + '</h3><span class="chev" aria-hidden="true">›</span></span>'
            + (it.d ? '<span class="desc">' + esc(it.d) + "</span>" : "")
            + '<span class="prices">' + priceHTML(it.p) + "</span>"
            + (editing ? '<span class="view-hint">' + icon("pen") + (it.hide ? "Hidden from customers. Tap to edit" : "Tap to edit") + "</span>"
                       : '<span class="view-hint">' + icon("eye") + "Tap to see photo &amp; details</span>")
            + "</span></button>";
        });
        html += "</div>";
      }
      html += "</section>";
    });
    if (editing) html += '<div class="ed-row ed-end"><button type="button" class="ed-btn" data-act="add-cat">+ Add section</button></div>';
    return html;
  }
  function chipsHTML() {
    var h = '<button class="cat-chip" data-target="" aria-pressed="true">All</button>';
    state.menu.forEach(function (cat) { h += '<button class="cat-chip" data-target="sec-' + cat.id + '" aria-pressed="false">' + esc(cat.name) + "</button>"; });
    return h + '<button class="cat-chip" data-target="scan" aria-pressed="false">Scan &amp; Order</button>';
  }

  app.innerHTML = ICONS + '<div class="brand-watermark" aria-hidden="true"><span id="wm"></span></div>'
    + '<div id="top"></div>'
    + '<div class="toolbar gutter"><div class="toolbar-inner"><label class="search" for="search">' + icon("search")
    + '<input id="search" type="search" placeholder="Search the menu, try &quot;pizza&quot; or &quot;wings&quot;" autocomplete="off" /></label>'
    + '<nav class="cats" id="cats" aria-label="Menu categories"></nav></div></div>'
    + '<main id="menu" class="gutter"></main><div class="empty gutter" id="empty" hidden>No dish matches your search. Try another word.</div>'
    + '<div id="bottom"></div>'
    + '<div class="sheet-back" id="sheetBack"></div>'
    + '<div class="sheet" id="sheet" role="dialog" aria-modal="true" aria-label="Dish details"><button class="sheet-close" id="sheetClose" aria-label="Close">✕</button><div id="sheetInner"></div></div>'
    + '<div class="edbar" id="edbar" hidden></div><div class="toast" id="toast" role="status" hidden></div>';
  document.getElementById("wm").textContent = new Array(90).join("FOOD JUNGLE     ");

  var menuEl = document.getElementById("menu"), catsEl = document.getElementById("cats"), emptyEl = document.getElementById("empty");
  var sheet = document.getElementById("sheet"), back = document.getElementById("sheetBack"), inner = document.getElementById("sheetInner");
  var edbar = document.getElementById("edbar"), toastEl = document.getElementById("toast");

  function renderAll() {
    document.getElementById("top").innerHTML = headerHTML();
    document.getElementById("bottom").innerHTML = footerHTML();
    catsEl.innerHTML = chipsHTML();
    menuEl.innerHTML = menuHTML();
    document.body.classList.toggle("is-editing", editing);
    applySearch();
    renderBar();
  }
  function applySearch() {
    var any = false;
    menuEl.querySelectorAll("section").forEach(function (sec) {
      var visible = 0;
      sec.querySelectorAll(".item, .chip").forEach(function (el) {
        var show = !query || el.getAttribute("data-name").indexOf(query) !== -1;
        el.hidden = !show; if (show) visible++;
      });
      sec.hidden = !visible && !(editing && !query);
      if (!sec.hidden) any = true;
    });
    emptyEl.hidden = any;
  }
  document.getElementById("search").addEventListener("input", function (e) { query = e.target.value.trim().toLowerCase(); applySearch(); });
  catsEl.addEventListener("click", function (e) {
    var btn = e.target.closest(".cat-chip"); if (!btn) return;
    catsEl.querySelectorAll(".cat-chip").forEach(function (b) { b.setAttribute("aria-pressed", "false"); });
    btn.setAttribute("aria-pressed", "true");
    var t = btn.getAttribute("data-target"), el = t && document.getElementById(t);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); else window.scrollTo({ top: 0, behavior: "smooth" });
  });

  /* ---------------- sheet ---------------- */
  function openSheet(html) { inner.innerHTML = html; sheet.classList.add("open"); back.classList.add("open"); sheet.scrollTop = 0; }
  function closeSheet() { sheet.classList.remove("open"); back.classList.remove("open"); }
  document.getElementById("sheetClose").addEventListener("click", closeSheet);
  back.addEventListener("click", closeSheet);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeSheet(); });

  var NU_HEAD = ["Serving", "Weight", "kcal", "P", "C", "Sug", "Fat", "Sat", "Salt"];
  function nutritionHTML(it) {
    if (!it.nu || !it.nu.length) return "";
    return '<div class="nu"><div class="nu-title">Approx. nutrition per stated serving</div><div class="nu-scroll"><table><thead><tr>'
      + NU_HEAD.map(function (h) { return "<th>" + h + "</th>"; }).join("") + "</tr></thead><tbody>"
      + it.nu.map(function (r) { return "<tr>" + NU_HEAD.map(function (h, i) { return (i ? "<td>" : '<th scope="row">') + esc(r[i] == null ? "" : r[i]) + (i ? "</td>" : "</th>"); }).join("") + "</tr>"; }).join("")
      + '</tbody></table></div><p class="nu-note">Approximate guide only. Weight is the approximate portion size. P protein, C carbohydrate, Sug sugars, Sat saturates, in grams. Drinks are not included. Please tell us about any allergies before you order.</p></div>';
  }
  function showDish(cat, it) {
    openSheet('<img class="sheet-photo" src="' + esc(asset(it.ph || cat.th)) + '" alt="' + esc(it.n) + '" />'
      + '<div class="sheet-body"><div class="sheet-cat">' + esc(cat.name) + "</div><h3>" + esc(it.n) + "</h3>"
      + '<p class="desc">' + esc(it.d || cat.note || "") + '</p><div class="prices">' + priceHTML(it.p) + "</div>" + nutritionHTML(it)
      + '<div class="sheet-actions"><a class="call-btn" href="' + esc(orderUrl()) + '" target="_blank" rel="noopener">' + icon("bag") + "Order Online</a>"
      + '<a class="call-btn alt" href="' + tel(state.site.phone) + '">' + icon("phone") + "Call to Order: " + esc(state.site.phone) + "</a></div></div>");
  }
  menuEl.addEventListener("click", function (e) {
    var act = e.target.closest("[data-act]");
    if (act && editing) {
      var a = act.getAttribute("data-act"), c = catById(act.getAttribute("data-cat"));
      if (a === "add-item") { var it = { n: "New dish", d: "", p: [["Price", "£0.00"]], ph: c.th }; c.items = c.items || []; c.items.push(it); touch(); editDish(c, c.items.length - 1, true); }
      if (a === "edit-cat") editCat(c);
      if (a === "price-list") priceList(c);
      if (a === "add-cat") { var nc = { id: uid(), name: "New section", note: "", th: state.menu[0].th, items: [] }; state.menu.push(nc); touch(); editCat(nc); }
      return;
    }
    var card = e.target.closest(".item"); if (!card) return;
    var cat = catById(card.getAttribute("data-cat")); if (!cat || !cat.items) return;
    var idx = +card.getAttribute("data-idx");
    if (editing) editDish(cat, idx); else showDish(cat, cat.items[idx]);
  });

  /* ---------------- editing ---------------- */
  function touch() { dirty = true; renderAll(); }
  function toast(msg, ms) { toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { toastEl.hidden = true; }, ms || 4500); }
  function field(id, label, value, multi) {
    return '<label class="fld" for="' + id + '"><span>' + label + "</span>" + (multi
      ? '<textarea id="' + id + '" rows="' + multi + '">' + esc(value) + "</textarea>"
      : '<input id="' + id + '" type="text" value="' + esc(value) + '" />') + "</label>";
  }
  function val(id) { return document.getElementById(id).value.trim(); }
  function armDelete(btn, fn) {
    btn.addEventListener("click", function () {
      if (btn.getAttribute("data-armed")) return fn();
      btn.setAttribute("data-armed", "1"); btn.textContent = "Tap again to delete";
    });
  }
  /* Pick a picture from the device, shrink it, and hand back a data URL that is saved inside the menu. */
  function pickImage(maxPx, fill, cb) {
    var inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
    inp.addEventListener("change", function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onerror = function () { toast("Could not read that picture. Try another file."); };
      rd.onload = function () {
        var img = new Image();
        img.onerror = function () { toast("That file is not a picture this page can use. Try a JPG or PNG."); };
        img.onload = function () {
          var k = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
          var c = document.createElement("canvas"); c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
          var g = c.getContext("2d"); g.fillStyle = fill; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
          cb(c.toDataURL("image/jpeg", 0.7));
        };
        img.src = rd.result;
      };
      rd.readAsDataURL(f);
    });
    inp.click();
  }
  function photoFld(id, src, label, resetLabel) {
    return '<div class="fld"><span>' + label + '</span><div class="ph-row"><img class="ph-prev" id="' + id + 'Prev" src="' + esc(asset(src)) + '" alt="" />'
      + '<div class="ph-btns"><button type="button" class="ed-btn" id="' + id + 'Pick">Choose picture</button>'
      + (resetLabel ? '<button type="button" class="ed-btn" id="' + id + 'Reset">' + resetLabel + "</button>" : "") + "</div></div>"
      + "<small>Pick a photo from this phone or computer. It is shrunk automatically.</small></div>";
  }
  function priceRow(l, v) {
    return '<div class="prow"><input type="text" class="pl" aria-label="Size or type" placeholder="Size, e.g. 10&quot; or Meal" value="' + esc(l === "Price" ? "" : l) + '" />'
      + '<input type="text" class="pv" aria-label="Price" placeholder="£0.00" inputmode="decimal" value="' + esc(v) + '" /><button type="button" class="prm" aria-label="Remove this price">✕</button></div>';
  }
  function editDish(cat, idx, isNew) {
    var it = cat.items[idx];
    openSheet('<div class="sheet-body ed-form"><div class="sheet-cat">Edit dish · ' + esc(cat.name) + "</div>"
      + photoFld("edPh", it.ph || cat.th, "Picture", "Use section picture")
      + field("edName", "Dish name", it.n) + field("edDesc", "Description", it.d, 3)
      + '<div class="fld"><span>Prices</span><div id="edPrices">' + (it.p || []).map(function (x) { return priceRow(x[0], x[1]); }).join("") + '</div><button type="button" class="ed-btn" id="edAddPrice">+ Add another price</button>'
      + '<small>Leave the size box empty for a single price. Type 4.99 and it becomes £4.99.</small></div>'
      + '<label class="fld" for="edNu"><span>Approx. portion size and nutrition</span><textarea id="edNu" rows="4" placeholder="Single burger, 255 g, 660, 42, 46, 3, 35, 6, 2.5">' + esc((it.nu || []).map(function (r) { return r.join(" | "); }).join("\n")) + "</textarea>"
      + "<small>One serving per line, values separated by | in this order: Serving | Weight | kcal | P | C | Sug | Fat | Sat | Salt. Leave empty to show no table.</small></label>"
      + '<label class="chk"><input type="checkbox" id="edHide"' + (it.hide ? " checked" : "") + " /> Hide this dish from customers (sold out or seasonal)</label>"
      + '<div class="ed-actions"><button type="button" class="call-btn" id="edDone">Done</button>'
      + '<div class="ed-row"><button type="button" class="ed-btn" id="edUp">Move up</button><button type="button" class="ed-btn" id="edDown">Move down</button><button type="button" class="ed-btn danger" id="edDel">Delete dish</button></div></div></div>');
    var newPh = it.ph;
    document.getElementById("edPhPick").addEventListener("click", function () { pickImage(520, "#ffffff", function (u) { newPh = u; document.getElementById("edPhPrev").src = u; }); });
    document.getElementById("edPhReset").addEventListener("click", function () { newPh = cat.th; document.getElementById("edPhPrev").src = asset(cat.th); });
    var box = document.getElementById("edPrices");
    document.getElementById("edAddPrice").addEventListener("click", function () { box.insertAdjacentHTML("beforeend", priceRow("", "")); });
    box.addEventListener("click", function (e) { var b = e.target.closest(".prm"); if (b) b.parentNode.remove(); });
    function commit() {
      it.n = val("edName") || "Untitled dish"; it.d = val("edDesc"); it.ph = newPh; it.hide = document.getElementById("edHide").checked || undefined;
      var p = []; box.querySelectorAll(".prow").forEach(function (r) {
        var v = normPrice(r.querySelector(".pv").value); if (!v) return;
        p.push([r.querySelector(".pl").value.trim() || "Price", v]);
      });
      it.p = p; if (!it.hide) delete it.hide;
      var nu = document.getElementById("edNu").value.split("\n").map(function (l) { return l.split("|").map(function (x) { return x.trim(); }); }).filter(function (r) { return r.join("") !== ""; })
        .map(function (r) { r = r.slice(0, 9); while (r.length < 9) r.push(""); return r; });
      if (nu.length) it.nu = nu; else delete it.nu;
    }
    document.getElementById("edDone").addEventListener("click", function () { commit(); closeSheet(); touch(); });
    function move(d) { commit(); var j = idx + d; if (j < 0 || j >= cat.items.length) return; cat.items.splice(idx, 1); cat.items.splice(j, 0, it); idx = j; touch(); toast("Moved. Tap Done when finished.", 2000); }
    document.getElementById("edUp").addEventListener("click", function () { move(-1); });
    document.getElementById("edDown").addEventListener("click", function () { move(1); });
    armDelete(document.getElementById("edDel"), function () { cat.items.splice(idx, 1); closeSheet(); touch(); });
    if (isNew) { var n = document.getElementById("edName"); n.focus(); n.select(); }
  }
  function editCat(cat) {
    var i = state.menu.indexOf(cat);
    openSheet('<div class="sheet-body ed-form"><div class="sheet-cat">Edit section</div>'
      + photoFld("ecPh", cat.th, "Section picture (the round one beside the heading)", "")
      + field("ecName", "Section name", cat.name) + field("ecNote", "Line under the heading (optional)", cat.note, 2)
      + (cat.chips ? field("ecChips", "Items, one per line", cat.chips.join("\n"), 10) : "")
      + '<div class="ed-actions"><button type="button" class="call-btn" id="ecDone">Done</button>'
      + '<div class="ed-row"><button type="button" class="ed-btn" id="ecUp">Move section up</button><button type="button" class="ed-btn" id="ecDown">Move section down</button><button type="button" class="ed-btn danger" id="ecDel">Delete section</button></div></div></div>');
    var newTh = cat.th;
    document.getElementById("ecPhPick").addEventListener("click", function () { pickImage(320, "#ffffff", function (u) { newTh = u; document.getElementById("ecPhPrev").src = u; }); });
    function commit() { cat.th = newTh; cat.name = val("ecName") || "Untitled section"; cat.note = val("ecNote"); if (cat.chips) cat.chips = val("ecChips").split("\n").map(function (x) { return x.trim(); }).filter(Boolean); }
    document.getElementById("ecDone").addEventListener("click", function () { commit(); closeSheet(); touch(); });
    function move(d) { commit(); var j = i + d; if (j < 0 || j >= state.menu.length) return; state.menu.splice(i, 1); state.menu.splice(j, 0, cat); i = j; touch(); }
    document.getElementById("ecUp").addEventListener("click", function () { move(-1); });
    document.getElementById("ecDown").addEventListener("click", function () { move(1); });
    armDelete(document.getElementById("ecDel"), function () { state.menu.splice(i, 1); closeSheet(); touch(); });
  }
  function editSite() {
    var s = state.site;
    openSheet('<div class="sheet-body ed-form"><div class="sheet-cat">Shop details and offers</div>'
      + photoFld("esLogo", s.logo || "brand/logo.jpg", "Logo (shown on the black header)", "Use original logo")
      + field("esOrder", "Online ordering link (the Order Online buttons and the order QR code)", s.orderUrl || DEFAULT_ORDER_URL)
      + field("esHours", "Opening hours", s.hours) + field("esAddr", "Address", s.address) + field("esPhone", "Phone", s.phone) + field("esWa", "WhatsApp", s.whatsapp)
      + field("esTag", "Tagline", s.tagline) + field("esDesc", "Line under the logo", s.descriptor)
      + field("esOffers", "Offers, one per line. Put *stars* around the part to highlight", (s.offers || []).join("\n"), 6)
      + field("esDel", "Delivery and footer notes, one per line", (s.delivery || []).join("\n"), 4)
      + field("esNote", "Small line above the buttons", s.note == null ? "Tap any dish to see its photo with full details and prices." : s.note)
      + '<label class="chk"><input type="checkbox" id="esHalal"' + (s.halal === false ? "" : " checked") + " /> Show the Halal badges</label>"
      + '<div class="ed-actions"><button type="button" class="call-btn" id="esDone">Done</button></div></div>');
    var newLogo = s.logo || "";
    document.getElementById("esLogoPick").addEventListener("click", function () { pickImage(720, "#000000", function (u) { newLogo = u; document.getElementById("esLogoPrev").src = u; }); });
    document.getElementById("esLogoReset").addEventListener("click", function () { newLogo = ""; document.getElementById("esLogoPrev").src = asset("brand/logo.jpg"); });
    document.getElementById("esDone").addEventListener("click", function () {
      function lines(id) { return val(id).split("\n").map(function (x) { return x.trim(); }).filter(Boolean); }
      s.hours = val("esHours"); s.address = val("esAddr"); s.phone = val("esPhone"); s.whatsapp = val("esWa"); s.tagline = val("esTag"); s.descriptor = val("esDesc");
      s.offers = lines("esOffers"); s.delivery = lines("esDel"); s.note = val("esNote"); s.halal = document.getElementById("esHalal").checked;
      s.orderUrl = val("esOrder") || DEFAULT_ORDER_URL; if (newLogo) s.logo = newLogo; else delete s.logo;
      closeSheet(); touch();
    });
  }

  /* ---------------- price tools ---------------- */
  function parseMoney(v) { var m = /^£\s*(\d+(?:\.\d{1,2})?)$/.exec(String(v).trim()); return m ? Number(m[1]) : null; }
  function roundTo(v, mode) {
    if (mode === "exact") return Math.round(v * 100) / 100;
    if (mode === "10p") return Math.round(v * 10) / 10;
    var f = Math.floor(v), c = mode === "99" ? [f - 0.01, f + 0.99] : [f - 0.01, f + 0.49, f + 0.99], best = null;
    c.forEach(function (x) { if (x > 0 && (best === null || Math.abs(x - v) < Math.abs(best - v))) best = x; });
    return Math.round((best === null ? v : best) * 100) / 100;
  }
  function opt(v, t, sel) { return '<option value="' + esc(v) + '"' + (sel ? " selected" : "") + ">" + esc(t) + "</option>"; }
  function selectFld(id, label, options) { return '<label class="fld" for="' + id + '"><span>' + label + '</span><select id="' + id + '">' + options + "</select></label>"; }
  function bulkPrices() {
    openSheet('<div class="sheet-body ed-form"><div class="sheet-cat">Change many prices at once</div>'
      + selectFld("bpScope", "Which dishes", opt("", "Whole menu", true) + state.menu.filter(function (c) { return c.items; }).map(function (c) { return opt(c.id, c.name); }).join(""))
      + selectFld("bpLabel", "Which prices", "")
      + selectFld("bpKind", "Change", opt("up%", "Increase by %", true) + opt("down%", "Decrease by %") + opt("up£", "Increase by £ amount") + opt("down£", "Decrease by £ amount"))
      + '<label class="fld" for="bpAmt"><span>Amount</span><input id="bpAmt" type="text" inputmode="decimal" placeholder="e.g. 10 for 10%, or 0.50 for 50p" /></label>'
      + selectFld("bpRound", "Round the new prices", opt("4999", "To end in .49 or .99", true) + opt("99", "To end in .99") + opt("10p", "To the nearest 10p") + opt("exact", "Do not round"))
      + '<div class="bp-preview" id="bpPrev" aria-live="polite"></div>'
      + '<div class="ed-actions"><button type="button" class="call-btn" id="bpApply" disabled>Apply to menu</button>'
      + "<small>Nothing reaches customers until you tap Save &amp; publish. Discard undoes it.</small></div></div>");
    var scope = document.getElementById("bpScope"), label = document.getElementById("bpLabel"), prev = document.getElementById("bpPrev"), apply = document.getElementById("bpApply");
    function cats() { return state.menu.filter(function (c) { return c.items && (!scope.value || c.id === scope.value); }); }
    function fillLabels() {
      var seen = {}, list = [];
      cats().forEach(function (c) { c.items.forEach(function (it) { it.p.forEach(function (x) { if (parseMoney(x[1]) !== null && !seen[x[0]]) { seen[x[0]] = 1; list.push(x[0]); } }); }); });
      label.innerHTML = opt("", "All sizes and types", true) + list.map(function (l) { return opt(l, l === "Price" ? "Single-price dishes" : "Only " + l); }).join("");
    }
    function plan() {
      var amt = Number(String(document.getElementById("bpAmt").value).replace(/[£%\s]/g, "")), kind = document.getElementById("bpKind").value, mode = document.getElementById("bpRound").value, out = [], skipped = 0;
      if (!(amt > 0)) return { rows: out, skipped: 0, bad: true };
      cats().forEach(function (c) { c.items.forEach(function (it) { it.p.forEach(function (x) {
        if (label.value && x[0] !== label.value) return;
        var v = parseMoney(x[1]); if (v === null) { skipped++; return; }
        var n = kind === "up%" ? v * (1 + amt / 100) : kind === "down%" ? v * (1 - amt / 100) : kind === "up£" ? v + amt : v - amt;
        n = roundTo(Math.max(n, 0.01), mode);
        var txt = "£" + n.toFixed(2);
        if (txt !== x[1]) out.push({ ref: x, name: it.n + (x[0] === "Price" ? "" : " (" + x[0] + ")"), from: x[1], to: txt });
      }); }); });
      return { rows: out, skipped: skipped };
    }
    function preview() {
      var p = plan(); apply.disabled = !p.rows.length;
      if (p.bad) { prev.textContent = "Enter an amount to see what will change."; return; }
      prev.innerHTML = "<b>" + p.rows.length + " price" + (p.rows.length === 1 ? "" : "s") + " will change.</b>"
        + (p.skipped ? " " + p.skipped + " without a £ price (such as Ask staff) stay as they are." : "")
        + "<ul>" + p.rows.slice(0, 6).map(function (r) { return "<li>" + esc(r.name) + ": " + esc(r.from) + " → <b>" + esc(r.to) + "</b></li>"; }).join("") + "</ul>"
        + (p.rows.length > 6 ? "and " + (p.rows.length - 6) + " more." : "");
    }
    scope.addEventListener("change", function () { fillLabels(); preview(); });
    ["bpLabel", "bpKind", "bpRound"].forEach(function (id) { document.getElementById(id).addEventListener("change", preview); });
    document.getElementById("bpAmt").addEventListener("input", preview);
    apply.addEventListener("click", function () {
      var p = plan(); if (!p.rows.length) return;
      p.rows.forEach(function (r) { r.ref[1] = r.to; });
      closeSheet(); touch(); toast(p.rows.length + " prices changed. Tap Save & publish to make them live.", 6000);
    });
    fillLabels(); preview();
  }
  function priceList(cat) {
    openSheet('<div class="sheet-body ed-form"><div class="sheet-cat">Price list · ' + esc(cat.name) + "</div>"
      + '<div class="pl-list">' + cat.items.map(function (it, i) {
        return '<div class="pl-item"><div class="pl-name">' + esc(it.n) + '</div><div class="pl-prices">' + it.p.map(function (x, k) {
          return '<label><span>' + esc(x[0] === "Price" ? "Price" : x[0]) + '</span><input type="text" inputmode="decimal" data-i="' + i + '" data-k="' + k + '" value="' + esc(x[1]) + '" aria-label="' + esc(it.n + " " + x[0]) + '" /></label>';
        }).join("") + "</div></div>";
      }).join("") + "</div>"
      + '<div class="ed-actions"><button type="button" class="call-btn" id="plDone">Done</button><small>Type 4.99 and it becomes £4.99.</small></div></div>');
    document.getElementById("plDone").addEventListener("click", function () {
      var n = 0;
      inner.querySelectorAll(".pl-prices input").forEach(function (inp) {
        var x = cat.items[+inp.getAttribute("data-i")].p[+inp.getAttribute("data-k")], v = normPrice(inp.value);
        if (v && v !== x[1]) { x[1] = v; n++; }
      });
      closeSheet(); if (n) { touch(); toast(n + " price" + (n === 1 ? "" : "s") + " changed. Tap Save & publish to make them live.", 5000); }
    });
  }

  function renderBar() {
    if (!canWrite) { edbar.hidden = true; return; }
    edbar.hidden = false;
    edbar.innerHTML = editing
      ? '<span class="ed-status">' + revLabel(saved.rev) + ". " + (dirty ? "Unsaved changes, will save as " + revLabel((Number(saved.rev) || 1) + 1) : "Tap a dish to change it") + "</span>"
        + '<button type="button" class="ed-btn" data-bar="import">Import menu file</button><button type="button" class="ed-btn" data-bar="bulk">Bulk prices</button><button type="button" class="ed-btn" data-bar="site">Shop details</button><button type="button" class="ed-btn" data-bar="cancel">' + (dirty ? "Discard" : "Close") + "</button>"
        + '<button type="button" class="ed-btn primary" data-bar="save"' + (dirty ? "" : " disabled") + ">" + (STANDALONE ? "Save a copy" : "Save &amp; publish") + "</button>"
      : '<span class="ed-status">' + revLabel(saved.rev) + '</span><button type="button" class="ed-btn primary" data-bar="edit">' + icon("pen") + "Edit menu</button>";
  }
  edbar.addEventListener("click", function (e) {
    var b = e.target.closest("[data-bar]"); if (!b) return;
    var a = b.getAttribute("data-bar");
    if (a === "edit") { editing = true; renderAll(); }
    if (a === "site") editSite();
    if (a === "bulk") bulkPrices();
    if (a === "cancel") {
      if (dirty && !b.getAttribute("data-armed")) { b.setAttribute("data-armed", "1"); b.textContent = "Tap again to discard"; return; }
      state = JSON.parse(JSON.stringify(saved)); dirty = false; editing = false; closeSheet(); renderAll();
    }
    if (a === "save") { if (STANDALONE) saveCopy(); else save(b); }
    if (a === "import") importFile();
  });
  function documentFor(st) {
    var json = JSON.stringify(st).replace(/</g, "\\u003c");
    return SKELETON_HEAD + head(st.rev) + '<script type="application/json" id="menu-data">' + json + "<\/script>\n<script src=\"qrcode.js\"><\/script>\n<script src=\"app.js\"><\/script>\n</body></html>";
  }
  /* Load the menu from a Food_Jungle_Menu_RevNN file (a downloaded copy). Nothing is live until it is saved. */
  function importFile() {
    var inp = document.createElement("input"); inp.type = "file"; inp.accept = ".html,text/html";
    inp.addEventListener("change", function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onerror = function () { toast("Could not read that file."); };
      rd.onload = function () {
        try {
          var m = /<script type="application\/json" id="menu-data">([\s\S]*?)<\/script>/.exec(String(rd.result));
          var st = JSON.parse(m[1]);
          if (!st || !st.site || !Array.isArray(st.menu) || !st.menu.length) throw new Error("shape");
          st.rev = saved.rev; state = st; dirty = true; editing = true; closeSheet(); renderAll();
          toast("Menu loaded from " + f.name + ". Check it, then tap " + (STANDALONE ? "Save a copy" : "Save & publish") + ".", 7000);
        } catch (e) { toast("That is not a Food Jungle menu file. Choose a Food_Jungle_Menu_Rev file.", 7000); }
      };
      rd.readAsText(f);
    });
    inp.click();
  }
  function standaloneDoc(st) {
    function txt(id) { return document.getElementById(id).textContent; }
    var json = JSON.stringify(st).replace(/</g, "\\u003c");
    return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
      + "<title>Food Jungle Menu " + revLabel(st.rev) + "</title>"
      + '<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Barlow:wght@400;600;700&display=swap" rel="stylesheet" />'
      + '<style id="fj-css">' + txt("fj-css") + '</style></head><body><div id="app"></div>'
      + '<script type="application/json" id="fj-assets">' + txt("fj-assets") + "<\/script>"
      + '<script type="application/json" id="menu-data">' + json + "<\/script>"
      + '<script id="fj-qr">' + txt("fj-qr") + "<\/script>" + '<script id="fj-app">' + txt("fj-app") + "<\/script></body></html>";
  }
  function saveCopy() {
    if (!dirty) return;
    var next = JSON.parse(JSON.stringify(state)); next.rev = (Number(saved.rev) || 1) + 1; next.savedAt = new Date().toISOString();
    var name = "Food_Jungle_Menu_" + revLabel(next.rev) + "_Editable.html";
    try {
      var url = URL.createObjectURL(new Blob([standaloneDoc(next)], { type: "text/html" }));
      var a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    } catch (e) { toast("Could not save a copy in this browser. Try Chrome or Edge on a computer.", 7000); return; }
    state = next; saved = JSON.parse(JSON.stringify(next)); dirty = false; renderAll();
    toast("Saved as " + name + " in your Downloads. To put it online, open the online menu, tap Edit menu, then Import menu file.", 12000);
  }
  function save(btn) {
    if (!artifactNs || !dirty) return;
    var next = JSON.parse(JSON.stringify(state)); next.rev = (Number(saved.rev) || 1) + 1; next.savedAt = new Date().toISOString();
    var doc = documentFor(next);
    if (doc.length > 12000000) { toast("Too many large pictures to save. Remove a few new pictures and try again.", 7000); return; }
    btn.disabled = true; btn.textContent = "Saving…";
    try { sessionStorage.setItem("fj-menu-draft", JSON.stringify(state)); } catch (e) {}
    artifactNs.publish(doc).then(function () {
      try { sessionStorage.removeItem("fj-menu-draft"); } catch (e) {}
      state = next; saved = JSON.parse(JSON.stringify(next)); dirty = false; editing = false; renderAll();
      toast("Saved as " + revLabel(next.rev) + ". The live menu is updated.");
    }).catch(function (err) {
      var code = err && err.code;
      if (code === "conflict") { toast("Someone else saved the menu first. Reloading the latest version.", 6000); return; }
      if (code === "not_writer" || code === "not_granted" || code === "not_declared" || code === "consent_required" || code === "capability_disabled") {
        canWrite = false; editing = false; state = JSON.parse(JSON.stringify(saved)); dirty = false; renderAll();
        toast("This view is read-only. Open the menu from your own Claude account to edit it.", 7000); return;
      }
      renderBar();
      toast(code === "too_large" ? "The menu is too large to save. Shorten some descriptions and try again."
        : code === "rate_limited" ? "Saving too often. Wait a minute, then tap Save & publish again."
        : "Could not save just now. Your changes are still here. Tap Save & publish to try again.", 7000);
    });
  }

  /* A copy marked data-mode="view" is the customer version: menu and ordering only, no edit tools. */
  if (STANDALONE && assetsEl.getAttribute("data-mode") !== "view") canWrite = true;
  renderAll();

  /* Light up editing only for people who can write to this page. */
  if (window.claude && typeof window.claude.use === "function") {
    Promise.all([window.claude.use("artifact"), window.claude.use("user")]).then(function (r) {
      artifactNs = r[0]; var user = r[1];
      if (!artifactNs || !user) return;
      return user.canEdit().then(function (ok) {
        if (!ok) return;
        canWrite = true;
        try {
          var d = sessionStorage.getItem("fj-menu-draft");
          if (d && d !== JSON.stringify(saved)) { state = JSON.parse(d); editing = true; dirty = true; toast("Your unsaved changes were restored.", 5000); }
          sessionStorage.removeItem("fj-menu-draft");
        } catch (e) {}
        renderAll();
      });
    }).catch(function () {});
  }
})();

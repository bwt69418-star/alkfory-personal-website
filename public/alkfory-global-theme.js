
(() => {
  const themes = {
    default:  ["#b00035","#ff4778"],
    green:    ["#00b86b","#42bfff"],
    blue:     ["#087cf0","#53c7ff"],
    purple:   ["#923be0","#e0b5ff"],
    gold:     ["#c69b20","#ffe082"],
    orange:   ["#e87516","#ffc078"],
    cyan:     ["#009eae","#80f0ff"],
    pink:     ["#df438b","#ffadd5"],
    red:      ["#e32636","#ff8b94"],
    teal:     ["#008f83","#72e5d8"]
  };

  function applyTheme() {
    let selected = "default";
    try {
      selected = localStorage.getItem("alkfory-theme") || "default";
    } catch(e) {}

    const pair = themes[selected] || themes.default;
    const root = document.documentElement;
    root.style.setProperty("--alkfory-accent", pair[0]);
    root.style.setProperty("--alkfory-accent2", pair[1]);
    root.style.setProperty("--alkfory-border", pair[0]);
    root.style.setProperty("--alkfory-glow", pair[0] + "55");
    root.style.setProperty("--accent", pair[0]);
    root.style.setProperty("--accent2", pair[1]);
    root.style.setProperty("--text-accent", pair[1]);
    root.style.setProperty("--border-accent", pair[0]);

    if (document.body) document.body.dataset.theme = selected;
  }

  function addBackButton() {
    const path = location.pathname.toLowerCase();
    const bodyText = document.body?.innerText || "";
    const isPlatformPage =
      path.includes("platforms") ||
      path.includes("alkfory-ai") ||
      bodyText.includes("منصة الكفوري");

    if (!isPlatformPage || document.querySelector(".alkfory-back-button")) return;

    const button = document.createElement("button");
    button.className = "alkfory-back-button";
    button.type = "button";
    button.textContent = "↩ رجوع";
    button.onclick = () => {
      if (history.length > 1) history.back();
      else location.href = "/";
    };

    const candidates = [...document.querySelectorAll(
      "h1,h2,.brand,.logo,.site-title,.navbar-brand,[class*='brand'],[id*='brand']"
    )];

    const title = candidates.find(el => {
      const t = (el.innerText || el.textContent || "").trim();
      return t.length < 100 && /(الكفوري|ALKFORY)/i.test(t);
    });

    if (title) {
      title.insertAdjacentElement("afterend", button);
    } else {
      const header = document.querySelector("header,nav,.navbar,.topbar") || document.body;
      header.prepend(button);
    }
  }

  function start() {
    applyTheme();
    addBackButton();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  window.addEventListener("storage", e => {
    if (e.key === "alkfory-theme") applyTheme();
  });
})();


// ALKFORY CUSTOM ALERT
(() => {
  if (window.__alkforyCustomAlertInstalled) return;
  window.__alkforyCustomAlertInstalled = true;

  const nativeAlert = window.alert.bind(window);

  function showAlert(message) {
    try {
      let overlay = document.getElementById("alkfory-alert-overlay");

      if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "alkfory-alert-overlay";
        overlay.innerHTML = `
          <div id="alkfory-alert-box" role="alertdialog"
               aria-modal="true" aria-labelledby="alk-alert-title">
            <div class="alk-alert-symbol">!</div>
            <h2 class="alk-alert-title" id="alk-alert-title">تنبيه من منصة الكفوري</h2>
            <p class="alk-alert-message" id="alk-alert-message"></p>
            <button class="alk-alert-ok" type="button">حسنًا</button>
          </div>`;
        document.body.appendChild(overlay);

        const close = () => overlay.classList.remove("alk-show");
        overlay.querySelector(".alk-alert-ok").addEventListener("click", close);
        overlay.addEventListener("click", e => {
          if (e.target === overlay) close();
        });
        document.addEventListener("keydown", e => {
          if (e.key === "Escape") close();
        });
      }

      overlay.querySelector("#alk-alert-message").textContent =
        String(message ?? "");
      overlay.classList.add("alk-show");
      overlay.querySelector(".alk-alert-ok").focus();
    } catch (e) {
      nativeAlert(message);
    }
  }

  window.alert = showAlert;
})();


/* ALKFORY-INSTALL-APP-MENU-V1 */
(() => {
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    addInstallButton();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    const btn = document.getElementById('alkforyInstallAppButton');
    if (btn) btn.textContent = 'تم تثبيت التطبيق ✓';
  });

  function addInstallButton() {
    if (document.getElementById('alkforyInstallAppButton')) return;

    const elements = [...document.querySelectorAll('a,button,[role="button"]')];
    const platform = elements.find(el => (el.innerText || '').includes('منصة الكفوري'));
    const appearance = elements.find(el => /تغيير المظهر|تغيير اللون/.test(el.innerText || ''));

    if (!platform || !appearance) return;

    let menu = platform.parentElement;
    while (menu && !menu.contains(appearance)) menu = menu.parentElement;
    if (!menu || menu === document.body) return;

    const button = document.createElement('button');
    button.id = 'alkforyInstallAppButton';
    button.type = 'button';
    button.textContent = '📲 تثبيت التطبيق';
    button.style.cssText = [
      'display:block','width:100%','margin-top:9px',
      'padding:12px 14px','border:1px solid #ff3030',
      'border-radius:12px','background:#111',
      'color:#fff','font-weight:bold','font-size:14px',
      'text-align:center','cursor:pointer'
    ].join(';');

    button.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        button.textContent = '📲 تثبيت التطبيق';
      } else if (window.matchMedia('(display-mode: standalone)').matches) {
        button.textContent = 'التطبيق مثبت بالفعل ✓';
      } else {
        alert('لتثبيت التطبيق: افتح قائمة المتصفح ثم اختر "إضافة إلى الشاشة الرئيسية" أو "تثبيت التطبيق".');
      }
    });

    menu.appendChild(button);
  }

  const observer = new MutationObserver(addInstallButton);
  function start() {
    addInstallButton();
    observer.observe(document.body, {childList:true, subtree:true});
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, {once:true});
  } else {
    start();
  }
})();






/* ALKFORY-REMOVE-SIDEBAR-LANGUAGE-BUTTON */
(() => {
  function removeLanguageButton() {
    document.querySelectorAll('button,a,[role="button"]').forEach(el => {
      const t = (el.innerText || el.textContent || '').trim().replace(/\s+/g,' ');
      if (/^(العربية\s*[|/،,-]\s*English|English\s*[|/،,-]\s*العربية)$/.test(t)) {
        el.remove();
      }
    });
    document.documentElement.lang = 'ar';
    document.documentElement.dir = 'rtl';
  }

  removeLanguageButton();
  const observer = new MutationObserver(removeLanguageButton);
  if (document.documentElement) {
    observer.observe(document.documentElement,{childList:true,subtree:true});
  }
})();

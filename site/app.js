// Mejora progresiva: la página funciona sin esto. Destaca la descarga del sistema
// del visitante y añade los botones de copiar el SHA-256.

function detectOS() {
  const ua = navigator.userAgent;
  const platform = navigator.userAgentData?.platform ?? "";
  if (/android/i.test(platform) || /Android/.test(ua)) return "android";
  if (/iPhone|iPad|iPod/.test(ua) || (/Mac/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/windows/i.test(platform) || /Windows/.test(ua)) return "windows";
  if (/macos/i.test(platform) || /Mac OS X|Macintosh/.test(ua)) return "macos";
  if (/linux/i.test(platform) || /Linux|X11/.test(ua)) return "linux";
  return null;
}

const os = detectOS();
if (os) document.documentElement.dataset.os = os;

for (const app of document.querySelectorAll(".app")) {
  const primary = os && app.querySelector(`.primary[data-os="${os}"]`);
  if (primary) {
    primary.hidden = false;
    app.querySelector(`.platform[data-os="${os}"]`)?.classList.add("current");
  } else {
    const none = app.querySelector(".primary-none");
    if (none?.textContent.trim()) none.hidden = false;
  }
}

for (const button of document.querySelectorAll(".copy")) {
  if (!navigator.clipboard) continue;
  button.hidden = false;
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      button.textContent = "Copiado";
    } catch {
      button.textContent = "No se pudo copiar";
    }
    setTimeout(() => (button.textContent = "Copiar"), 2000);
  });
}

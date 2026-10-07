let registration: Promise<ServiceWorkerRegistration> | null = null;
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return null;
  if (!registration)
    registration = navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(async (reg) => {
        await reg.update();
        return reg;
      });
  return registration;
}
export async function readyServiceWorker() {
  const reg = registerServiceWorker();
  if (!reg)
    throw new Error("Den här webbläsaren stöder inte push i nuvarande läge.");
  await reg;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error("Push kunde inte startas. Ladda om och försök igen."),
          ),
        10000,
      ),
    ),
  ]);
}
export function supportsPush() {
  return (
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export const STORAGE_KEYS = Object.freeze({
  wallet: "holder-guard:wallet",
  rules: "holder-guard:rules",
  timeline: "holder-guard:timeline",
  ledger: "holder-guard:ledger",
  snapshots: "holder-guard:snapshots",
});

export function readLocal(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function writeLocal(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable in private browsing; in-memory app behavior still works.
  }
}

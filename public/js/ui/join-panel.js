// The "scan to join" card: the join link as a QR code and as text.

export async function showJoin({ qr, url, note }) {
  try {
    const response = await fetch("/api/join", { cache: "no-store" });
    const data = await response.json();
    qr.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(data.svg)}`;
    url.textContent = data.url.replace(/^https?:\/\//, "");
    // Phones can't reach "localhost", so say so rather than showing a dead QR code.
    note.hidden = !/^https?:\/\/(localhost|127\.|\[::1\])/.test(data.url);
  } catch {
    url.textContent = "Join link unavailable";
    qr.removeAttribute("src");
  }
}

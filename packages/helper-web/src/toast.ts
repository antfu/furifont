/// <reference lib="dom" />

/** The words of the toast shown when Furifont cannot load, in the reader's language. */
export interface Toast {
  message: string
  download: string
  close: string
}

/** Asks to install Furifont, with a link to `downloads`, for ten seconds or until closed. */
export function showToast(toast: Toast, downloads: string): void {
  document.querySelector('furifont-toast')?.remove()
  // In a shadow root, the page's CSS leaves the toast alone.
  const host = document.createElement('furifont-toast')
  const root = host.attachShadow({ mode: 'open' })
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(`:host{all:initial}div{position:fixed;z-index:2147483647;right:16px;bottom:16px;display:flex;gap:16px;align-items:start;max-width:360px;padding:12px 16px;border:1px solid #fafafa2b;background:#0a0a0a;color:#fafafa;font:14px/1.5 system-ui,sans-serif}p{margin:0}a{color:inherit}button{padding:0;border:0;background:none;color:inherit;font:inherit;cursor:pointer}`)
  root.adoptedStyleSheets = [sheet]
  const link = Object.assign(document.createElement('a'), { href: downloads, target: '_blank', rel: 'noopener', textContent: toast.download })
  const close = Object.assign(document.createElement('button'), { ariaLabel: toast.close, textContent: '×', onclick: () => host.remove() })
  const message = document.createElement('p')
  message.append(toast.message, ' ', link)
  const box = Object.assign(document.createElement('div'), { role: 'alert' })
  box.append(message, close)
  root.append(box)
  document.body.append(host)
  setTimeout(() => host.remove(), 10_000)
}

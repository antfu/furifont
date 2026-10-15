/// <reference lib="dom" />

/** The toasts' words, in the reader's language. */
export interface Toast {
  /** When Furifont cannot load. */
  message: string
  /** The link to the fonts. */
  download: string
  close: string
  /** When the script or the installed font is older than the site's release. */
  outdated: string
}

interface Link {
  href: string
  text: string
}

/** The downloads, which the site that serves the font at `url` lists. */
export function downloadLink(url: string, toast: Toast): Link {
  return { href: new URL('/#downloads', url).href, text: toast.download }
}

/** Shows `message` with its links, for ten seconds or until closed. */
export function showToast(message: string, links: Link[], close: string): void {
  document.querySelector('furifont-toast')?.remove()
  // In a shadow root, the page's CSS leaves the toast alone.
  const host = document.createElement('furifont-toast')
  const root = host.attachShadow({ mode: 'open' })
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(`:host{all:initial}div{position:fixed;z-index:2147483647;right:16px;bottom:16px;display:flex;gap:16px;align-items:start;max-width:360px;padding:12px 16px;border:1px solid #fafafa2b;background:#0a0a0a;color:#fafafa;font:14px/1.5 system-ui,sans-serif}p{margin:0}a{color:inherit;margin-right:12px}button{padding:0;border:0;background:none;color:inherit;font:inherit;cursor:pointer}`)
  root.adoptedStyleSheets = [sheet]
  const text = document.createElement('p')
  text.append(message, ' ', ...links.map(({ href, text }) => Object.assign(document.createElement('a'), { href, target: '_blank', rel: 'noopener', textContent: text })))
  const button = Object.assign(document.createElement('button'), { ariaLabel: close, textContent: '×', onclick: () => host.remove() })
  const box = Object.assign(document.createElement('div'), { role: 'alert' })
  box.append(text, button)
  root.append(box)
  document.body.append(host)
  setTimeout(() => host.remove(), 10_000)
}

/// <reference lib="dom" />

/** When Furifont turns on by itself on a site: `auto` is on Japanese pages. */
export type SiteMode = 'auto' | 'on' | 'off'

/** The panel's words, in the reader's language. */
export interface PanelLabels {
  /** The corner button's name. */
  open: string
  /** Furifont on the page now, this visit only. */
  page: string
  site: string
  siteAuto: string
  siteOn: string
  siteOff: string
  family: string
  okurigana: string
  hide: string
}

/** What the panel shows. */
export interface PanelState {
  /** Furifont is on the page. */
  on: boolean
  mode: SiteMode
  family: string
  okurigana: boolean
}

export interface PanelOptions {
  labels: PanelLabels
  families: string[]
  state: PanelState
  /** The reader changed one setting; the caller applies it and calls {@link Panel.update}. */
  onChange: (change: Partial<PanelState>) => void
  /** The reader asked to hide the button. */
  onHide: () => void
}

export interface Panel {
  /** Shows `state`, after a change from the panel or from elsewhere. */
  update: (state: PanelState) => void
  remove: () => void
}

/** A settings button in the page's corner, which opens a panel of Furifont's settings for the page and its site. */
export function showPanel({ labels, families, state, onChange, onHide }: PanelOptions): Panel {
  document.querySelector('furifont-panel')?.remove()
  // In a shadow root, the page's CSS leaves the panel alone, and Furifont does not mark its text.
  const host = document.createElement('furifont-panel')
  const root = host.attachShadow({ mode: 'open' })
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(`:host{all:initial}*{box-sizing:border-box;margin:0;font:13px/1.5 system-ui,sans-serif;color:#fafafa}`
    + `.wrap{position:fixed;z-index:2147483646;left:12px;bottom:12px;display:flex;flex-direction:column;align-items:start;gap:8px}`
    + `.open{width:28px;height:28px;padding:0;border:1px solid #fafafa2b;background:#0a0a0a;font-size:15px;line-height:1;cursor:pointer;opacity:.45}`
    + `.open:hover,.open:focus-visible,.open[aria-expanded=true]{opacity:1}`
    + `.panel{display:grid;grid-template-columns:auto auto;gap:8px 12px;align-items:center;padding:12px 14px;border:1px solid #fafafa2b;background:#0a0a0a}`
    + `.panel[hidden]{display:none}label{display:contents}input{accent-color:#fafafa;justify-self:start}`
    + `select{padding:2px 4px;border:1px solid #fafafa2b;border-radius:0;background:#0a0a0a}`
    + `.hide{grid-column:span 2;justify-self:start;padding:0;border:0;background:none;color:#fafafa99;text-decoration:underline;cursor:pointer}`)
  root.adoptedStyleSheets = [sheet]

  const element = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}): HTMLElementTagNameMap[K] =>
    Object.assign(document.createElement(tag), props)
  const row = (text: string, control: HTMLElement): HTMLLabelElement => {
    const label = element('label')
    label.append(element('span', { textContent: text }), control)
    return label
  }
  const select = (options: [string, string][]): HTMLSelectElement => {
    const control = element('select')
    control.append(...options.map(([value, text]) => element('option', { value, textContent: text })))
    return control
  }

  const page = element('input', { type: 'checkbox' })
  const site = select([['auto', labels.siteAuto], ['on', labels.siteOn], ['off', labels.siteOff]])
  const family = select(families.map(f => [f, f]))
  const okurigana = element('input', { type: 'checkbox' })
  page.onchange = () => onChange({ on: page.checked })
  site.onchange = () => onChange({ mode: site.value as SiteMode })
  family.onchange = () => onChange({ family: family.value })
  okurigana.onchange = () => onChange({ okurigana: okurigana.checked })

  const panel = element('div', { className: 'panel', role: 'dialog', ariaLabel: labels.open, hidden: true })
  panel.append(row(labels.page, page), row(labels.site, site), row(labels.family, family), row(labels.okurigana, okurigana), element('button', { className: 'hide', textContent: labels.hide, onclick: onHide }))
  const open = element('button', { className: 'open', ariaLabel: labels.open, title: labels.open, textContent: 'ふ' })
  open.setAttribute('aria-expanded', 'false')
  open.onclick = () => {
    panel.hidden = !panel.hidden
    open.setAttribute('aria-expanded', String(!panel.hidden))
  }
  const wrap = element('div', { className: 'wrap' })
  wrap.append(panel, open)
  root.append(wrap)

  const update = (state: PanelState): void => {
    page.checked = state.on
    site.value = state.mode
    family.value = state.family
    okurigana.checked = state.okurigana
  }
  update(state)
  document.body.append(host)
  return { update, remove: () => host.remove() }
}

export default function PanelContent({ title, header, footer, children }) {
  return <section className="context-content" aria-label={title}>
    <header className="context-panel-header">
      <h2>{title}</h2>
      {header}
    </header>
    <div className="context-panel-scroll">{children}</div>
    {footer && <footer className="context-panel-footer">{footer}</footer>}
  </section>
}

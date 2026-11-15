export default function PanelContent({ title, header, footer, children, scrollRef }) {
  return <section className="context-content" aria-label={title}>
    <header className="context-panel-header">
      <h2>{title}</h2>
      {header}
    </header>
    <div ref={scrollRef} className="context-panel-scroll">{children}</div>
    {footer && <footer className="context-panel-footer">{footer}</footer>}
  </section>
}

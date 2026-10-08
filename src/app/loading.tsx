export default function Loading() {
  return (
    <main className="loading-page" aria-busy="true" aria-label="Loading grocery promotions">
      <div className="shell">
        <header className="site-header">
          <span className="brand">
            grocery<span className="brand-light">codes</span>
          </span>
        </header>
        <div className="loading-content">
          <output className="eyebrow loading-message">Finding a little less at checkout…</output>
          <div className="loading-skeletons" aria-hidden="true">
            <span className="skeleton skeleton-heading" />
            <span className="skeleton skeleton-subtitle" />
            <span className="skeleton skeleton-search" />
            <div className="skeleton-store-grid">
              {[0, 1, 2].map((card) => (
                <div className="skeleton skeleton-store" key={card}>
                  <span />
                  <span />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

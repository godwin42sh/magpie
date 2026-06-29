import { Link, Route, Routes } from 'react-router-dom';

import { Logo } from './components/Logo.js';
import { AddSiteFlow } from './pages/AddSiteFlow.js';
import { SiteDetailView } from './pages/SiteDetailView.js';
import { SitesListPage } from './pages/SitesListPage.js';

export function App() {
  return (
    <div className="app-shell">
      <nav className="app-nav">
        <Link to="/" className="brand">
          <Logo size={26} />
          <span>Magpie</span>
        </Link>
        <span className="tagline">site change monitor</span>
      </nav>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<SitesListPage />} />
          <Route path="/sites/new" element={<AddSiteFlow />} />
          <Route path="/sites/:id" element={<SiteDetailView />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}

function NotFound() {
  return (
    <section className="page">
      <h1>Not found</h1>
      <Link to="/">← Back to sites</Link>
    </section>
  );
}

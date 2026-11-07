import { Component, Suspense, lazy, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { ArrowUpRight, RotateCcw, Ticket } from 'lucide-react';
import { AppProvider, useApp } from './lib/AppContext';
import Brand from './components/Brand';
import { Loading } from './components/Feedback';
import HomePage from './pages/HomePage';

const SessionPage = lazy(() => import('./pages/SessionPage'));
const OrderPage = lazy(() => import('./pages/OrderPage'));
const MyTicketsPage = lazy(() => import('./pages/MyTicketsPage'));
const PublicTicketPage = lazy(() => import('./pages/PublicTicketPage'));
const PresentationPage = lazy(() => import('./pages/PresentationPage'));

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return (
      <div className="page-shell feedback error-state" role="alert">
        <RotateCcw size={30} aria-hidden="true" />
        <h1>Небольшой перерыв</h1>
        <p>Не получилось открыть этот экран. Сохранённый заказ останется доступен после обновления.</p>
        <button className="button button--primary" onClick={() => window.location.reload()}>Обновить страницу</button>
        <a className="button button--ghost" href="/">Вернуться к афише</a>
      </div>
    );
    return this.props.children;
  }
}

function RouteEffects() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    let observer: MutationObserver | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    const main = document.getElementById('main-content');
    if (!hash) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      main?.focus({ preventScroll: true });
    } else {
      let id: string;
      try { id = decodeURIComponent(hash.slice(1)); } catch { return; }
      const scroll = () => {
        const target = document.getElementById(id);
        if (!target) return false;
        target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
        observer?.disconnect();
        return true;
      };
      frame = requestAnimationFrame(() => {
        if (scroll() || !main) return;
        observer = new MutationObserver(scroll);
        observer.observe(main, { childList: true, subtree: true });
        timer = setTimeout(() => observer?.disconnect(), 3000);
      });
    }
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); if (timer) clearTimeout(timer); };
  }, [pathname, hash]);
  return null;
}

function Header() {
  const { pathname, hash } = useLocation();
  return (
    <header className="site-header">
      <div className="wrap header-inner">
        <Brand />
        <nav className="desktop-nav" aria-label="Основная навигация">
          <Link to="/#sessions" aria-current={pathname === '/' && hash === '#sessions' ? 'location' : undefined}>Афиша и сеансы</Link>
          <Link to="/#how-it-works" aria-current={pathname === '/' && hash === '#how-it-works' ? 'location' : undefined}>Как это работает</Link>
        </nav>
        <Link className="header-ticket" to="/tickets"><Ticket size={18} strokeWidth={1.6} aria-hidden="true" /><span>Мои билеты</span></Link>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap footer-main">
        <Brand compact />
        <p>Кино начинается с вашего места.</p>
        <Link to="/presentation">О проекте <ArrowUpRight size={16} aria-hidden="true" /></Link>
      </div>
      <div className="wrap footer-bottom">
        <span>ZAL · Билет с видом на экран</span>
        <span>Сделано с вниманием к вашему ракурсу</span>
      </div>
    </footer>
  );
}

function AppFrame() {
  const { pathname } = useLocation();
  const { mode } = useApp();
  const presentation = pathname === '/presentation';
  const routeContent = (
    <ErrorBoundary key={pathname}>
      <Suspense fallback={<Loading label="Открываем следующий кадр…" />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/sessions/:sessionId" element={<SessionPage />} />
          <Route path="/orders/:orderId" element={<OrderPage />} />
          <Route path="/payment/return" element={<OrderPage />} />
          <Route path="/tickets" element={<MyTicketsPage />} />
          <Route path="/tickets/:token" element={<PublicTicketPage />} />
          <Route path="/presentation" element={<PresentationPage />} />
          <Route path="*" element={<div className="page-shell feedback empty-state"><span className="eyebrow">СТРАНИЦА НЕ НАЙДЕНА</span><h1>Этот кадр потерялся.</h1><p>Вернитесь к афише — там начинается ваша история.</p><Link className="button button--primary" to="/">Открыть афишу</Link></div>} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
  return (
    <>
      <a className="skip-link" href="#main-content">Перейти к содержимому</a>
      <RouteEffects />
      {!presentation && <Header />}
      {!presentation && mode === 'mock' && <div className="mock-strip" role="region" aria-label="Демонстрационный режим"><span /> Демо-режим · оплата имитируется, деньги не списываются</div>}
      {presentation
        ? <div id="main-content" tabIndex={-1}>{routeContent}</div>
        : <main id="main-content" tabIndex={-1}>{routeContent}</main>}
      {!presentation && <Footer />}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <MotionConfig reducedMotion="user">
          <AppProvider><AppFrame /></AppProvider>
        </MotionConfig>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

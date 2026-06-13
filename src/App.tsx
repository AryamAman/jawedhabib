import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import CursorOverlay from './components/CursorOverlay';
import { ThemeProvider, useTheme } from './components/ThemeProvider';
// Home is the landing page and stays eager so first paint never waits on a chunk.
import Home from './pages/Home';

// Every other route is code-split so the initial bundle only carries the
// landing experience. Likely-next routes are warmed on idle (see AppFrame).
const About = lazy(() => import('./pages/About'));
const Services = lazy(() => import('./pages/Services'));
const Stylists = lazy(() => import('./pages/Stylists'));
const Gallery = lazy(() => import('./pages/Gallery'));
const Login = lazy(() => import('./pages/Login'));
const Signup = lazy(() => import('./pages/Signup'));
const Book = lazy(() => import('./pages/Book'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const AdminLogin = lazy(() => import('./pages/AdminLogin'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const Profile = lazy(() => import('./pages/Profile'));

function RouteFallback() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-28 sm:px-6 lg:px-8" aria-busy="true" aria-label="Loading">
      <div className="skeleton mb-6 h-10 w-1/3" />
      <div className="skeleton h-64 w-full" />
    </div>
  );
}

function AppFrame() {
  const { theme } = useTheme();
  const location = useLocation();

  useEffect(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('adminToken');
  }, []);

  // Warm the routes a visitor is most likely to open next, once the browser is
  // idle, so navigation feels instant without bloating the initial download.
  useEffect(() => {
    const warm = () => {
      import('./pages/Book');
      import('./pages/Services');
      import('./pages/Login');
    };

    const win = window as typeof window & {
      requestIdleCallback?: (cb: () => void) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (typeof win.requestIdleCallback === 'function') {
      const id = win.requestIdleCallback(warm);
      return () => win.cancelIdleCallback?.(id);
    }

    const timer = window.setTimeout(warm, 1500);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>('.reveal-card'));
    if (!cards.length) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    }, { threshold: 0.15 });

    cards.forEach((card) => observer.observe(card));

    return () => observer.disconnect();
  }, [location.pathname]);

  return (
    <div className="app-shell flex min-h-screen flex-col font-sans">
      <CursorOverlay />
      <Navbar />
      <main className="flex-grow">
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/services" element={<Services />} />
            <Route path="/stylists" element={<Stylists />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/book" element={<Book />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/login" element={<AdminLogin />} />
          </Routes>
        </Suspense>
      </main>
      <Footer />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            borderRadius: '14px',
            border: theme === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
            background: theme === 'dark' ? '#171717' : '#fffaf5',
            color: theme === 'dark' ? '#f0ede8' : '#1a1a1a',
            boxShadow: '0 16px 40px rgba(0,0,0,0.18)',
          },
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <Router>
        <AppFrame />
      </Router>
    </ThemeProvider>
  );
}

import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Scissors, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import ThemeToggle from './ThemeToggle';

const MARQUEE_ITEMS = [
  'Premium Styling',
  'Expert Haircare',
  'Professional Grooming',
  'Luxury Experience',
  'Exclusively at BITS Pilani',
];

function AnnouncementBar() {
  return (
    <>
      <p className="sr-static">
        {MARQUEE_ITEMS.join(' • ')}
      </p>
      <div className="announce-bar" aria-hidden="true">
        <div className="announce-track">
          {[0, 1].map((copy) => (
            <div key={copy} className="announce-group">
              {MARQUEE_ITEMS.map((item) => (
                <span key={item} className="announce-item">
                  {item}
                  <span className="announce-dot" />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [authRole, setAuthRole] = useState<'student' | 'admin' | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === '/';
  const isLoggedIn = authRole === 'student';
  const isAdminLoggedIn = authRole === 'admin';

  useEffect(() => {
    const updateScrolledState = () => {
      setIsScrolled(!isHome || window.scrollY > 40);
    };

    updateScrolledState();
    window.addEventListener('scroll', updateScrolledState, { passive: true });

    return () => window.removeEventListener('scroll', updateScrolledState);
  }, [isHome]);

  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    let cancelled = false;

    const loadAuthState = async () => {
      try {
        const response = await fetch('/api/auth/whoami', {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        if (!cancelled && response.ok) {
          const data = await response.json();
          setAuthRole(data.role as 'student' | 'admin' | null);
        } else if (!cancelled) {
          setAuthRole(null);
        }
      } catch {
        if (!cancelled) {
          setAuthRole(null);
        }
      }
    };

    loadAuthState();

    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
    });
    setAuthRole(null);
    navigate('/');
    window.location.reload();
  };

  return (
    <header className="header-shell">
      <AnnouncementBar />
      <nav className={`site-nav ${isScrolled ? 'is-scrolled' : ''}`} aria-label="Primary">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link to="/" className="brand-link flex items-center gap-2.5" aria-label="Jawed Habib — home">
              <Scissors className="h-6 w-6 text-[color:var(--accent-gold)]" strokeWidth={1.6} />
              <span className="font-serif text-[1.45rem] tracking-tight">Jawed Habib</span>
            </Link>
          </div>

          <div className="hidden items-center space-x-8 md:flex">
            <Link to="/about" className="nav-link">About</Link>
            <Link to="/services" className="nav-link">Services</Link>
            <Link to="/stylists" className="nav-link">Stylists</Link>
            <Link to="/gallery" className="nav-link">Gallery</Link>

            {isAdminLoggedIn ? (
              <>
                <Link to="/admin" className="nav-link">Admin</Link>
                <button onClick={handleLogout} className="nav-link">Logout</button>
              </>
            ) : isLoggedIn ? (
              <>
                <Link to="/dashboard" className="nav-link">Dashboard</Link>
                <Link to="/profile" className="nav-link">Profile</Link>
                <button onClick={handleLogout} className="nav-link">Logout</button>
                <Link to="/book" className="nav-cta">Book Now</Link>
              </>
            ) : (
              <>
                <Link to="/login" className="nav-link">Login</Link>
                <Link to="/book" className="nav-cta">Book Now</Link>
              </>
            )}

            <ThemeToggle />
          </div>

          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="brand-link inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10"
              aria-expanded={isOpen}
              aria-label={isOpen ? 'Close menu' : 'Open menu'}
            >
              {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
              className="nav-mobile-panel md:hidden"
            >
              <div className="space-y-1 px-4 py-5">
                <Link to="/about" className="nav-mobile-link">About</Link>
                <Link to="/services" className="nav-mobile-link">Services</Link>
                <Link to="/stylists" className="nav-mobile-link">Stylists</Link>
                <Link to="/gallery" className="nav-mobile-link">Gallery</Link>
                {isAdminLoggedIn ? (
                  <>
                    <Link to="/admin" className="nav-mobile-link">Admin</Link>
                    <button onClick={handleLogout} className="nav-mobile-link w-full text-left">Logout</button>
                  </>
                ) : isLoggedIn ? (
                  <>
                    <Link to="/dashboard" className="nav-mobile-link">Dashboard</Link>
                    <Link to="/profile" className="nav-mobile-link">Profile</Link>
                    <button onClick={handleLogout} className="nav-mobile-link w-full text-left">Logout</button>
                  </>
                ) : (
                  <Link to="/login" className="nav-mobile-link">Login</Link>
                )}
                <div className="pt-3">
                  <Link to="/book" className="editorial-btn editorial-btn-outline w-full">Book Now</Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
    </header>
  );
}

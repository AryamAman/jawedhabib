import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Scissors, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import ThemeToggle from './ThemeToggle';

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  
  // Basic auth check (in a real app, use context)
  const isLoggedIn = !!localStorage.getItem('token');
  const isAdminLoggedIn = !!localStorage.getItem('adminToken');
  const isHome = location.pathname === '/';

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

  const handleLogout = async () => {
    localStorage.removeItem('token');
    localStorage.removeItem('adminToken');
    await fetch('/api/auth/logout', { method: 'POST' });
    navigate('/');
    window.location.reload();
  };

  return (
    <nav className={`site-nav ${isScrolled ? 'is-scrolled' : ''}`}>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          <div className="flex items-center">
            <Link to="/" className="brand-link flex items-center gap-2">
              <Scissors className="h-8 w-8" />
              <span className="font-serif text-2xl">Jawed Habib</span>
            </Link>
          </div>
          
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
          <button onClick={() => setIsOpen(!isOpen)} className="brand-link inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10">
            {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {isOpen && (
        <div className="nav-mobile-panel md:hidden">
          <div className="space-y-1 px-4 py-4">
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
            <div className="pt-2">
              <Link to="/book" className="editorial-btn editorial-btn-outline w-full">Book Now</Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

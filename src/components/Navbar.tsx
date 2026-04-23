import { Link, useNavigate } from 'react-router-dom';
import { Scissors, Menu, X } from 'lucide-react';
import { useState } from 'react';

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  
  // Basic auth check (in a real app, use context)
  const isLoggedIn = !!localStorage.getItem('token');
  const isAdminLoggedIn = !!localStorage.getItem('adminToken');

  const handleLogout = async () => {
    localStorage.removeItem('token');
    localStorage.removeItem('adminToken');
    await fetch('/api/auth/logout', { method: 'POST' });
    navigate('/');
    window.location.reload();
  };

  return (
    <nav className="bg-white border-b border-stone-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-20">
          <div className="flex items-center">
            <Link to="/" className="flex items-center gap-2">
              <Scissors className="h-8 w-8 text-stone-900" />
              <span className="font-serif text-2xl tracking-tight">Jawed Habib</span>
            </Link>
          </div>
          
          <div className="hidden md:flex items-center space-x-8">
            <Link to="/about" className="text-sm uppercase tracking-widest text-stone-600 hover:text-stone-900 transition-colors">About</Link>
            <Link to="/services" className="text-sm uppercase tracking-widest text-stone-600 hover:text-stone-900 transition-colors">Services</Link>
            <Link to="/stylists" className="text-sm uppercase tracking-widest text-stone-600 hover:text-stone-900 transition-colors">Stylists</Link>
            <Link to="/gallery" className="text-sm uppercase tracking-widest text-stone-600 hover:text-stone-900 transition-colors">Gallery</Link>
            
            {isAdminLoggedIn ? (
              <>
                <Link to="/admin" className="text-sm uppercase tracking-widest text-stone-600 hover:text-stone-900 transition-colors">Admin</Link>
                <button onClick={handleLogout} className="text-sm uppercase tracking-widest text-stone-600 hover:text-stone-900 transition-colors">Logout</button>
              </>
            ) : isLoggedIn ? (
              <>
                <Link to="/dashboard" className="text-sm uppercase tracking-widest text-stone-600 hover:text-stone-900 transition-colors">Dashboard</Link>
                <Link to="/profile" className="text-sm uppercase tracking-widest text-stone-600 hover:text-stone-900 transition-colors">Profile</Link>
                <button onClick={handleLogout} className="text-sm uppercase tracking-widest text-stone-600 hover:text-stone-900 transition-colors">Logout</button>
                <Link to="/book" className="bg-stone-900 text-white px-6 py-3 text-sm uppercase tracking-widest hover:bg-stone-800 transition-colors">Book Now</Link>
              </>
            ) : (
              <>
                <Link to="/login" className="text-sm uppercase tracking-widest text-stone-600 hover:text-stone-900 transition-colors">Login</Link>
                <Link to="/book" className="bg-stone-900 text-white px-6 py-3 text-sm uppercase tracking-widest hover:bg-stone-800 transition-colors">Book Now</Link>
              </>
            )}
          </div>

          <div className="flex items-center md:hidden">
            <button onClick={() => setIsOpen(!isOpen)} className="text-stone-900">
              {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {isOpen && (
        <div className="md:hidden bg-white border-b border-stone-200">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            <Link to="/about" className="block px-3 py-2 text-base uppercase tracking-widest text-stone-600">About</Link>
            <Link to="/services" className="block px-3 py-2 text-base uppercase tracking-widest text-stone-600">Services</Link>
            <Link to="/stylists" className="block px-3 py-2 text-base uppercase tracking-widest text-stone-600">Stylists</Link>
            <Link to="/gallery" className="block px-3 py-2 text-base uppercase tracking-widest text-stone-600">Gallery</Link>
            {isAdminLoggedIn ? (
              <>
                <Link to="/admin" className="block px-3 py-2 text-base uppercase tracking-widest text-stone-600">Admin</Link>
                <button onClick={handleLogout} className="block w-full text-left px-3 py-2 text-base uppercase tracking-widest text-stone-600">Logout</button>
              </>
            ) : isLoggedIn ? (
              <>
                <Link to="/dashboard" className="block px-3 py-2 text-base uppercase tracking-widest text-stone-600">Dashboard</Link>
                <Link to="/profile" className="block px-3 py-2 text-base uppercase tracking-widest text-stone-600">Profile</Link>
                <button onClick={handleLogout} className="block w-full text-left px-3 py-2 text-base uppercase tracking-widest text-stone-600">Logout</button>
              </>
            ) : (
              <Link to="/login" className="block px-3 py-2 text-base uppercase tracking-widest text-stone-600">Login</Link>
            )}
            <Link to="/book" className="block px-3 py-2 text-base uppercase tracking-widest font-bold text-stone-900">Book Now</Link>
          </div>
        </div>
      )}
    </nav>
  );
}

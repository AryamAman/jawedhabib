import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import CursorOverlay from './components/CursorOverlay';
import { ThemeProvider, useTheme } from './components/ThemeProvider';
import Home from './pages/Home';
import About from './pages/About';
import Services from './pages/Services';
import Stylists from './pages/Stylists';
import Gallery from './pages/Gallery';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Book from './pages/Book';
import Dashboard from './pages/Dashboard';
import AdminDashboard from './pages/AdminDashboard';
import AdminLogin from './pages/AdminLogin';
import Profile from './pages/Profile';

function AppFrame() {
  const { theme } = useTheme();
  const location = useLocation();

  useEffect(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('adminToken');
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

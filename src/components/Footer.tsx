import { Link } from 'react-router-dom';
import { MapPin, Phone, Clock, Instagram, Facebook } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="footer-shell py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          
          <div className="col-span-1 md:col-span-1">
            <h3 className="font-serif text-2xl text-[color:var(--text-primary)] mb-6">Jawed Habib</h3>
            <p className="text-sm leading-relaxed text-[color:var(--text-secondary)] mb-6">
              Luxury salon experience exclusively for BITS Pilani students. Experience the art of grooming.
            </p>
            <div className="flex space-x-4">
              <a href="#" className="social-link footer-link"><Instagram className="w-5 h-5" /></a>
              <a href="#" className="social-link footer-link"><Facebook className="w-5 h-5" /></a>
            </div>
          </div>

          <div>
            <h4 className="footer-label mb-6">Contact</h4>
            <ul className="space-y-4 text-sm text-[color:var(--text-secondary)]">
              <li className="flex items-start gap-3">
                <MapPin className="w-5 h-5 shrink-0" />
                <span>Student Activity Centre (SAC),<br/>BITS Pilani, Vidya Vihar Campus,<br/>Pilani, Rajasthan 333031</span>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="w-5 h-5 shrink-0" />
                <span>+91 1596 255 255</span>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="footer-label mb-6">Hours</h4>
            <ul className="space-y-4 text-sm text-[color:var(--text-secondary)]">
              <li className="flex items-center gap-3">
                <Clock className="w-5 h-5 shrink-0" />
                <div>
                  <p>Mon - Sun</p>
                  <p className="text-[color:var(--text-secondary)]">10:00 AM - 8:00 PM</p>
                </div>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="footer-label mb-6">Links</h4>
            <ul className="space-y-3 text-sm">
              <li><Link to="/book" className="footer-link">Book Appointment</Link></li>
              <li><Link to="/services" className="footer-link">Our Services</Link></li>
              <li><Link to="/stylists" className="footer-link">Meet the Team</Link></li>
              <li><Link to="/login" className="footer-link">Student Login</Link></li>
            </ul>
          </div>

        </div>
        
        <div className="mt-16 border-t border-[color:var(--accent-gold-border)] pt-8 text-center text-xs uppercase tracking-[0.18em] text-[color:var(--text-secondary)]">
          &copy; {new Date().getFullYear()} Jawed Habib BITS Pilani. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

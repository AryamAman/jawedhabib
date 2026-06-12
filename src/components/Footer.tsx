import { Link } from 'react-router-dom';
import { MapPin, Phone, Clock, Instagram, Facebook, Scissors } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="footer-shell pb-10 pt-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-16 max-w-xl">
          <Link to="/" className="mb-6 inline-flex items-center gap-2.5 text-[color:var(--text-primary)]">
            <Scissors className="h-5 w-5 text-[color:var(--accent-gold)]" strokeWidth={1.6} />
            <span className="font-serif text-2xl">Jawed Habib</span>
          </Link>
          <p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">
            A premium salon experience, exclusively for the BITS Pilani community.
            Expert haircare, professional grooming and considered service — on campus.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-12 border-t border-white/[0.06] pt-14 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <h4 className="footer-label mb-6">Contact</h4>
            <ul className="space-y-4 text-sm text-[color:var(--text-secondary)]">
              <li className="flex items-start gap-3">
                <MapPin className="h-5 w-5 shrink-0 text-[color:var(--accent-gold)]" strokeWidth={1.5} />
                <span>Student Activity Centre (SAC),<br />BITS Pilani, Vidya Vihar Campus,<br />Pilani, Rajasthan 333031</span>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="h-5 w-5 shrink-0 text-[color:var(--accent-gold)]" strokeWidth={1.5} />
                <span>+91 1596 255 255</span>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="footer-label mb-6">Hours</h4>
            <ul className="space-y-4 text-sm text-[color:var(--text-secondary)]">
              <li className="flex items-center gap-3">
                <Clock className="h-5 w-5 shrink-0 text-[color:var(--accent-gold)]" strokeWidth={1.5} />
                <div>
                  <p>Mon – Sun</p>
                  <p>10:00 AM – 8:00 PM</p>
                </div>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="footer-label mb-6">Explore</h4>
            <ul className="space-y-3 text-sm">
              <li><Link to="/book" className="footer-link">Book Appointment</Link></li>
              <li><Link to="/services" className="footer-link">Our Services</Link></li>
              <li><Link to="/stylists" className="footer-link">Meet the Team</Link></li>
              <li><Link to="/gallery" className="footer-link">Gallery</Link></li>
              <li><Link to="/login" className="footer-link">Student Login</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="footer-label mb-6">Follow</h4>
            <div className="flex gap-4">
              <a href="#" className="social-link footer-link" aria-label="Instagram"><Instagram className="h-5 w-5" strokeWidth={1.5} /></a>
              <a href="#" className="social-link footer-link" aria-label="Facebook"><Facebook className="h-5 w-5" strokeWidth={1.5} /></a>
            </div>
          </div>
        </div>

        <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-[color:var(--accent-gold-border)] pt-8 text-[0.62rem] uppercase tracking-[0.2em] text-[color:var(--text-secondary)] sm:flex-row">
          <span>&copy; {new Date().getFullYear()} Jawed Habib BITS Pilani. All rights reserved.</span>
          <span>Precision · Style · Confidence</span>
        </div>
      </div>
    </footer>
  );
}

'use client';

import { Link } from 'react-router-dom';
import { MapPin, Phone, Clock, Instagram, Facebook } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-stone-900 text-stone-300 py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          
          <div className="col-span-1 md:col-span-1">
            <h3 className="font-serif text-2xl text-white mb-6">Jawed Habib</h3>
            <p className="text-sm leading-relaxed mb-6">
              Luxury salon experience exclusively for BITS Pilani students. Experience the art of grooming.
            </p>
            <div className="flex space-x-4">
              <a href="#" className="hover:text-white transition-colors"><Instagram className="w-5 h-5" /></a>
              <a href="#" className="hover:text-white transition-colors"><Facebook className="w-5 h-5" /></a>
            </div>
          </div>

          <div>
            <h4 className="text-sm uppercase tracking-widest text-white mb-6">Contact</h4>
            <ul className="space-y-4 text-sm">
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
            <h4 className="text-sm uppercase tracking-widest text-white mb-6">Hours</h4>
            <ul className="space-y-4 text-sm">
              <li className="flex items-center gap-3">
                <Clock className="w-5 h-5 shrink-0" />
                <div>
                  <p>Mon - Sun</p>
                  <p className="text-stone-400">10:00 AM - 8:00 PM</p>
                </div>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm uppercase tracking-widest text-white mb-6">Links</h4>
            <ul className="space-y-3 text-sm">
              <li><Link to="/book" className="hover:text-white transition-colors">Book Appointment</Link></li>
              <li><Link to="/services" className="hover:text-white transition-colors">Our Services</Link></li>
              <li><Link to="/stylists" className="hover:text-white transition-colors">Meet the Team</Link></li>
              <li><Link to="/login" className="hover:text-white transition-colors">Student Login</Link></li>
            </ul>
          </div>

        </div>
        
        <div className="border-t border-stone-800 mt-16 pt-8 text-xs text-center text-stone-500 uppercase tracking-widest">
          &copy; {new Date().getFullYear()} Jawed Habib BITS Pilani. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

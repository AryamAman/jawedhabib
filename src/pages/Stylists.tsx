import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface Stylist {
  id: string;
  name: string;
  role: string;
  bio: string;
  photo: string | null;
}

export default function Stylists() {
  const [stylists, setStylists] = useState<Stylist[]>([]);

  useEffect(() => {
    fetch('/api/stylists')
      .then(res => res.json())
      .then(data => setStylists(data));
  }, []);

  return (
    <div className="page-shell section-light-alt min-h-[calc(100vh-8rem)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="text-center mb-16"
      >
        <h1 className="section-heading text-4xl md:text-5xl font-serif mb-6">Our Stylists</h1>
        <div className="editorial-divider"></div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
        {stylists.map((stylist, i) => (
          <motion.div 
            key={stylist.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: i * 0.1 }}
            className="reveal-card surface-card surface-card-hover text-center px-8 py-10"
          >
            <div className="stylist-avatar mx-auto mb-8 h-64 w-64 overflow-hidden rounded-full">
              {stylist.photo ? (
                <img 
                  src={stylist.photo} 
                  alt={stylist.name} 
                  className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-500"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[color:var(--accent-gold-dim)] text-5xl font-serif text-[color:var(--text-muted-dark)]">
                  {stylist.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <h3 className="text-2xl font-serif mb-2 text-[color:var(--text-dark)]">{stylist.name}</h3>
            <p className="mb-4 text-[0.7rem] uppercase tracking-[0.15em] text-[color:var(--accent-gold)]">{stylist.role}</p>
            <p className="text-sm leading-relaxed text-[color:var(--text-muted-dark)]">{stylist.bio}</p>
          </motion.div>
        ))}
      </div>
      </div>
    </div>
  );
}

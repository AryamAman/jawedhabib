import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

interface Stylist {
  id: string;
  name: string;
  role: string;
  bio: string;
  photo: string | null;
}

const spring = { type: 'spring', stiffness: 280, damping: 26, mass: 0.8 } as const;

export default function Stylists() {
  const [stylists, setStylists] = useState<Stylist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/stylists')
      .then(res => res.json())
      .then(data => setStylists(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page-shell section-light-alt min-h-[calc(100vh-8rem)]">
      <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8 md:py-28">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
          className="mb-16 text-center"
        >
          <p className="section-kicker mb-4 text-xs">The People</p>
          <h1 className="section-heading mb-6 font-serif text-4xl md:text-5xl">Our Stylists</h1>
          <div className="editorial-divider" />
          <p className="mx-auto mt-6 max-w-xl text-sm leading-relaxed text-[color:var(--text-muted-dark)]">
            Trained professionals, dedicated to your signature look.
          </p>
        </motion.div>

        {loading ? (
          <div className="grid grid-cols-1 gap-12 md:grid-cols-3" aria-busy="true" aria-label="Loading stylists">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton h-[420px]" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-12 md:grid-cols-3">
            {stylists.map((stylist, i) => (
              <motion.div
                key={stylist.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: i * 0.08 }}
                className="surface-card surface-card-hover px-8 py-10 text-center"
              >
                <div className="stylist-avatar mx-auto mb-8 h-56 w-56 overflow-hidden rounded-full">
                  {stylist.photo ? (
                    <img
                      src={stylist.photo}
                      alt={stylist.name}
                      className="img-grade h-full w-full object-cover grayscale transition-all duration-500 hover:grayscale-0"
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[color:var(--accent-gold-dim)] font-serif text-5xl text-[color:var(--text-muted-dark)]">
                      {stylist.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <h3 className="mb-2 font-serif text-2xl text-[color:var(--text-dark)]">{stylist.name}</h3>
                <p className="mb-5 text-[0.68rem] uppercase tracking-[0.2em] text-[color:var(--accent-gold)]">{stylist.role}</p>
                <p className="text-sm leading-relaxed text-[color:var(--text-muted-dark)]">{stylist.bio}</p>
              </motion.div>
            ))}
          </div>
        )}

        <div className="mt-20 text-center">
          <Link to="/book" className="editorial-btn editorial-btn-dark px-10">
            Book With the Team
          </Link>
        </div>
      </div>
    </div>
  );
}

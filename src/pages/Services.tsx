import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search } from 'lucide-react';
import { clsx } from 'clsx';
import EmptyState from '../components/EmptyState';

interface Service {
  id: string;
  name: string;
  duration_minutes: number;
  price: number;
  gender?: string | null;
  category?: string | null;
}

const GENDER_TABS = ['All', 'Men', 'Women', 'Unisex', 'Beauty'] as const;

const spring = { type: 'spring', stiffness: 280, damping: 26, mass: 0.8 } as const;

export default function Services() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<(typeof GENDER_TABS)[number]>('All');
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetch('/api/services')
      .then(res => res.json())
      .then(data => setServices(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    return services.filter((service) => {
      const matchesTab = activeTab === 'All' || service.gender === activeTab;
      const matchesQuery = !lowered || service.name.toLowerCase().includes(lowered);
      return matchesTab && matchesQuery;
    });
  }, [services, activeTab, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, Service[]>();
    filtered.forEach((service) => {
      const key = activeTab === 'All'
        ? `${service.gender ?? 'General'} — ${service.category ?? 'Other'}`
        : (service.category ?? 'Other');
      const list = map.get(key) ?? [];
      list.push(service);
      map.set(key, list);
    });
    return Array.from(map.entries());
  }, [filtered, activeTab]);

  return (
    <div className="page-shell section-light min-h-[calc(100vh-8rem)]">
      <div className="mx-auto max-w-5xl px-4 py-24 sm:px-6 lg:px-8 md:py-28">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
          className="mb-14 text-center"
        >
          <p className="section-kicker mb-4 text-xs">The Menu</p>
          <h1 className="section-heading mb-5 font-serif text-4xl md:text-5xl">Our Services</h1>
          <div className="editorial-divider" />
          <p className="mx-auto mt-6 max-w-xl text-sm leading-relaxed text-[color:var(--text-muted-dark)]">
            Every service, performed by trained professionals with premium products.
            Prices and durations exactly as charged in the salon.
          </p>
        </motion.div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.08 }}
          className="mb-12 space-y-5"
        >
          <div className="relative mx-auto max-w-md">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--text-secondary)]"
              strokeWidth={1.6}
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search a service…"
              aria-label="Search services"
              className="catalog-search"
            />
          </div>

          <div className="flex flex-wrap justify-center gap-2.5" role="tablist" aria-label="Filter services">
            {GENDER_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={clsx('catalog-tab', activeTab === tab && 'catalog-tab--active')}
              >
                {tab}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Catalogue */}
        {loading ? (
          <div className="space-y-4" aria-busy="true" aria-label="Loading services">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-14 w-full" />
            ))}
          </div>
        ) : grouped.length === 0 ? (
          <EmptyState label={query ? `No services match “${query}”` : 'No services found'} />
        ) : (
          <AnimatePresence mode="popLayout">
            <div className="space-y-14">
              {grouped.map(([category, items]) => (
                <motion.section
                  key={category}
                  layout
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                >
                  <div className="mb-4 flex items-baseline justify-between border-b border-[color:var(--border-strong)] pb-3">
                    <h2 className="font-serif text-2xl text-[color:var(--text-dark)]">{category}</h2>
                    <span className="text-[0.66rem] uppercase tracking-[0.22em] text-[color:var(--text-secondary)]">
                      {items.length} {items.length === 1 ? 'service' : 'services'}
                    </span>
                  </div>

                  <ul>
                    {items.map((service) => (
                      <li key={service.id} className="service-row">
                        <div className="min-w-0">
                          <h3 className="font-serif text-lg leading-snug text-[color:var(--text-dark)]">{service.name}</h3>
                          <p className="mt-0.5 text-[0.66rem] uppercase tracking-[0.2em] text-[color:var(--text-secondary)]">
                            {service.duration_minutes} mins
                          </p>
                        </div>
                        <span className="service-row__dots" aria-hidden="true" />
                        <span className="whitespace-nowrap font-serif text-lg text-[color:var(--text-dark)]">
                          ₹{service.price}
                        </span>
                      </li>
                    ))}
                  </ul>
                </motion.section>
              ))}
            </div>
          </AnimatePresence>
        )}

        <div className="mt-20 text-center">
          <Link to="/book" className="editorial-btn editorial-btn-dark px-10">
            Book an Appointment
          </Link>
        </div>
      </div>
    </div>
  );
}

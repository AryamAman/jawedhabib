import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface Service {
  id: string;
  name: string;
  duration_minutes: number;
  price: number;
}

export default function Services() {
  const [services, setServices] = useState<Service[]>([]);

  useEffect(() => {
    fetch('/api/services')
      .then(res => res.json())
      .then(data => setServices(data));
  }, []);

  return (
    <div className="page-shell section-light min-h-[calc(100vh-8rem)]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="text-center mb-16"
      >
        <h1 className="section-heading text-4xl md:text-5xl font-serif mb-6">Our Services</h1>
        <div className="editorial-divider"></div>
      </motion.div>

      <div className="space-y-8">
        {services.map((service, i) => (
          <motion.div 
            key={service.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: i * 0.1 }}
            className="surface-card reveal-card flex items-center justify-between gap-6 px-6 py-7"
          >
            <div>
              <h3 className="text-xl font-serif text-[color:var(--text-dark)] mb-2">{service.name}</h3>
              <p className="text-sm uppercase tracking-[0.18em] text-[color:var(--accent-gold)]">{service.duration_minutes} mins</p>
            </div>
            <div className="text-xl font-serif text-[color:var(--text-dark)]">
              ₹{service.price}
            </div>
          </motion.div>
        ))}
      </div>
      </div>
    </div>
  );
}

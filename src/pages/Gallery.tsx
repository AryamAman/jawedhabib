import { motion } from 'framer-motion';

export default function Gallery() {
  const images = [
    'https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=2574&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?q=80&w=2070&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1562322140-8baeececf3df?q=80&w=2069&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1522337660859-02fbefca4702?q=80&w=2069&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1621605815971-fbc98d665033?q=80&w=2070&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1599566150163-29194dcaad36?q=80&w=1974&auto=format&fit=crop'
  ];

  return (
    <div className="page-shell section-light min-h-[calc(100vh-8rem)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="text-center mb-16"
      >
        <h1 className="section-heading text-4xl md:text-5xl font-serif mb-6">Gallery</h1>
        <div className="editorial-divider"></div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {images.map((src, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: i * 0.1 }}
            className="reveal-card group overflow-hidden rounded-[var(--radius-md)]"
          >
            <img 
              src={src} 
              alt={`Gallery image ${i + 1}`} 
              className="surface-card surface-card-hover h-[400px] w-full object-cover transition-transform duration-700 group-hover:scale-105"
              referrerPolicy="no-referrer"
              loading="lazy"
              decoding="async"
            />
          </motion.div>
        ))}
      </div>
      </div>
    </div>
  );
}

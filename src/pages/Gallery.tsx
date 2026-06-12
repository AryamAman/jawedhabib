import { motion } from 'framer-motion';

const spring = { type: 'spring', stiffness: 280, damping: 26, mass: 0.8 } as const;

const images = [
  { src: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=1600&auto=format&fit=crop', alt: 'Salon interior with styling stations' },
  { src: 'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?q=80&w=1600&auto=format&fit=crop', alt: 'Warmly lit salon seating area' },
  { src: 'https://images.unsplash.com/photo-1562322140-8baeececf3df?q=80&w=1600&auto=format&fit=crop', alt: 'Stylist finishing a haircut' },
  { src: 'https://images.unsplash.com/photo-1522337660859-02fbefca4702?q=80&w=1600&auto=format&fit=crop', alt: 'Hair colouring in progress' },
  { src: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?q=80&w=1600&auto=format&fit=crop', alt: 'Precision beard grooming' },
  { src: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?q=80&w=1600&auto=format&fit=crop', alt: 'A finished signature look' },
];

export default function Gallery() {
  return (
    <div className="page-shell section-light min-h-[calc(100vh-8rem)]">
      <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8 md:py-28">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
          className="mb-16 text-center"
        >
          <p className="section-kicker mb-4 text-xs">The Space</p>
          <h1 className="section-heading mb-6 font-serif text-4xl md:text-5xl">Gallery</h1>
          <div className="editorial-divider" />
        </motion.div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {images.map((image, i) => (
            <motion.div
              key={image.src}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ ...spring, delay: (i % 3) * 0.08 }}
              className="group overflow-hidden rounded-[var(--radius-md)]"
            >
              <div className="surface-card surface-card-hover aspect-[4/5] overflow-hidden">
                <img
                  src={image.src}
                  alt={image.alt}
                  className="img-grade h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.05]"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

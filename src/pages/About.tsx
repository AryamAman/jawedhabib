import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

const spring = { type: 'spring', stiffness: 280, damping: 26, mass: 0.8 } as const;

export default function About() {
  return (
    <div className="page-shell section-light min-h-[calc(100vh-8rem)]">
      <div className="mx-auto max-w-5xl px-4 py-24 sm:px-6 lg:px-8 md:py-28">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
          className="mb-16 text-center"
        >
          <p className="section-kicker mb-4 text-xs">Our Story</p>
          <h1 className="section-heading mb-6 font-serif text-4xl md:text-5xl">The Salon, On Campus</h1>
          <div className="editorial-divider" />
        </motion.div>

        <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-2 md:gap-16">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.1 }}
            className="surface-card aspect-[4/5] overflow-hidden"
          >
            <img
              src="https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?q=80&w=1800&auto=format&fit=crop"
              alt="The salon interior at BITS Pilani"
              className="img-grade h-full w-full object-cover"
              referrerPolicy="no-referrer"
              loading="lazy"
              decoding="async"
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.18 }}
            className="space-y-6 leading-relaxed text-[color:var(--text-muted-dark)]"
          >
            <p className="font-serif text-2xl leading-snug text-[color:var(--text-dark)]">
              World-class grooming and styling, exclusively for the student community.
            </p>
            <p>
              Welcome to Jawed Habib at BITS Pilani. Our mission is to provide a
              luxury salon experience right on campus, ensuring that you always
              look and feel your best — whether it&apos;s for a presentation, a
              festival, or just everyday confidence.
            </p>
            <p>
              With a team of highly trained professionals and premium products,
              we offer a sanctuary of style and relaxation amidst the rigorous
              academic life.
            </p>
            <div className="pt-4">
              <Link to="/book" className="editorial-btn editorial-btn-dark px-8">
                Book Your Visit
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="page-shell flex min-h-screen flex-col">
      {/* Hero Section */}
      <section className="hero-shell relative flex h-[90vh] items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=2574&auto=format&fit=crop" 
            alt="Luxury Salon Interior" 
            className="hero-media"
            referrerPolicy="no-referrer"
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
          <div className="hero-overlay" />
          <div className="hero-noise" />
        </div>
        
        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="hero-title text-5xl md:text-7xl font-serif mb-6"
          >
            Jawed Habib
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
            className="hero-sub mb-10 text-base md:text-lg"
          >
            Exclusive to BITS Pilani
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
          >
            <Link 
              to="/book" 
              className="hero-cta editorial-btn editorial-btn-light px-10"
            >
              Book Appointment
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Services Section */}
      <section className="section-light py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="section-heading text-3xl font-serif mb-4">Our Services</h2>
            <div className="editorial-divider"></div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { name: 'Haircut & Styling', img: 'https://images.unsplash.com/photo-1562322140-8baeececf3df?q=80&w=2069&auto=format&fit=crop' },
              { name: 'Coloring & Treatment', img: 'https://images.unsplash.com/photo-1522337660859-02fbefca4702?q=80&w=2069&auto=format&fit=crop' },
              { name: 'Beard & Grooming', img: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?q=80&w=2070&auto=format&fit=crop' },
              { name: 'Facial & Skincare', img: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?q=80&w=2070&auto=format&fit=crop' }
            ].map((service, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
                className="reveal-card group"
              >
                <div className="surface-card surface-card-hover overflow-hidden mb-6">
                  <img 
                    src={service.img} 
                    alt={service.name} 
                    className="h-[400px] w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <h3 className="text-xl font-serif text-center text-[color:var(--text-dark)] group-hover:text-[color:var(--accent-gold)] transition-colors">{service.name}</h3>
              </motion.div>
            ))}
          </div>
          
          <div className="text-center mt-16">
            <Link to="/services" className="editorial-btn editorial-btn-subtle">
              View All Services
            </Link>
          </div>
        </div>
      </section>

      {/* Stylists Section */}
      <section className="section-light-alt py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="section-heading text-3xl font-serif mb-4">The Team</h2>
            <div className="editorial-divider"></div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {[
              { name: 'Rahul Sharma', role: 'Senior Stylist', img: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?q=80&w=1974&auto=format&fit=crop' },
              { name: 'Priya Patel', role: 'Hair Specialist', img: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?q=80&w=1961&auto=format&fit=crop' },
              { name: 'Amit Kumar', role: 'Barber', img: 'https://images.unsplash.com/photo-1618077360395-f3068be8e001?q=80&w=2080&auto=format&fit=crop' }
            ].map((stylist, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
                className="reveal-card surface-card surface-card-hover text-center px-8 py-10"
              >
                <div className="stylist-avatar mx-auto mb-6 h-48 w-48 overflow-hidden rounded-full">
                  <img 
                    src={stylist.img} 
                    alt={stylist.name} 
                    className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-500"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <h3 className="text-lg font-serif mb-1 text-[color:var(--text-dark)]">{stylist.name}</h3>
                <p className="text-[0.7rem] uppercase tracking-[0.15em] text-[color:var(--accent-gold)]">{stylist.role}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-shell cta-accent py-32 text-center px-4">
        <h2 className="text-4xl font-serif text-[color:var(--text-primary)] mb-8">Ready for a change?</h2>
        <Link 
          to="/book" 
          className="editorial-btn editorial-btn-outline px-10"
        >
          Book Your Appointment
        </Link>
      </section>
    </div>
  );
}

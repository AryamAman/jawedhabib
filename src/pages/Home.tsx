import { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, Clock, MapPin, Phone } from 'lucide-react';

const spring = { type: 'spring', stiffness: 280, damping: 26, mass: 0.8 } as const;

const featuredServices = [
  {
    name: 'Haircut & Styling',
    blurb: 'Signature cuts, shaped to you by master stylists.',
    img: 'https://images.unsplash.com/photo-1562322140-8baeececf3df?q=80&w=1400&auto=format&fit=crop',
  },
  {
    name: 'Coloring & Treatment',
    blurb: 'Dimension, depth and care — colour done properly.',
    img: 'https://images.unsplash.com/photo-1522337660859-02fbefca4702?q=80&w=1400&auto=format&fit=crop',
  },
  {
    name: 'Beard & Grooming',
    blurb: 'Precise lines and classic grooming rituals.',
    img: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?q=80&w=1400&auto=format&fit=crop',
  },
  {
    name: 'Facial & Skincare',
    blurb: 'Restorative facials for everyday confidence.',
    img: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?q=80&w=1400&auto=format&fit=crop',
  },
];

const team = [
  { name: 'Rahul Sharma', role: 'Senior Stylist', img: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?q=80&w=1200&auto=format&fit=crop' },
  { name: 'Priya Patel', role: 'Hair Specialist', img: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?q=80&w=1200&auto=format&fit=crop' },
  { name: 'Amit Kumar', role: 'Barber', img: 'https://images.unsplash.com/photo-1618077360395-f3068be8e001?q=80&w=1200&auto=format&fit=crop' },
];

export default function Home() {
  const heroRef = useRef<HTMLElement | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const parallaxY = useTransform(scrollYProgress, [0, 1], ['0%', prefersReducedMotion ? '0%' : '18%']);

  return (
    <div className="page-shell flex min-h-screen flex-col">
      {/* Hero */}
      <section ref={heroRef} className="hero-shell relative flex min-h-[92vh] items-center justify-center overflow-hidden">
        <motion.div className="absolute inset-0 z-0" style={{ y: parallaxY }}>
          <img
            src="https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=2400&auto=format&fit=crop"
            alt="The Jawed Habib salon interior — warm lighting, styling chairs and mirrors"
            className="hero-media img-grade scale-[1.08]"
            referrerPolicy="no-referrer"
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
          <div className="hero-overlay" />
          <div className="hero-noise" />
        </motion.div>

        <div className="relative z-10 mx-auto max-w-4xl px-4 text-center">
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring }}
            className="hero-eyebrow mb-7 justify-center"
          >
            Jawed Habib · BITS Pilani
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.08 }}
            className="hero-title mb-6 font-serif text-5xl leading-[1.05] md:text-7xl"
          >
            Precision. Style.
            <br />
            Confidence.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.16 }}
            className="hero-copy mx-auto mb-10 max-w-xl text-base leading-relaxed md:text-lg"
          >
            Crafted by experts. Designed for you. A premium salon experience,
            right on campus.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.24 }}
            className="mb-12 flex flex-col items-center justify-center gap-4 sm:flex-row"
          >
            <Link to="/book" className="editorial-btn editorial-btn-light w-full px-10 sm:w-auto">
              Book an Appointment
            </Link>
            <Link
              to="/services"
              className="hero-copy group inline-flex items-center gap-2 text-[0.74rem] uppercase tracking-[0.18em] transition-colors hover:text-[color:var(--accent-gold)]"
            >
              Explore Services
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" strokeWidth={1.6} />
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="hero-trust"
          >
            <span>Exclusively for BITS Pilani</span>
            <span>Open Mon – Sun · 10 AM – 8 PM</span>
            <span>SAC, Vidya Vihar Campus</span>
          </motion.div>
        </div>

        <div className="hero-scroll-hint" aria-hidden="true">Scroll</div>
      </section>

      {/* Services */}
      <section className="section-light py-24 md:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="section-kicker mb-4 text-xs">The Craft</p>
              <h2 className="section-heading font-serif text-4xl md:text-5xl">Our Services</h2>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-[color:var(--text-muted-dark)]">
              Every service performed by trained professionals with premium
              products — from a fifteen-minute trim to a complete transformation.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
            {featuredServices.map((service, i) => (
              <motion.div
                key={service.name}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ ...spring, delay: i * 0.07 }}
                className="group"
              >
                <Link to="/services" className="block">
                  <div className="surface-card surface-card-hover mb-6 aspect-[3/4] overflow-hidden">
                    <img
                      src={service.img}
                      alt={service.name}
                      className="img-grade h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.05]"
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                  <div className="flex items-baseline gap-3">
                    <span className="section-index">0{i + 1}</span>
                    <div>
                      <h3 className="font-serif text-xl text-[color:var(--text-dark)] transition-colors group-hover:text-[color:var(--accent-gold)]">
                        {service.name}
                      </h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-[color:var(--text-muted-dark)]">{service.blurb}</p>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>

          <div className="mt-16 text-center">
            <Link to="/services" className="editorial-btn editorial-btn-subtle px-8">
              View the Full Menu
            </Link>
          </div>
        </div>
      </section>

      {/* Experience band */}
      <section className="section-light-alt py-24 md:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-20">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={spring}
              className="surface-card aspect-[4/5] overflow-hidden lg:aspect-[5/6]"
            >
              <img
                src="https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?q=80&w=1800&auto=format&fit=crop"
                alt="A stylist at work in the salon"
                className="img-grade h-full w-full object-cover"
                referrerPolicy="no-referrer"
                loading="lazy"
                decoding="async"
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ ...spring, delay: 0.1 }}
            >
              <p className="section-kicker mb-4 text-xs">The Experience</p>
              <h2 className="section-heading mb-8 font-serif text-4xl leading-[1.12] md:text-5xl">
                A sanctuary of style, minutes from your hostel.
              </h2>
              <p className="mb-6 leading-relaxed text-[color:var(--text-muted-dark)]">
                Jawed Habib brings world-class grooming to the BITS Pilani campus —
                a calm, considered space where trained professionals and premium
                products meet the rhythm of student life.
              </p>
              <p className="mb-12 leading-relaxed text-[color:var(--text-muted-dark)]">
                Book online in minutes, track your appointment live, and walk in
                knowing your time is reserved.
              </p>

              <div className="grid grid-cols-3 gap-6 border-t border-[color:var(--border-light)] pt-10">
                <div>
                  <p className="stat-figure">7</p>
                  <p className="stat-label">Days a Week</p>
                </div>
                <div>
                  <p className="stat-figure">10–8</p>
                  <p className="stat-label">Open Hours</p>
                </div>
                <div>
                  <p className="stat-figure">On&nbsp;Campus</p>
                  <p className="stat-label">At the SAC</p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="section-light py-24 md:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <p className="section-kicker mb-4 text-xs">The People</p>
            <h2 className="section-heading font-serif text-4xl md:text-5xl">Meet the Team</h2>
            <div className="editorial-divider" />
          </div>

          <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
            {team.map((stylist, i) => (
              <motion.div
                key={stylist.name}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ ...spring, delay: i * 0.07 }}
                className="surface-card surface-card-hover px-8 py-10 text-center"
              >
                <div className="stylist-avatar mx-auto mb-7 h-44 w-44 overflow-hidden rounded-full">
                  <img
                    src={stylist.img}
                    alt={stylist.name}
                    className="img-grade h-full w-full object-cover grayscale transition-all duration-500 hover:grayscale-0"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <h3 className="mb-1.5 font-serif text-xl text-[color:var(--text-dark)]">{stylist.name}</h3>
                <p className="text-[0.68rem] uppercase tracking-[0.2em] text-[color:var(--accent-gold)]">{stylist.role}</p>
              </motion.div>
            ))}
          </div>

          <div className="mt-14 text-center">
            <Link to="/stylists" className="editorial-btn editorial-btn-subtle px-8">
              About the Stylists
            </Link>
          </div>
        </div>
      </section>

      {/* Visit band */}
      <section className="section-light-alt py-20">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 sm:grid-cols-3 sm:px-6 lg:px-8">
          {[
            {
              icon: MapPin,
              title: 'Find Us',
              lines: ['Student Activity Centre (SAC)', 'BITS Pilani, Vidya Vihar Campus', 'Pilani, Rajasthan 333031'],
            },
            {
              icon: Clock,
              title: 'Hours',
              lines: ['Monday – Sunday', '10:00 AM – 8:00 PM'],
            },
            {
              icon: Phone,
              title: 'Reach Us',
              lines: ['+91 1596 255 255'],
            },
          ].map(({ icon: Icon, title, lines }) => (
            <div key={title} className="surface-card flex items-start gap-5 p-7">
              <span className="mt-0.5 inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-[color:var(--accent-gold-border)] bg-[color:var(--accent-gold-dim)] text-[color:var(--accent-gold)]">
                <Icon className="h-5 w-5" strokeWidth={1.6} />
              </span>
              <div>
                <p className="footer-label mb-2.5">{title}</p>
                {lines.map((line) => (
                  <p key={line} className="text-sm leading-relaxed text-[color:var(--text-muted-dark)]">{line}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="cta-shell cta-accent px-4 py-28 text-center md:py-36">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={spring}
          className="relative z-10"
        >
          <h2 className="mb-5 font-serif text-4xl text-[color:var(--text-primary)] md:text-5xl">
            Elevate your signature look.
          </h2>
          <p className="mx-auto mb-10 max-w-md text-sm leading-relaxed text-[color:var(--text-secondary)]">
            Your chair is waiting. Reserve a time that fits your day — it takes
            less than a minute.
          </p>
          <Link to="/book" className="editorial-btn editorial-btn-outline px-10">
            Book Your Appointment
          </Link>
        </motion.div>
      </section>
    </div>
  );
}

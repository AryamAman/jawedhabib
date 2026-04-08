import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="relative h-[90vh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=2574&auto=format&fit=crop" 
            alt="Luxury Salon Interior" 
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-black/40"></div>
        </div>
        
        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="text-5xl md:text-7xl font-serif text-white mb-6 tracking-tight"
          >
            Jawed Habib
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
            className="text-lg md:text-xl text-stone-200 mb-10 uppercase tracking-widest"
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
              className="inline-block bg-white text-stone-900 px-10 py-4 text-sm uppercase tracking-widest hover:bg-stone-100 transition-colors"
            >
              Book Appointment
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Services Section */}
      <section className="py-24 bg-stone-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-serif text-stone-900 mb-4">Our Services</h2>
            <div className="w-12 h-[1px] bg-stone-900 mx-auto"></div>
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
                className="group cursor-pointer"
              >
                <div className="relative h-[400px] overflow-hidden mb-6">
                  <img 
                    src={service.img} 
                    alt={service.name} 
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <h3 className="text-xl font-serif text-center group-hover:text-stone-600 transition-colors">{service.name}</h3>
              </motion.div>
            ))}
          </div>
          
          <div className="text-center mt-16">
            <Link to="/services" className="text-sm uppercase tracking-widest border-b border-stone-900 pb-1 hover:text-stone-600 hover:border-stone-600 transition-colors">
              View All Services
            </Link>
          </div>
        </div>
      </section>

      {/* Stylists Section */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-serif text-stone-900 mb-4">The Team</h2>
            <div className="w-12 h-[1px] bg-stone-900 mx-auto"></div>
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
                className="text-center"
              >
                <div className="w-48 h-48 mx-auto rounded-full overflow-hidden mb-6">
                  <img 
                    src={stylist.img} 
                    alt={stylist.name} 
                    className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-500"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <h3 className="text-lg font-serif mb-1">{stylist.name}</h3>
                <p className="text-xs uppercase tracking-widest text-stone-500">{stylist.role}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 bg-stone-900 text-center px-4">
        <h2 className="text-4xl font-serif text-white mb-8">Ready for a change?</h2>
        <Link 
          to="/book" 
          className="inline-block border border-white text-white px-10 py-4 text-sm uppercase tracking-widest hover:bg-white hover:text-stone-900 transition-colors"
        >
          Book Your Appointment
        </Link>
      </section>
    </div>
  );
}

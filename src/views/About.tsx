'use client';

import { motion } from 'framer-motion';

export default function About() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="text-center mb-16"
      >
        <h1 className="text-4xl md:text-5xl font-serif text-stone-900 mb-6">About Us</h1>
        <div className="w-12 h-[1px] bg-stone-900 mx-auto"></div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <img 
            src="https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?q=80&w=2070&fm=webp&fit=crop" 
            alt="Salon Interior" 
            className="w-full h-[500px] object-cover"
            referrerPolicy="no-referrer"
          />
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="space-y-6 text-stone-600 leading-relaxed"
        >
          <p>
            Welcome to Jawed Habib at BITS Pilani. We bring world-class grooming and styling exclusively to the student community.
          </p>
          <p>
            Our mission is to provide a luxury salon experience right on campus, ensuring that you always look and feel your best, whether it's for a presentation, a festival, or just everyday confidence.
          </p>
          <p>
            With a team of highly trained professionals and premium products, we offer a sanctuary of style and relaxation amidst the rigorous academic life.
          </p>
        </motion.div>
      </div>
    </div>
  );
}

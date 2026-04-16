'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface Stylist {
  id: string;
  name: string;
  role: string;
  bio: string;
  photo: string | null;
}

export default function Stylists() {
  const [stylists, setStylists] = useState<Stylist[]>([]);

  useEffect(() => {
    fetch('/api/stylists')
      .then(res => res.json())
      .then(data => setStylists(data));
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="text-center mb-16"
      >
        <h1 className="text-4xl md:text-5xl font-serif text-stone-900 mb-6">Our Stylists</h1>
        <div className="w-12 h-[1px] bg-stone-900 mx-auto"></div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
        {stylists.map((stylist, i) => (
          <motion.div 
            key={stylist.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: i * 0.1 }}
            className="text-center"
          >
            <div className="w-64 h-64 mx-auto rounded-full overflow-hidden mb-8">
              {stylist.photo ? (
                <img
                  src={stylist.photo}
                  alt={stylist.name}
                  className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-500"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-stone-900 text-white text-6xl font-serif">
                  {stylist.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <h3 className="text-2xl font-serif mb-2">{stylist.name}</h3>
            <p className="text-sm uppercase tracking-widest text-stone-500 mb-4">{stylist.role}</p>
            <p className="text-stone-600 leading-relaxed text-sm">{stylist.bio}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

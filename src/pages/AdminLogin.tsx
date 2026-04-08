import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast.error('Please fill in all fields');
      return;
    }
    
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('adminToken', data.token);
        toast.success('Admin login successful');
        window.location.href = '/admin';
      } else {
        toast.error(data.error || 'Login failed');
      }
    } catch (err) {
      toast.error('An error occurred');
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 sm:px-6 lg:px-8">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white p-8 border border-stone-200 shadow-sm"
      >
        <div className="text-center mb-8">
          <h2 className="text-3xl font-serif text-stone-900 mb-2">Admin Access</h2>
          <p className="text-sm uppercase tracking-widest text-stone-500">Sign in to manage salon</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs uppercase tracking-widest text-stone-500 mb-2">Email</label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-stone-200 p-3 focus:outline-none focus:border-stone-900 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-stone-500 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-stone-200 p-3 focus:outline-none focus:border-stone-900 transition-colors"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-stone-900 text-white py-4 text-sm uppercase tracking-widest hover:bg-stone-800 transition-colors"
          >
            Sign In
          </button>
        </form>
      </motion.div>
    </div>
  );
}

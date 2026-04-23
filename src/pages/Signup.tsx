import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { isValidPhoneNumber } from '../lib/phone';

export default function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const getStudentRedirectPath = (profileCompleted?: boolean) => (
    profileCompleted ? '/dashboard' : '/profile'
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name || !email || !phone || !password || !confirmPassword) {
      toast.error('Please fill in all fields');
      return;
    }

    if (!isValidPhoneNumber(phone)) {
      toast.error('Enter a valid phone number');
      return;
    }
    
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, password, confirmPassword })
      });
      const data = await res.json();
      
      if (res.ok) {
        localStorage.setItem('token', data.token);
        toast.success('Signup successful');
        window.location.href = getStudentRedirectPath(data.user?.profileCompleted);
      } else {
        toast.error(data.error || 'Signup failed');
      }
    } catch (err) {
      toast.error('An error occurred');
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const response = await fetch(`/api/auth/google/url?ts=${Date.now()}`, {
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error('Failed to get auth URL');
      }
      const { url } = await response.json();

      const authWindow = window.open(
        url,
        'oauth_popup',
        'width=600,height=700'
      );

      if (!authWindow) {
        toast.error('Please allow popups for this site to connect your account.');
      }
    } catch (error) {
      console.error('OAuth error:', error);
      toast.error('Failed to initiate Google login');
    }
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        localStorage.setItem('token', event.data.token);
        toast.success('Login successful');
        window.location.href = getStudentRedirectPath(event.data.profileCompleted);
      } else if (event.data?.type === 'OAUTH_AUTH_ERROR') {
        toast.error(event.data.error || 'Authentication failed');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <div className="max-w-md mx-auto px-4 py-24">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-8 border border-stone-200 shadow-sm"
      >
        <div className="text-center mb-10">
          <h1 className="text-3xl font-serif text-stone-900 mb-4">Student Signup</h1>
          <div className="w-8 h-[1px] bg-stone-900 mx-auto"></div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs uppercase tracking-widest text-stone-500 mb-2">Full Name</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border-b border-stone-300 py-2 focus:outline-none focus:border-stone-900 transition-colors bg-transparent"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-stone-500 mb-2">BITS Email</label>
            <input 
              type="text" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border-b border-stone-300 py-2 focus:outline-none focus:border-stone-900 transition-colors bg-transparent"
              placeholder="f202XXXXX@pilani.bits-pilani.ac.in"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-stone-500 mb-2">Phone Number</label>
            <input 
              type="tel" 
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full border-b border-stone-300 py-2 focus:outline-none focus:border-stone-900 transition-colors bg-transparent"
              placeholder="+91 98765 43210"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-stone-500 mb-2">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border-b border-stone-300 py-2 focus:outline-none focus:border-stone-900 transition-colors bg-transparent"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-stone-500 mb-2">Confirm Password</label>
            <input 
              type="password" 
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full border-b border-stone-300 py-2 focus:outline-none focus:border-stone-900 transition-colors bg-transparent"
            />
          </div>
          <button 
            type="submit" 
            className="w-full bg-stone-900 text-white py-4 text-sm uppercase tracking-widest hover:bg-stone-800 transition-colors mt-8"
          >
            Create Account
          </button>
        </form>

        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-stone-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-stone-500 uppercase tracking-widest text-xs">Or continue with</span>
            </div>
          </div>

          <div className="mt-6">
            <button
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-3 bg-white border border-stone-300 text-stone-700 py-3 text-sm font-medium hover:bg-stone-50 transition-colors"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
                <path d="M1 1h22v22H1z" fill="none" />
              </svg>
              Google
            </button>
          </div>
        </div>

        <div className="mt-8 text-center text-sm text-stone-500">
          Already have an account? <Link to="/login" className="text-stone-900 border-b border-stone-900 pb-1">Sign in</Link>
        </div>
      </motion.div>
    </div>
  );
}

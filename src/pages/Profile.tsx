import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { isValidPhoneNumber } from '../lib/phone';

interface StudentProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  phoneVerified: boolean;
  profileCompleted: boolean;
}

export default function Profile() {
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');

    if (!token) {
      navigate('/login');
      return;
    }

    fetch('/api/student/profile', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error('Unauthorized');
        }

        return res.json();
      })
      .then((data) => {
        setProfile(data.user);
        setName(data.user.name ?? '');
        setPhone(data.user.phone ?? '');
      })
      .catch(() => {
        toast.error('Please sign in again');
        localStorage.removeItem('token');
        navigate('/login');
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!name.trim() || !phone.trim()) {
      toast.error('Name and phone number are required');
      return;
    }

    if (!isValidPhoneNumber(phone)) {
      toast.error('Enter a valid phone number');
      return;
    }

    try {
      setSaving(true);
      const response = await fetch('/api/student/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update profile');
      }

      setProfile(data.user);
      setName(data.user.name);
      setPhone(data.user.phone);
      toast.success('Profile saved');
      navigate('/dashboard');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return null;
  }

  if (!profile) {
    return null;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white border border-stone-200 p-8 shadow-sm"
      >
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-serif text-stone-900 mb-4">
            {profile.profileCompleted ? 'Your Profile' : 'Complete Your Profile'}
          </h1>
          <div className="w-8 h-[1px] bg-stone-900 mx-auto mb-5"></div>
          <p className="text-sm uppercase tracking-[0.22em] text-stone-500">
            We use your Gmail name and email. Add a phone number so booking and admin records stay complete.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs uppercase tracking-widest text-stone-500 mb-2">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full border-b border-stone-300 py-2 focus:outline-none focus:border-stone-900 transition-colors bg-transparent"
              placeholder="Your full name"
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-widest text-stone-500 mb-2">BITS Email</label>
            <input
              type="email"
              value={profile.email}
              readOnly
              className="w-full border-b border-stone-200 py-2 text-stone-500 bg-transparent cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-widest text-stone-500 mb-2">Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="w-full border-b border-stone-300 py-2 focus:outline-none focus:border-stone-900 transition-colors bg-transparent"
              placeholder="+91 98765 43210"
            />
            <p className="mt-3 text-xs uppercase tracking-[0.18em] text-stone-400">
              Use an Indian number or include your full international code.
            </p>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-stone-900 text-white py-4 text-sm uppercase tracking-widest hover:bg-stone-800 transition-colors disabled:opacity-70"
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

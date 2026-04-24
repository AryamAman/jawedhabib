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
    <div className="page-shell section-light min-h-[calc(100vh-8rem)]">
      <div className="mx-auto max-w-2xl px-4 py-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="auth-card"
      >
        <div className="mb-10 text-center">
          <h1 className="section-heading text-3xl font-serif mb-4">
            {profile.profileCompleted ? 'Your Profile' : 'Complete Your Profile'}
          </h1>
          <div className="editorial-divider mb-5"></div>
          <p className="auth-subtitle">
            We use your Gmail name and email. Add a phone number so booking and admin records stay complete.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="editorial-label">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="editorial-input"
              placeholder="Your full name"
            />
          </div>

          <div>
            <label className="editorial-label">BITS Email</label>
            <input
              type="email"
              value={profile.email}
              readOnly
              className="editorial-input cursor-not-allowed"
            />
          </div>

          <div>
            <label className="editorial-label">Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="editorial-input"
              placeholder="+91 98765 43210"
            />
            <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[color:var(--text-secondary)]">
              Use an Indian number or include your full international code.
            </p>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="editorial-btn editorial-btn-dark w-full py-4 disabled:opacity-70"
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </form>
      </motion.div>
      </div>
    </div>
  );
}

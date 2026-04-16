'use client';

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { clsx } from 'clsx';
import { addMinutes, formatTimeRange } from '../lib/scheduling';
import { clearStudentToken, getStudentToken } from '../lib/client-auth';

interface Booking {
  id: string;
  status: string;
  duration_minutes: number;
  services: { id: string; name: string; price: number; duration_minutes: number }[];
  stylist: { id: string; name: string };
  slot: { id: string; date: string; time: string };
  proposed_slot?: { id: string; date: string; time: string } | null;
}

export default function Dashboard() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'redirecting' | 'error'>('loading');
  const navigate = useNavigate();

  const redirectToLogin = (message?: string) => {
    clearStudentToken();
    setStatus('redirecting');

    if (message) {
      toast.error(message);
    }

    navigate('/login', { replace: true });
  };

  const fetchBookings = async (token: string) => {
    const res = await fetch('/api/student/bookings', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.status === 401) {
      throw new Error('SESSION_EXPIRED');
    }

    if (!res.ok) {
      throw new Error('Failed to load bookings');
    }

    const data = await res.json();
    setBookings(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    let isCancelled = false;

    const loadDashboard = async () => {
      const token = getStudentToken();

      if (!token) {
        redirectToLogin();
        return;
      }

      try {
        const res = await fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 401) {
          throw new Error('SESSION_EXPIRED');
        }

        if (!res.ok) {
          throw new Error('Failed to load your profile');
        }

        const data = await res.json();

        if (isCancelled) {
          return;
        }

        setUser(data.user);
        await fetchBookings(token);

        if (!isCancelled) {
          setStatus('ready');
        }
      } catch (error) {
        if (isCancelled) {
          return;
        }

        if (error instanceof Error && error.message === 'SESSION_EXPIRED') {
          redirectToLogin('Your session expired. Please sign in again.');
          return;
        }

        console.error(error);
        setStatus('error');
        toast.error('Unable to load your dashboard right now.');
      }
    };

    loadDashboard();

    return () => {
      isCancelled = true;
    };
  }, [navigate]);

  const getTokenOrRedirect = () => {
    const token = getStudentToken();

    if (!token) {
      redirectToLogin('Please sign in again.');
      return null;
    }

    return token;
  };

  const handleUnauthorizedResponse = async (res: Response, fallbackMessage: string) => {
    if (res.status === 401) {
      redirectToLogin('Your session expired. Please sign in again.');
      return false;
    }

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      toast.error(data?.error || fallbackMessage);
      return false;
    }

    return true;
  };

  const handleCancel = async (id: string) => {
    const token = getTokenOrRedirect();

    if (!token) {
      return;
    }

    try {
      const res = await fetch(`/api/student/cancel/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const okay = await handleUnauthorizedResponse(res, 'Failed to cancel booking');
      if (!okay) {
        return;
      }

      toast.success('Booking cancelled');
      await fetchBookings(token);
    } catch (err) {
      toast.error('An error occurred');
    }
  };

  const handleRescheduleResponse = async (id: string, accept: boolean) => {
    const token = getTokenOrRedirect();

    if (!token) {
      return;
    }

    try {
      const res = await fetch(`/api/student/bookings/${id}/reschedule-response`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ accept })
      });

      const okay = await handleUnauthorizedResponse(res, 'Failed to respond to reschedule');
      if (!okay) {
        return;
      }

      const data = await res.json();
      toast.success(data.message || (accept ? 'New time accepted' : 'Original time kept'));
      await fetchBookings(token);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  if (status === 'loading' || status === 'redirecting') {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="bg-white border border-stone-200 shadow-sm p-10 text-center">
          <h1 className="text-3xl font-serif text-stone-900">Loading Dashboard</h1>
          <p className="mt-4 text-sm uppercase tracking-widest text-stone-500">
            Checking your booking details...
          </p>
        </div>
      </div>
    );
  }

  if (status === 'error' || !user) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="bg-white border border-stone-200 shadow-sm p-10 text-center">
          <h1 className="text-3xl font-serif text-stone-900">Unable to Load Dashboard</h1>
          <p className="mt-4 text-sm uppercase tracking-widest text-stone-500">
            Please refresh the page or sign in again.
          </p>
          <button
            onClick={() => redirectToLogin()}
            className="mt-8 inline-flex items-center justify-center bg-stone-900 px-6 py-3 text-sm uppercase tracking-widest text-white hover:bg-stone-800 transition-colors"
          >
            Back To Login
          </button>
        </div>
      </div>
    );
  }

  const activeBookings = bookings.filter(b => 
    b.status === 'NEEDS_RESCHEDULE' || b.status === 'RESCHEDULE_PENDING' ||
    ((b.status === 'CONFIRMED' || b.status === 'PENDING' || b.status === 'RESCHEDULE_PROPOSED') && 
     new Date(`${b.slot.date}T${b.slot.time}`) > new Date())
  );
  
  const pastBookings = bookings.filter(b => 
    b.status === 'REJECTED' || 
    (b.status !== 'NEEDS_RESCHEDULE' && b.status !== 'RESCHEDULE_PENDING' && b.status !== 'RESCHEDULE_PROPOSED' && b.status !== 'PENDING' && new Date(`${b.slot.date}T${b.slot.time}`) <= new Date())
  );

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = '/login';
  };

  const getBookingDuration = (booking: Booking) => (
    booking.duration_minutes > 0
      ? booking.duration_minutes
      : booking.services.reduce((total, service) => total + service.duration_minutes, 0)
  );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-16"
      >
        {/* Profile Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-12 p-8 bg-white border border-stone-200 shadow-sm">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-full bg-stone-900 text-white flex items-center justify-center text-2xl font-serif flex-shrink-0">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-3xl font-serif text-stone-900">{user.name}</h1>
              <p className="text-sm uppercase tracking-widest text-stone-500 mt-1">{user.email}</p>
              <span className="inline-block mt-2 text-xs uppercase tracking-widest px-3 py-1 bg-stone-100 text-stone-600">Student</span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="self-start md:self-center px-6 py-3 text-sm uppercase tracking-widest border border-stone-300 text-stone-600 hover:bg-stone-50 hover:border-stone-900 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </motion.div>

      <div className="space-y-16">
        <section>
          <h2 className="text-2xl font-serif text-stone-900 mb-8 pb-4 border-b border-stone-200">Active Appointments</h2>
          {activeBookings.length === 0 ? (
            <p className="text-stone-500 text-sm uppercase tracking-widest">No active appointments.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {activeBookings.map(booking => (
                <div key={booking.id} className={clsx(
                  "border p-6 shadow-sm",
                  booking.status === 'RESCHEDULE_PROPOSED' ? "bg-yellow-50 border-yellow-200" : "bg-white border-stone-200"
                )}>
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="font-serif text-xl mb-1">{booking.services.map(s => s.name).join(', ')}</h3>
                      <p className="text-xs uppercase tracking-widest text-stone-500">with {booking.stylist.name}</p>
                    </div>
                    <span className={clsx(
                      "text-xs uppercase tracking-widest px-3 py-1",
                      booking.status === 'CONFIRMED' ? "bg-stone-900 text-white" :
                      booking.status === 'PENDING' ? "bg-green-100 text-green-900 border border-green-300" :
                      (booking.status === 'RESCHEDULE_PENDING' || booking.status === 'NEEDS_RESCHEDULE' || booking.status === 'RESCHEDULE_PROPOSED')
                        ? "bg-purple-100 text-purple-900 border border-purple-300"
                        : "bg-stone-200 text-stone-800"
                    )}>
                      {booking.status === 'RESCHEDULE_PROPOSED'
                        ? 'Reschedule Proposed'
                        : booking.status === 'NEEDS_RESCHEDULE'
                          ? 'Requested to Reschedule'
                          : booking.status === 'RESCHEDULE_PENDING'
                            ? 'Rescheduled'
                            : booking.status}
                    </span>
                  </div>
                  
                  {booking.status === 'RESCHEDULE_PROPOSED' && booking.proposed_slot ? (
                    <div className="mb-8 bg-purple-50 p-4 border border-purple-200 rounded-sm">
                      <p className="text-sm text-purple-800 mb-4">
                        The salon has proposed a new time for your appointment:
                      </p>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-stone-500 uppercase tracking-widest">Original</span>
                        <span className="line-through text-stone-400">
                          {format(parseISO(booking.slot.date), 'MMM d')} • {formatTimeRange(booking.slot.time, addMinutes(booking.slot.time, getBookingDuration(booking)))}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm font-medium">
                        <span className="text-purple-800 uppercase tracking-widest">New Time</span>
                        <span className="text-purple-900">
                          {format(parseISO(booking.proposed_slot.date), 'MMM d, yyyy')} • {formatTimeRange(
                            booking.proposed_slot.time,
                            addMinutes(booking.proposed_slot.time, getBookingDuration(booking)),
                          )}
                        </span>
                      </div>
                      
                      <div className="flex gap-2 mt-6">
                        <button 
                          onClick={() => handleRescheduleResponse(booking.id, true)}
                          className="flex-1 bg-purple-700 text-white py-2 text-xs uppercase tracking-widest hover:bg-purple-800"
                        >
                          Accept New Time
                        </button>
                        <button 
                          onClick={() => handleRescheduleResponse(booking.id, false)}
                          className="flex-1 bg-white border border-purple-600 text-purple-800 py-2 text-xs uppercase tracking-widest hover:bg-purple-50"
                        >
                          Keep Original
                        </button>
                      </div>
                    </div>
                  ) : booking.status === 'NEEDS_RESCHEDULE' ? (
                    <div className="mb-8 bg-purple-50 p-4 border border-purple-200 rounded-sm">
                      <p className="text-sm text-purple-900 mb-4 font-medium">
                        Your appointment has been requested to reschedule. Please select a new time or cancel your booking.
                      </p>
                      <div className="space-y-2">
                        <button 
                          onClick={() => navigate('/book', {
                            state: {
                              rescheduleBookingId: booking.id,
                              currentStylist: booking.stylist.id,
                              currentServices: booking.services.map(s => s.id),
                              oldSlotId: booking.slot.id,
                              oldDate: booking.slot.date,
                              oldTime: booking.slot.time,
                            },
                          })}
                          className="w-full bg-purple-600 text-white py-3 text-xs uppercase tracking-widest hover:bg-purple-700 transition-colors"
                        >
                          Accept Rescheduling
                        </button>
                        <button 
                          onClick={() => handleCancel(booking.id)}
                          className="w-full border border-purple-300 text-purple-900 py-3 text-xs uppercase tracking-widest hover:bg-purple-100 transition-colors"
                        >
                          Cancel Booking
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4 mb-8">
                      <div className="flex justify-between text-sm">
                        <span className="text-stone-500 uppercase tracking-widest">Date</span>
                        <span className="font-medium">{format(parseISO(booking.slot.date), 'MMM d, yyyy')}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-stone-500 uppercase tracking-widest">Time</span>
                        <span className="font-medium">
                          {formatTimeRange(booking.slot.time, addMinutes(booking.slot.time, getBookingDuration(booking)))}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-stone-500 uppercase tracking-widest">Duration</span>
                        <span className="font-medium">{getBookingDuration(booking)} mins</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-stone-500 uppercase tracking-widest">Price</span>
                        <span className="font-medium">₹{booking.services.reduce((sum, s) => sum + s.price, 0)}</span>
                      </div>
                    </div>
                  )}

                  {booking.status !== 'RESCHEDULE_PROPOSED' && booking.status !== 'NEEDS_RESCHEDULE' && (
                    <button 
                      onClick={() => handleCancel(booking.id)}
                      className="w-full border border-stone-300 text-stone-600 py-3 text-xs uppercase tracking-widest hover:bg-stone-50 transition-colors"
                    >
                      Cancel Appointment
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-2xl font-serif text-stone-900 mb-8 pb-4 border-b border-stone-200">Past & Cancelled</h2>
          {pastBookings.length === 0 ? (
            <p className="text-stone-500 text-sm uppercase tracking-widest">No past appointments.</p>
          ) : (
            <div className="space-y-4">
              {pastBookings.map(booking => (
                <div key={booking.id} className="bg-white border border-stone-200 p-6 flex flex-col md:flex-row justify-between items-center gap-4 opacity-75">
                  <div className="flex-1">
                    <h3 className="font-serif text-lg mb-1">{booking.services.map(s => s.name).join(', ')}</h3>
                    <p className="text-xs uppercase tracking-widest text-stone-500">
                      {format(parseISO(booking.slot.date), 'MMM d, yyyy')} • {formatTimeRange(
                        booking.slot.time,
                        addMinutes(booking.slot.time, getBookingDuration(booking)),
                      )} • {booking.stylist.name}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={clsx(
                      "text-xs uppercase tracking-widest px-3 py-1 border",
                      booking.status === 'CANCELLED' || booking.status === 'REJECTED' ? "border-red-200 text-red-600 bg-red-50" : "border-stone-200 text-stone-600 bg-stone-50"
                    )}>
                      {booking.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

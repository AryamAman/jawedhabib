import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { clsx } from 'clsx';

interface Booking {
  id: string;
  status: string;
  services: { name: string; price: number; duration_minutes: number }[];
  stylist: { name: string };
  slot: { date: string; time: string };
  proposed_slot?: { date: string; time: string } | null;
}

export default function Dashboard() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const navigate = useNavigate();

  const fetchBookings = () => {
    fetch('/api/student/bookings', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
      .then(res => res.json())
      .then(data => setBookings(data));
  };

  useEffect(() => {
    fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
      .then(res => {
        if (!res.ok) throw new Error('Unauthorized');
        return res.json();
      })
      .then(data => setUser(data.user))
      .catch(() => {
        navigate('/login');
      });

    fetchBookings();
  }, [navigate]);

  const handleCancel = async (id: string) => {
    // We can't use window.confirm in an iframe easily, but let's use a simple toast or just cancel
    try {
      const res = await fetch(`/api/student/cancel/${id}`, { 
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        toast.success('Booking cancelled');
        fetchBookings();
      } else {
        toast.error('Failed to cancel booking');
      }
    } catch (err) {
      toast.error('An error occurred');
    }
  };

  const handleRescheduleResponse = async (id: string, accept: boolean) => {
    try {
      const res = await fetch(`/api/student/bookings/${id}/reschedule-response`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}` 
        },
        body: JSON.stringify({ accept })
      });
      if (res.ok) {
        toast.success(accept ? 'New time accepted' : 'Original time kept');
        fetchBookings();
      } else {
        toast.error('Failed to respond to reschedule');
      }
    } catch (err) {
      toast.error('An error occurred');
    }
  };

  if (!user) return null;

  const activeBookings = bookings.filter(b => 
    (b.status === 'CONFIRMED' || b.status === 'PENDING' || b.status === 'RESCHEDULE_PROPOSED') && 
    new Date(`${b.slot.date}T${b.slot.time}`) > new Date()
  );
  
  const pastBookings = bookings.filter(b => 
    b.status === 'CANCELLED' || b.status === 'REJECTED' || 
    (b.status !== 'RESCHEDULE_PROPOSED' && b.status !== 'PENDING' && new Date(`${b.slot.date}T${b.slot.time}`) <= new Date())
  );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-16"
      >
        <h1 className="text-4xl md:text-5xl font-serif text-stone-900 mb-4">Welcome, {user.name.split(' ')[0]}</h1>
        <p className="text-sm uppercase tracking-widest text-stone-500">{user.email}</p>
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
                      booking.status === 'PENDING' ? "bg-stone-200 text-stone-800" :
                      "bg-yellow-200 text-yellow-900"
                    )}>
                      {booking.status === 'RESCHEDULE_PROPOSED' ? 'Action Required' : booking.status}
                    </span>
                  </div>
                  
                  {booking.status === 'RESCHEDULE_PROPOSED' && booking.proposed_slot ? (
                    <div className="mb-8 bg-white p-4 border border-yellow-200 rounded-sm">
                      <p className="text-sm text-yellow-800 mb-4">
                        The salon has proposed a new time for your appointment:
                      </p>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-stone-500 uppercase tracking-widest">Original</span>
                        <span className="line-through text-stone-400">{format(parseISO(booking.slot.date), 'MMM d')} at {booking.slot.time}</span>
                      </div>
                      <div className="flex justify-between text-sm font-medium">
                        <span className="text-yellow-800 uppercase tracking-widest">New Time</span>
                        <span className="text-yellow-900">{format(parseISO(booking.proposed_slot.date), 'MMM d, yyyy')} at {booking.proposed_slot.time}</span>
                      </div>
                      
                      <div className="flex gap-2 mt-6">
                        <button 
                          onClick={() => handleRescheduleResponse(booking.id, true)}
                          className="flex-1 bg-yellow-600 text-white py-2 text-xs uppercase tracking-widest hover:bg-yellow-700"
                        >
                          Accept New Time
                        </button>
                        <button 
                          onClick={() => handleRescheduleResponse(booking.id, false)}
                          className="flex-1 bg-white border border-yellow-600 text-yellow-800 py-2 text-xs uppercase tracking-widest hover:bg-yellow-50"
                        >
                          Keep Original
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
                        <span className="font-medium">{booking.slot.time}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-stone-500 uppercase tracking-widest">Price</span>
                        <span className="font-medium">₹{booking.services.reduce((sum, s) => sum + s.price, 0)}</span>
                      </div>
                    </div>
                  )}

                  {booking.status !== 'RESCHEDULE_PROPOSED' && (
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
                      {format(parseISO(booking.slot.date), 'MMM d, yyyy')} at {booking.slot.time} • {booking.stylist.name}
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

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { clsx } from 'clsx';
import { addMinutes, formatTimeRange } from '../lib/scheduling';

type BookingDisplayStatus =
  | 'Requested'
  | 'Confirmed'
  | 'Asked to Reschedule'
  | 'Reschedule Proposed'
  | 'Rescheduled'
  | 'Expired'
  | 'Cancelled'
  | 'Rejected';

interface Booking {
  id: string;
  status: string;
  duration_minutes: number;
  displayStatus: BookingDisplayStatus;
  isExpired: boolean;
  isUpcoming: boolean;
  canCancel: boolean;
  canRespondToReschedule: boolean;
  services: { id: string; name: string; price: number; duration_minutes: number }[];
  stylist: { id: string; name: string };
  slot: { id: string; date: string; time: string };
  proposed_slot?: { id: string; date: string; time: string } | null;
}

interface StudentProfile {
  name: string;
  email: string;
  phone: string;
  profileCompleted: boolean;
}

const getBookingDuration = (booking: Booking) => (
  booking.duration_minutes > 0
    ? booking.duration_minutes
    : booking.services.reduce((total, service) => total + service.duration_minutes, 0)
);

const compareBookings = (first: Booking, second: Booking) => {
  const firstKey = `${first.slot.date}T${first.slot.time}`;
  const secondKey = `${second.slot.date}T${second.slot.time}`;
  return firstKey.localeCompare(secondKey);
};

const getStatusClasses = (booking: Booking) => {
  if (booking.displayStatus === 'Confirmed') {
    return 'bg-stone-900 text-white';
  }

  if (booking.displayStatus === 'Requested') {
    return 'bg-green-100 text-green-900 border border-green-300';
  }

  if (booking.displayStatus === 'Cancelled' || booking.displayStatus === 'Rejected' || booking.displayStatus === 'Expired') {
    return 'bg-stone-100 text-stone-700 border border-stone-300';
  }

  return 'bg-purple-100 text-purple-900 border border-purple-300';
};

export default function Dashboard() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [user, setUser] = useState<StudentProfile | null>(null);
  const navigate = useNavigate();

  const fetchBookings = () => {
    fetch('/api/student/bookings', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then((res) => res.json())
      .then((data) => setBookings(Array.isArray(data) ? data : []));
  };

  useEffect(() => {
    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error('Unauthorized');
        }
        return res.json();
      })
      .then((data) => {
        if (!data.user?.profileCompleted) {
          navigate('/profile');
          return;
        }

        setUser(data.user);
        fetchBookings();
      })
      .catch(() => {
        navigate('/login');
      });
  }, [navigate]);

  const handleCancel = async (id: string) => {
    try {
      const res = await fetch(`/api/student/cancel/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Failed to cancel booking');
      }

      toast.success('Booking cancelled');
      fetchBookings();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'An error occurred');
    }
  };

  const handleRescheduleResponse = async (id: string, accept: boolean) => {
    try {
      const res = await fetch(`/api/student/bookings/${id}/reschedule-response`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ accept }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to respond to reschedule');
      }

      toast.success(data.message || (accept ? 'New time accepted' : 'Original time kept'));
      fetchBookings();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'An error occurred');
    }
  };

  if (!user) {
    return null;
  }

  const archivedBookings = bookings
    .filter((booking) => booking.isExpired || booking.displayStatus === 'Cancelled' || booking.displayStatus === 'Rejected')
    .sort(compareBookings);
  const upcomingBookings = bookings
    .filter((booking) => !booking.isExpired && booking.isUpcoming && booking.displayStatus !== 'Cancelled' && booking.displayStatus !== 'Rejected')
    .sort(compareBookings);
  const activeBookings = bookings
    .filter((booking) => !booking.isExpired && !booking.isUpcoming && booking.displayStatus !== 'Cancelled' && booking.displayStatus !== 'Rejected')
    .sort(compareBookings);

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = '/login';
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-16"
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-12 p-8 bg-white border border-stone-200 shadow-sm">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-full bg-stone-900 text-white flex items-center justify-center text-2xl font-serif flex-shrink-0">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-3xl font-serif text-stone-900">{user.name}</h1>
              <p className="text-sm uppercase tracking-widest text-stone-500 mt-1">{user.email}</p>
              <p className="text-xs uppercase tracking-[0.22em] text-stone-400 mt-2">{user.phone}</p>
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
              {activeBookings.map((booking) => (
                <div
                  key={booking.id}
                  className={clsx(
                    'border p-6 shadow-sm',
                    booking.displayStatus === 'Reschedule Proposed' ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-stone-200',
                  )}
                >
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="font-serif text-xl mb-1">{booking.services.map((service) => service.name).join(', ')}</h3>
                      <p className="text-xs uppercase tracking-widest text-stone-500">with {booking.stylist.name}</p>
                    </div>
                    <span className={clsx('text-xs uppercase tracking-widest px-3 py-1', getStatusClasses(booking))}>
                      {booking.displayStatus}
                    </span>
                  </div>

                  {booking.displayStatus === 'Reschedule Proposed' && booking.proposed_slot ? (
                    <div className="mb-8 bg-purple-50 p-4 border border-purple-200 rounded-sm">
                      <p className="text-sm text-purple-800 mb-4">
                        The salon has proposed a new time for your appointment:
                      </p>
                      <div className="flex justify-between text-sm mb-2 gap-4">
                        <span className="text-stone-500 uppercase tracking-widest">Original</span>
                        <span className="line-through text-stone-400 text-right">
                          {format(parseISO(booking.slot.date), 'MMM d')} • {formatTimeRange(booking.slot.time, addMinutes(booking.slot.time, getBookingDuration(booking)))}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm font-medium gap-4">
                        <span className="text-purple-800 uppercase tracking-widest">New Time</span>
                        <span className="text-purple-900 text-right">
                          {format(parseISO(booking.proposed_slot.date), 'MMM d, yyyy')} • {formatTimeRange(
                            booking.proposed_slot.time,
                            addMinutes(booking.proposed_slot.time, getBookingDuration(booking)),
                          )}
                        </span>
                      </div>

                      {booking.canRespondToReschedule ? (
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
                      ) : null}
                    </div>
                  ) : booking.displayStatus === 'Asked to Reschedule' ? (
                    <div className="mb-8 bg-purple-50 p-4 border border-purple-200 rounded-sm">
                      <p className="text-sm text-purple-900 mb-4 font-medium">
                        Your appointment has been asked to reschedule. Pick a new time or cancel the booking.
                      </p>
                      <div className="space-y-2">
                        <button
                          onClick={() => navigate('/book', {
                            state: {
                              rescheduleBookingId: booking.id,
                              currentStylist: booking.stylist.id,
                              currentServices: booking.services.map((service) => service.id),
                              oldSlotId: booking.slot.id,
                              oldDate: booking.slot.date,
                              oldTime: booking.slot.time,
                            },
                          })}
                          className="w-full bg-purple-600 text-white py-3 text-xs uppercase tracking-widest hover:bg-purple-700 transition-colors"
                        >
                          Accept Rescheduling
                        </button>
                        {booking.canCancel ? (
                          <button
                            onClick={() => handleCancel(booking.id)}
                            className="w-full border border-purple-300 text-purple-900 py-3 text-xs uppercase tracking-widest hover:bg-purple-100 transition-colors"
                          >
                            Cancel Booking
                          </button>
                        ) : null}
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
                        <span className="font-medium">₹{booking.services.reduce((sum, service) => sum + service.price, 0)}</span>
                      </div>
                    </div>
                  )}

                  {booking.canCancel && booking.displayStatus !== 'Asked to Reschedule' && booking.displayStatus !== 'Reschedule Proposed' ? (
                    <button
                      onClick={() => handleCancel(booking.id)}
                      className="w-full border border-stone-300 text-stone-600 py-3 text-xs uppercase tracking-widest hover:bg-stone-50 transition-colors"
                    >
                      Cancel Appointment
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-2xl font-serif text-stone-900 mb-8 pb-4 border-b border-stone-200">Upcoming</h2>
          {upcomingBookings.length === 0 ? (
            <p className="text-stone-500 text-sm uppercase tracking-widest">No upcoming appointments.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {upcomingBookings.map((booking) => (
                <div key={booking.id} className="bg-white border border-stone-200 p-6 shadow-sm">
                  <div className="flex justify-between items-start mb-6 gap-4">
                    <div>
                      <h3 className="font-serif text-xl mb-1">{booking.services.map((service) => service.name).join(', ')}</h3>
                      <p className="text-xs uppercase tracking-widest text-stone-500">with {booking.stylist.name}</p>
                    </div>
                    <span className={clsx('text-xs uppercase tracking-widest px-3 py-1', getStatusClasses(booking))}>
                      {booking.displayStatus}
                    </span>
                  </div>

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
                      <span className="text-stone-500 uppercase tracking-widest">Price</span>
                      <span className="font-medium">₹{booking.services.reduce((sum, service) => sum + service.price, 0)}</span>
                    </div>
                  </div>

                  {booking.displayStatus === 'Reschedule Proposed' && booking.proposed_slot && booking.canRespondToReschedule ? (
                    <div className="space-y-4">
                      <div className="bg-purple-50 p-4 border border-purple-200 rounded-sm text-sm text-purple-900">
                        Proposed: {format(parseISO(booking.proposed_slot.date), 'MMM d, yyyy')} • {formatTimeRange(
                          booking.proposed_slot.time,
                          addMinutes(booking.proposed_slot.time, getBookingDuration(booking)),
                        )}
                      </div>
                      <div className="flex gap-2">
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
                  ) : booking.displayStatus === 'Asked to Reschedule' ? (
                    <div className="space-y-2">
                      <button
                        onClick={() => navigate('/book', {
                          state: {
                            rescheduleBookingId: booking.id,
                            currentStylist: booking.stylist.id,
                            currentServices: booking.services.map((service) => service.id),
                            oldSlotId: booking.slot.id,
                            oldDate: booking.slot.date,
                            oldTime: booking.slot.time,
                          },
                        })}
                        className="w-full bg-purple-600 text-white py-3 text-xs uppercase tracking-widest hover:bg-purple-700 transition-colors"
                      >
                        Accept Rescheduling
                      </button>
                      {booking.canCancel ? (
                        <button
                          onClick={() => handleCancel(booking.id)}
                          className="w-full border border-purple-300 text-purple-900 py-3 text-xs uppercase tracking-widest hover:bg-purple-100 transition-colors"
                        >
                          Cancel Booking
                        </button>
                      ) : null}
                    </div>
                  ) : booking.canCancel ? (
                    <button
                      onClick={() => handleCancel(booking.id)}
                      className="w-full border border-stone-300 text-stone-600 py-3 text-xs uppercase tracking-widest hover:bg-stone-50 transition-colors"
                    >
                      Cancel Appointment
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-2xl font-serif text-stone-900 mb-8 pb-4 border-b border-stone-200">Past & Expired</h2>
          {archivedBookings.length === 0 ? (
            <p className="text-stone-500 text-sm uppercase tracking-widest">No past appointments.</p>
          ) : (
            <div className="space-y-4">
              {archivedBookings.map((booking) => (
                <div key={booking.id} className="bg-white border border-stone-200 p-6 flex flex-col md:flex-row justify-between items-center gap-4 opacity-75">
                  <div className="flex-1">
                    <h3 className="font-serif text-lg mb-1">{booking.services.map((service) => service.name).join(', ')}</h3>
                    <p className="text-xs uppercase tracking-widest text-stone-500">
                      {format(parseISO(booking.slot.date), 'MMM d, yyyy')} • {formatTimeRange(
                        booking.slot.time,
                        addMinutes(booking.slot.time, getBookingDuration(booking)),
                      )} • {booking.stylist.name}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={clsx('text-xs uppercase tracking-widest px-3 py-1 border', getStatusClasses(booking))}>
                      {booking.displayStatus}
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

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { clsx } from 'clsx';
import { addMinutes, formatTimeRange } from '../lib/scheduling';
import EmptyState from '../components/EmptyState';

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
    return 'booking-status booking-status--confirmed';
  }

  if (booking.displayStatus === 'Requested') {
    return 'booking-status booking-status--requested';
  }

  if (booking.displayStatus === 'Cancelled') {
    return 'booking-status booking-status--cancelled';
  }

  if (booking.displayStatus === 'Rejected') {
    return 'booking-status booking-status--rejected';
  }

  if (booking.displayStatus === 'Expired') {
    return 'booking-status booking-status--expired';
  }

  return 'booking-status booking-status--reschedule';
};

const getBookingCardTone = (booking: Booking) => {
  if (booking.displayStatus === 'Cancelled') {
    return 'booking-card--cancelled';
  }

  if (booking.displayStatus === 'Rejected') {
    return 'booking-card--rejected';
  }

  if (booking.displayStatus === 'Expired') {
    return 'booking-card--expired';
  }

  if (booking.displayStatus === 'Asked to Reschedule' || booking.displayStatus === 'Reschedule Proposed' || booking.displayStatus === 'Rescheduled') {
    return 'booking-card--rescheduled';
  }

  if (booking.displayStatus === 'Requested') {
    return 'booking-card--requested';
  }

  if (booking.displayStatus === 'Confirmed') {
    return 'booking-card--confirmed';
  }

  return 'booking-card--default';
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
    <div className="page-shell section-light min-h-[calc(100vh-8rem)]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-16"
      >
        <div className="surface-card editorial-border-left mb-12 flex flex-col gap-6 p-8 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-[color:var(--btn-dark-bg)] text-2xl font-serif text-[color:var(--status-confirmed-text)]">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="section-heading text-3xl font-serif">{user.name}</h1>
              <p className="mt-1 text-sm uppercase tracking-[0.18em] text-[color:var(--text-secondary)]">{user.email}</p>
              <p className="mt-2 text-xs uppercase tracking-[0.22em] text-[color:var(--text-secondary)]">{user.phone}</p>
              <span className="booking-status booking-status--requested mt-2 inline-flex">Student</span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="editorial-btn editorial-btn-subtle self-start md:self-center"
          >
            Sign Out
          </button>
        </div>
      </motion.div>

      <div className="space-y-16">
        <section>
          <h2 className="section-heading mb-8 border-b border-[color:var(--border-light)] pb-4 text-2xl font-serif">Active Appointments</h2>
          {activeBookings.length === 0 ? (
            <EmptyState label="No active appointments" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {activeBookings.map((booking) => (
                <div
                  key={booking.id}
                  className={clsx(
                    'booking-card p-6',
                    getBookingCardTone(booking),
                  )}
                >
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="font-serif text-xl mb-1 text-[color:var(--text-dark)]">{booking.services.map((service) => service.name).join(', ')}</h3>
                      <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-secondary)]">with {booking.stylist.name}</p>
                    </div>
                    <span className={clsx(getStatusClasses(booking))}>
                      {booking.displayStatus}
                    </span>
                  </div>

                  {booking.displayStatus === 'Reschedule Proposed' && booking.proposed_slot ? (
                    <div className="mb-8 rounded-[var(--radius-md)] border border-[color:var(--status-reschedule-border)] bg-[color:var(--status-reschedule-bg)] p-4">
                      <p className="mb-4 text-sm text-[color:var(--status-reschedule-text)]">
                        The salon has proposed a new time for your appointment:
                      </p>
                      <div className="flex justify-between text-sm mb-2 gap-4">
                        <span className="text-[color:var(--text-secondary)] uppercase tracking-[0.18em]">Original</span>
                        <span className="line-through text-right text-[color:var(--text-secondary)]">
                          {format(parseISO(booking.slot.date), 'MMM d')} • {formatTimeRange(booking.slot.time, addMinutes(booking.slot.time, getBookingDuration(booking)))}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm font-medium gap-4">
                        <span className="uppercase tracking-[0.18em] text-[color:var(--status-reschedule-text)]">New Time</span>
                        <span className="text-right text-[color:var(--text-dark)]">
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
                            className="editorial-btn editorial-btn-dark flex-1 py-3"
                          >
                            Accept New Time
                          </button>
                          <button
                            onClick={() => handleRescheduleResponse(booking.id, false)}
                            className="editorial-btn editorial-btn-soft flex-1 py-3"
                          >
                            Keep Original
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : booking.displayStatus === 'Asked to Reschedule' ? (
                    <div className="mb-8 rounded-[var(--radius-md)] border border-[color:var(--status-reschedule-border)] bg-[color:var(--status-reschedule-bg)] p-4">
                      <p className="mb-4 text-sm font-medium text-[color:var(--text-dark)]">
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
                          className="editorial-btn editorial-btn-dark w-full py-3"
                        >
                          Accept Rescheduling
                        </button>
                        {booking.canCancel ? (
                          <button
                            onClick={() => handleCancel(booking.id)}
                            className="editorial-btn editorial-btn-soft w-full py-3"
                          >
                            Cancel Booking
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4 mb-8">
                      <div className="flex justify-between text-sm">
                        <span className="section-kicker">Date</span>
                        <span className="font-medium text-[color:var(--text-dark)]">{format(parseISO(booking.slot.date), 'MMM d, yyyy')}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="section-kicker">Time</span>
                        <span className="font-medium text-[color:var(--text-dark)]">
                          {formatTimeRange(booking.slot.time, addMinutes(booking.slot.time, getBookingDuration(booking)))}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="section-kicker">Duration</span>
                        <span className="font-medium text-[color:var(--text-dark)]">{getBookingDuration(booking)} mins</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="section-kicker">Price</span>
                        <span className="font-medium text-[color:var(--text-dark)]">₹{booking.services.reduce((sum, service) => sum + service.price, 0)}</span>
                      </div>
                    </div>
                  )}

                  {booking.canCancel && booking.displayStatus !== 'Asked to Reschedule' && booking.displayStatus !== 'Reschedule Proposed' ? (
                    <button
                      onClick={() => handleCancel(booking.id)}
                      className="editorial-btn editorial-btn-subtle w-full py-3"
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
          <h2 className="section-heading mb-8 border-b border-[color:var(--border-light)] pb-4 text-2xl font-serif">Upcoming</h2>
          {upcomingBookings.length === 0 ? (
            <EmptyState label="No upcoming appointments" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {upcomingBookings.map((booking) => (
                <div key={booking.id} className={clsx('booking-card p-6', getBookingCardTone(booking))}>
                  <div className="flex justify-between items-start mb-6 gap-4">
                    <div>
                      <h3 className="font-serif text-xl mb-1 text-[color:var(--text-dark)]">{booking.services.map((service) => service.name).join(', ')}</h3>
                      <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-secondary)]">with {booking.stylist.name}</p>
                    </div>
                    <span className={clsx(getStatusClasses(booking))}>
                      {booking.displayStatus}
                    </span>
                  </div>

                  <div className="space-y-4 mb-8">
                    <div className="flex justify-between text-sm">
                      <span className="section-kicker">Date</span>
                      <span className="font-medium text-[color:var(--text-dark)]">{format(parseISO(booking.slot.date), 'MMM d, yyyy')}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="section-kicker">Time</span>
                      <span className="font-medium text-[color:var(--text-dark)]">
                        {formatTimeRange(booking.slot.time, addMinutes(booking.slot.time, getBookingDuration(booking)))}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="section-kicker">Price</span>
                      <span className="font-medium text-[color:var(--text-dark)]">₹{booking.services.reduce((sum, service) => sum + service.price, 0)}</span>
                    </div>
                  </div>

                  {booking.displayStatus === 'Reschedule Proposed' && booking.proposed_slot && booking.canRespondToReschedule ? (
                    <div className="space-y-4">
                      <div className="rounded-[var(--radius-md)] border border-[color:var(--status-reschedule-border)] bg-[color:var(--status-reschedule-bg)] p-4 text-sm text-[color:var(--text-dark)]">
                        Proposed: {format(parseISO(booking.proposed_slot.date), 'MMM d, yyyy')} • {formatTimeRange(
                          booking.proposed_slot.time,
                          addMinutes(booking.proposed_slot.time, getBookingDuration(booking)),
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRescheduleResponse(booking.id, true)}
                          className="editorial-btn editorial-btn-dark flex-1 py-3"
                        >
                          Accept New Time
                        </button>
                        <button
                          onClick={() => handleRescheduleResponse(booking.id, false)}
                          className="editorial-btn editorial-btn-soft flex-1 py-3"
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
                        className="editorial-btn editorial-btn-dark w-full py-3"
                      >
                        Accept Rescheduling
                      </button>
                      {booking.canCancel ? (
                        <button
                          onClick={() => handleCancel(booking.id)}
                          className="editorial-btn editorial-btn-soft w-full py-3"
                        >
                          Cancel Booking
                        </button>
                      ) : null}
                    </div>
                  ) : booking.canCancel ? (
                    <button
                      onClick={() => handleCancel(booking.id)}
                      className="editorial-btn editorial-btn-subtle w-full py-3"
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
          <h2 className="section-heading mb-8 border-b border-[color:var(--border-light)] pb-4 text-2xl font-serif">Past & Expired</h2>
          {archivedBookings.length === 0 ? (
            <EmptyState label="No past appointments" />
          ) : (
            <div className="space-y-4">
              {archivedBookings.map((booking) => (
                <div key={booking.id} className={clsx('booking-card flex flex-col items-center justify-between gap-4 p-6 opacity-75 md:flex-row', getBookingCardTone(booking))}>
                  <div className="flex-1">
                    <h3 className="font-serif text-lg mb-1 text-[color:var(--text-dark)]">{booking.services.map((service) => service.name).join(', ')}</h3>
                    <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-secondary)]">
                      {format(parseISO(booking.slot.date), 'MMM d, yyyy')} • {formatTimeRange(
                        booking.slot.time,
                        addMinutes(booking.slot.time, getBookingDuration(booking)),
                      )} • {booking.stylist.name}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={clsx(getStatusClasses(booking))}>
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
    </div>
  );
}

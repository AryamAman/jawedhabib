import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO, addDays, startOfToday } from 'date-fns';
import clsx from 'clsx';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
interface Booking {
  id: string;
  status: string;
  student: { name: string; email: string };
  services: { name: string; price: number }[];
  stylist: { id: string; name: string };
  slot: { date: string; time: string };
}

interface Stylist { id: string; name: string; role: string; }
interface Slot { id: string; date: string; time: string; status: string; }

export default function AdminDashboard() {
  const [admin, setAdmin] = useState<{ email: string } | null>(null);
  const token = localStorage.getItem('adminToken');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [activeTab, setActiveTab] = useState<'bookings' | 'slots'>('bookings');
  
  const [stylists, setStylists] = useState<Stylist[]>([]);
  const [selectedStylist, setSelectedStylist] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<Date>(startOfToday());
  const [slots, setSlots] = useState<Slot[]>([]);
  
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ id: string, type: 'CANCELLED' | 'NEEDS_RESCHEDULE' | 'REJECTED' } | null>(null);
  
  const navigate = useNavigate();
  

  const fetchBookings = async () => {
    if (!token) return;
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/admin/bookings', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          navigate('/admin/login');
          return;
        }
        throw new Error('Failed to fetch bookings');
      }
      const data = await res.json();
      setBookings(data);
    } catch (err) {
      toast.error('Failed to load bookings');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!token) {
      navigate('/admin/login');
      return;
    }
    // fetch admin profile
    fetch('/api/admin/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setAdmin(data.admin))
      .catch(() => {
        navigate('/admin/login');
      });
    fetchBookings();
    fetch('/api/stylists')
      .then(res => res.json())
      .then(data => {
        setStylists(data);
        if (data.length > 0 && !selectedStylist) setSelectedStylist(data[0].id);
      });
  }, [navigate, token]);


  useEffect(() => {
    if (activeTab === 'bookings') fetchBookings();
  }, [activeTab]);

  const fetchSlots = () => {
    if (selectedStylist && selectedDate) {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      fetch(`/api/slots?stylist_id=${selectedStylist}&date=${dateStr}`)
        .then(res => res.json())
        .then(setSlots);
    }
  };

  useEffect(() => {
    fetchSlots();
  }, [selectedStylist, selectedDate]);



  const handleGenerateSlots = async () => {
    try {
      const res = await fetch('/api/admin/slots/generate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          date: format(selectedDate, 'yyyy-MM-dd'),
          stylist_id: selectedStylist
        })
      });
      if (res.ok) {
        toast.success('Slots generated successfully');
        fetchSlots();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to generate slots');
      }
    } catch (err) {
      toast.error('An error occurred');
    }
  };

  const handleToggleSlot = async (slotId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'AVAILABLE' ? 'UNAVAILABLE' : 'AVAILABLE';
    
    if (currentStatus === 'BOOKED' || currentStatus === 'PENDING') {
      const confirm = window.confirm('This slot is currently booked. Marking it unavailable will ask the customer to reschedule. Continue?');
      if (!confirm) return;
    }
    
    try {
      const res = await fetch(`/api/admin/slots/${slotId}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        toast.success(`Slot marked as ${newStatus.toLowerCase()}`);
        fetchSlots();
        fetchBookings(); // Also fetch bookings since we might have updated booking statuses to NEEDS_RESCHEDULE
      } else {
        toast.error('Failed to update slot');
      }
    } catch (err) {
      toast.error('An error occurred');
    }
  };

  const handleStatusChange = async (bookingId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/status`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        toast.success(`Booking ${newStatus.toLowerCase()}`);
        fetchBookings();
      } else {
        toast.error('Failed to update booking');
      }
    } catch (err) {
      toast.error('An error occurred');
    }
  };

  const dates = Array.from({ length: 14 }).map((_, i) => addDays(startOfToday(), i));

  const pendingBookings = bookings
    .filter(b => b.status === 'PENDING' || b.status === 'RESCHEDULE_PENDING')
    .sort((a, b) => {
      // Prioritize RESCHEDULE_PENDING over PENDING
      if (a.status === 'RESCHEDULE_PENDING' && b.status === 'PENDING') return -1;
      if (b.status === 'RESCHEDULE_PENDING' && a.status === 'PENDING') return 1;
      return 0;
    });
  const confirmedBookings = bookings.filter(b => b.status === 'CONFIRMED' || b.status === 'RESCHEDULE_PROPOSED');

  const onDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('bookingId', id);
  };

  const onDrop = (e: React.DragEvent, targetStatus: string) => {
    const id = e.dataTransfer.getData('bookingId');
    if (id) {
      handleStatusChange(id, targetStatus);
    }
  };

  const BookingCard = ({ booking }: { booking: Booking }) => (
    <div 
      draggable={booking.status === 'PENDING' || booking.status === 'RESCHEDULE_PENDING'}
      onDragStart={(e) => onDragStart(e, booking.id)}
      className={clsx(
        "bg-white border p-5 shadow-sm mb-4 transition-colors",
        (booking.status === 'PENDING' || booking.status === 'RESCHEDULE_PENDING') ? "active:cursor-grabbing border-stone-200 hover:border-stone-400 cursor-grab" : "border-stone-200",
        booking.status === 'RESCHEDULE_PENDING' && "border-purple-300 bg-purple-50",
        booking.status === 'PENDING' && "border-green-300 bg-green-50"
      )}
    >
      <div className="flex justify-between items-start mb-2">
        <div className={clsx(
          "font-medium", 
          booking.status === 'RESCHEDULE_PENDING' ? "text-purple-900" : 
          booking.status === 'PENDING' ? "text-green-900" : "text-stone-900"
        )}>{booking.student.name}</div>
        <div className={clsx(
          "text-xs uppercase tracking-widest",
          booking.status === 'RESCHEDULE_PENDING' ? "text-purple-600" :
          booking.status === 'PENDING' ? "text-green-600" : "text-stone-500"
        )}>{booking.status === 'RESCHEDULE_PENDING' ? 'Rescheduled' : booking.status}</div>
      </div>
      <div className="text-sm text-stone-600 mb-2">
        {format(parseISO(booking.slot.date), 'MMM d, yyyy')} at {booking.slot.time}
      </div>
      <div className="text-xs text-stone-500">
        Stylist: {booking.stylist.name} <br/>
        Services: {booking.services.map(s => s.name).join(', ')}
      </div>

      <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-stone-200/50">
        {confirmAction?.id === booking.id && confirmAction.type === 'REJECTED' ? (
          <div className="flex-1 bg-red-50 border border-red-200 p-3 text-center transition-all animate-in fade-in zoom-in-95 duration-200">
            <span className="block text-red-800 mb-3 text-[10px] sm:text-xs uppercase tracking-widest font-medium">Reject this request?</span>
            <div className="flex gap-2 items-center">
              <button onClick={() => { handleStatusChange(booking.id, 'REJECTED'); setConfirmAction(null); }} className="flex-1 bg-red-600 text-white py-2 text-[10px] uppercase tracking-widest hover:bg-red-700 transition">Yes</button>
              <button onClick={() => setConfirmAction(null)} className="flex-1 bg-white border border-red-200 text-red-600 py-2 text-[10px] uppercase tracking-widest hover:bg-red-50 transition">Cancel</button>
            </div>
          </div>
        ) : confirmAction?.id === booking.id && confirmAction.type === 'CANCELLED' ? (
          <div className="flex-1 bg-red-50 border border-red-200 p-3 text-center transition-all animate-in fade-in zoom-in-95 duration-200">
            <span className="block text-red-800 mb-3 text-[10px] sm:text-xs uppercase tracking-widest font-medium">Cancel this booking?</span>
            <div className="flex gap-2 items-center">
              <button onClick={() => { handleStatusChange(booking.id, 'CANCELLED'); setConfirmAction(null); }} className="flex-1 bg-red-600 text-white py-2 text-[10px] uppercase tracking-widest hover:bg-red-700 transition">Yes</button>
              <button onClick={() => setConfirmAction(null)} className="flex-1 bg-white border border-red-200 text-red-600 py-2 text-[10px] uppercase tracking-widest hover:bg-red-50 transition">Cancel</button>
            </div>
          </div>
        ) : confirmAction?.id === booking.id && confirmAction.type === 'NEEDS_RESCHEDULE' ? (
          <div className="flex-1 bg-stone-100 border border-stone-300 p-3 text-center transition-all animate-in fade-in zoom-in-95 duration-200">
            <span className="block text-stone-800 mb-3 text-[10px] sm:text-xs uppercase tracking-widest font-medium">Ask to Reschedule?</span>
            <div className="flex gap-2 items-center">
              <button onClick={() => { handleStatusChange(booking.id, 'NEEDS_RESCHEDULE'); setConfirmAction(null); }} className="flex-1 bg-stone-900 text-white py-2 text-[10px] uppercase tracking-widest hover:bg-stone-800 transition">Yes</button>
              <button onClick={() => setConfirmAction(null)} className="flex-1 bg-white border border-stone-200 text-stone-600 py-2 text-[10px] uppercase tracking-widest hover:bg-stone-50 transition">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(booking.status === 'PENDING' || booking.status === 'RESCHEDULE_PENDING') && (
              <>
                <button 
                  onClick={() => handleStatusChange(booking.id, 'CONFIRMED')}
                  className="flex-1 min-w-[70px] bg-green-600 text-white py-2 text-[10px] sm:text-xs uppercase tracking-widest hover:bg-green-700 transition-colors"
                >
                  Accept
                </button>
                <button 
                  onClick={() => setConfirmAction({ id: booking.id, type: 'REJECTED' })}
                  className="flex-1 min-w-[70px] bg-red-50 text-red-600 py-2 text-[10px] sm:text-xs uppercase tracking-widest hover:bg-red-100 transition-colors"
                >
                  Reject
                </button>
                <button 
                  onClick={() => setConfirmAction({ id: booking.id, type: 'NEEDS_RESCHEDULE' })}
                  className="flex-[2] min-w-[120px] bg-stone-900 text-white py-2 text-[10px] sm:text-xs uppercase tracking-widest hover:bg-stone-800 transition-colors"
                >
                  Reschedule
                </button>
              </>
            )}

            {booking.status === 'CONFIRMED' && (
              <>
                <button 
                  onClick={() => setConfirmAction({ id: booking.id, type: 'CANCELLED' })}
                  className="flex-1 bg-white border border-red-200 text-red-600 py-2 text-[10px] sm:text-xs uppercase tracking-widest hover:bg-red-50 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => setConfirmAction({ id: booking.id, type: 'NEEDS_RESCHEDULE' })}
                  className="flex-1 bg-stone-900 text-white py-2 text-[10px] sm:text-xs uppercase tracking-widest hover:bg-stone-800 transition-colors"
                >
                  Reschedule
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    window.location.href = '/admin/login';
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-16"
      >
        {/* Admin Profile Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-12 p-8 bg-white border border-stone-200 shadow-sm">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-full bg-stone-900 text-white flex items-center justify-center text-2xl font-serif flex-shrink-0">
              {admin?.email?.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-3xl font-serif text-stone-900">Admin</h1>
              <p className="text-sm uppercase tracking-widest text-stone-500 mt-1">{admin?.email}</p>
              <span className="inline-block mt-2 text-xs uppercase tracking-widest px-3 py-1 bg-stone-100 text-stone-600">Administrator</span>
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

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-12 flex flex-col md:flex-row md:justify-between md:items-end gap-6"
      >
        <div>
          <h1 className="text-4xl md:text-5xl font-serif text-stone-900 mb-4">Admin Dashboard</h1>
          <p className="text-sm uppercase tracking-widest text-stone-500">Manage salon operations</p>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-3 text-sm uppercase tracking-widest bg-white border border-stone-200 text-stone-600 hover:bg-stone-50 transition-colors"
          >
            Refresh
          </button>
          <button 
            onClick={() => setActiveTab('bookings')}
            className={clsx(
              "px-6 py-3 text-sm uppercase tracking-widest transition-colors",
              activeTab === 'bookings' ? "bg-stone-900 text-white" : "bg-white border border-stone-200 text-stone-600 hover:bg-stone-50"
            )}
          >
            Bookings
          </button>
          <button 
            onClick={() => setActiveTab('slots')}
            className={clsx(
              "px-6 py-3 text-sm uppercase tracking-widest transition-colors",
              activeTab === 'slots' ? "bg-stone-900 text-white" : "bg-white border border-stone-200 text-stone-600 hover:bg-stone-50"
            )}
          >
            Manage Slots
          </button>
        </div>
      </motion.div>

      {activeTab === 'bookings' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Pending Column */}
          <div 
            className="bg-stone-50 p-6 min-h-[500px] border border-stone-200"
            onDragOver={(e) => e.preventDefault()}
          >
            <h2 className="text-lg font-serif mb-6 flex justify-between items-center">
              <span>Pending Requests</span>
              <span className="bg-stone-200 text-stone-800 text-xs px-2 py-1 rounded-full">{pendingBookings.length}</span>
            </h2>
            {pendingBookings.map(booking => (
              <div key={booking.id}><BookingCard booking={booking} /></div>
            ))}
            {pendingBookings.length === 0 && (
              <div className="text-center text-stone-400 text-sm uppercase tracking-widest py-12 border-2 border-dashed border-stone-200">
                No pending requests
              </div>
            )}
          </div>

          {/* Confirmed Column */}
          <div 
            className="bg-stone-50 p-6 min-h-[500px] border border-stone-200"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDrop(e, 'CONFIRMED')}
          >
            <h2 className="text-lg font-serif mb-6 flex justify-between items-center">
              <span>Confirmed Appointments</span>
              <span className="bg-stone-200 text-stone-800 text-xs px-2 py-1 rounded-full">{confirmedBookings.length}</span>
            </h2>
            <div className="text-xs text-stone-500 mb-4 uppercase tracking-widest">
              Drag pending requests here to confirm
            </div>
            {confirmedBookings.map(booking => (
              <div key={booking.id}><BookingCard booking={booking} /></div>
            ))}
            {confirmedBookings.length === 0 && (
              <div className="text-center text-stone-400 text-sm uppercase tracking-widest py-12 border-2 border-dashed border-stone-200">
                No confirmed appointments
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'slots' && (
        <div className="space-y-8">
          <div className="bg-white border border-stone-200 p-6">
            <h2 className="text-lg font-serif mb-4">Select Stylist</h2>
            <div className="flex flex-wrap gap-4">
              {stylists.map(stylist => (
                <button
                  key={stylist.id}
                  onClick={() => setSelectedStylist(stylist.id)}
                  className={clsx(
                    "px-6 py-3 text-sm uppercase tracking-widest transition-colors border",
                    selectedStylist === stylist.id 
                      ? "bg-stone-900 text-white border-stone-900" 
                      : "bg-white text-stone-600 border-stone-200 hover:border-stone-400"
                  )}
                >
                  {stylist.name}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white border border-stone-200 p-6">
            <h2 className="text-lg font-serif mb-4">Select Date</h2>
            <div className="flex overflow-x-auto pb-4 gap-4 snap-x">
              {dates.map((date, i) => (
                <div 
                  key={i}
                  onClick={() => setSelectedDate(date)}
                  className={clsx(
                    "flex-shrink-0 w-24 p-4 border text-center cursor-pointer transition-all duration-300 snap-start",
                    format(selectedDate, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
                      ? "border-stone-900 bg-stone-900 text-white" 
                      : "border-stone-200 bg-white hover:border-stone-400 text-stone-900"
                  )}
                >
                  <p className="text-xs uppercase tracking-widest mb-1">{format(date, 'EEE')}</p>
                  <p className="font-serif text-2xl">{format(date, 'd')}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-stone-200 p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-serif">Time Slots</h2>
              {slots.length === 0 && (
                <button 
                  onClick={handleGenerateSlots}
                  className="bg-stone-900 text-white px-4 py-2 text-xs uppercase tracking-widest hover:bg-stone-800"
                >
                  Generate Slots
                </button>
              )}
            </div>
            
            {slots.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {slots.map(slot => {
                  const isAvailable = slot.status === 'AVAILABLE';
                  const isUnavailable = slot.status === 'UNAVAILABLE';
                  const isBooked = slot.status === 'BOOKED' || slot.status === 'PENDING';
                  
                  return (
                  <button
                    key={slot.id}
                    onClick={() => handleToggleSlot(slot.id, slot.status)}
                    className={clsx(
                      "py-4 border text-sm uppercase tracking-widest transition-all duration-300 flex flex-col items-center gap-2",
                      isAvailable && "border-green-200 bg-green-50 text-green-800 hover:bg-green-100",
                      isUnavailable && "border-yellow-200 bg-yellow-50 text-yellow-800 hover:bg-yellow-100",
                      isBooked && "border-red-200 bg-red-50 text-red-800 cursor-not-allowed"
                    )}
                  >
                    <span>{slot.time}</span>
                    <span className="text-[10px]">
                      {isAvailable ? 'Available' : isUnavailable ? 'Unavailable' : 'Booked/Pending'}
                    </span>
                  </button>
                )})}
              </div>
            ) : (
              <div className="text-center py-12 text-stone-500 text-sm uppercase tracking-widest border border-dashed border-stone-300">
                No slots generated for this date.
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

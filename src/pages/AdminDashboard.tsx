import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO, addDays, startOfToday } from 'date-fns';
import { clsx } from 'clsx';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';

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
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [activeTab, setActiveTab] = useState<'bookings' | 'slots'>('bookings');
  
  const [stylists, setStylists] = useState<Stylist[]>([]);
  const [selectedStylist, setSelectedStylist] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<Date>(startOfToday());
  const [slots, setSlots] = useState<Slot[]>([]);
  
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Reschedule Modal State
  const [rescheduleBooking, setRescheduleBooking] = useState<Booking | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<Date>(startOfToday());
  const [rescheduleSlots, setRescheduleSlots] = useState<Slot[]>([]);
  const [selectedRescheduleSlot, setSelectedRescheduleSlot] = useState<string>('');

  const navigate = useNavigate();
  const token = localStorage.getItem('adminToken');

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

  useEffect(() => {
    if (rescheduleBooking && rescheduleDate) {
      const dateStr = format(rescheduleDate, 'yyyy-MM-dd');
      fetch(`/api/slots?stylist_id=${rescheduleBooking.stylist.id}&date=${dateStr}`)
        .then(res => res.json())
        .then(setRescheduleSlots);
    }
  }, [rescheduleBooking, rescheduleDate]);

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
    if (currentStatus === 'BOOKED' || currentStatus === 'PENDING') {
      toast.error('Cannot change status of a booked or pending slot');
      return;
    }
    const newStatus = currentStatus === 'AVAILABLE' ? 'UNAVAILABLE' : 'AVAILABLE';
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

  const handleReschedule = async () => {
    if (!rescheduleBooking || !selectedRescheduleSlot) return;
    try {
      const res = await fetch(`/api/admin/bookings/${rescheduleBooking.id}/reschedule`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ new_slot_id: selectedRescheduleSlot })
      });
      if (res.ok) {
        toast.success('Reschedule proposed to customer');
        setRescheduleBooking(null);
        setSelectedRescheduleSlot('');
        fetchBookings();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to propose reschedule');
      }
    } catch (err) {
      toast.error('An error occurred');
    }
  };

  const dates = Array.from({ length: 14 }).map((_, i) => addDays(startOfToday(), i));

  const pendingBookings = bookings.filter(b => b.status === 'PENDING');
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
      draggable={booking.status === 'PENDING'}
      onDragStart={(e) => onDragStart(e, booking.id)}
      className={clsx(
        "bg-white border p-4 shadow-sm mb-4",
        booking.status === 'PENDING' ? "cursor-grab active:cursor-grabbing border-stone-200 hover:border-stone-400" : "border-stone-200"
      )}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="font-medium text-stone-900">{booking.student.name}</div>
        <div className="text-xs uppercase tracking-widest text-stone-500">{booking.status}</div>
      </div>
      <div className="text-sm text-stone-600 mb-2">
        {format(parseISO(booking.slot.date), 'MMM d, yyyy')} at {booking.slot.time}
      </div>
      <div className="text-xs text-stone-500 mb-4">
        Stylist: {booking.stylist.name} <br/>
        Services: {booking.services.map(s => s.name).join(', ')}
      </div>
      
      {booking.status === 'PENDING' && (
        <div className="flex gap-2 mt-4">
          <button 
            onClick={() => handleStatusChange(booking.id, 'CONFIRMED')}
            className="flex-1 bg-stone-900 text-white py-2 text-xs uppercase tracking-widest hover:bg-stone-800"
          >
            Accept
          </button>
          <button 
            onClick={() => handleStatusChange(booking.id, 'REJECTED')}
            className="flex-1 bg-white border border-stone-200 text-stone-900 py-2 text-xs uppercase tracking-widest hover:bg-stone-50"
          >
            Reject
          </button>
        </div>
      )}

      {(booking.status === 'CONFIRMED' || booking.status === 'PENDING') && (
        <div className="flex gap-2 mt-2">
          <button 
            onClick={() => setRescheduleBooking(booking)}
            className="flex-1 bg-stone-100 text-stone-600 py-2 text-xs uppercase tracking-widest hover:bg-stone-200"
          >
            Reschedule
          </button>
          {booking.status === 'CONFIRMED' && (
            <button 
              onClick={() => {
                if (confirm('Are you sure you want to cancel this booking?')) {
                  handleStatusChange(booking.id, 'CANCELLED');
                }
              }}
              className="flex-1 bg-red-50 text-red-600 py-2 text-xs uppercase tracking-widest hover:bg-red-100"
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
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
          {activeTab === 'bookings' && (
            <button 
              onClick={fetchBookings}
              disabled={isRefreshing}
              className="px-6 py-3 text-sm uppercase tracking-widest bg-white border border-stone-200 text-stone-600 hover:bg-stone-50 disabled:opacity-50"
            >
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          )}
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
              <BookingCard key={booking.id} booking={booking} />
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
              <BookingCard key={booking.id} booking={booking} />
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

      {/* Reschedule Modal */}
      <AnimatePresence>
        {rescheduleBooking && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-2xl shadow-xl overflow-hidden"
            >
              <div className="p-6 border-b border-stone-200 flex justify-between items-center">
                <h2 className="text-2xl font-serif text-stone-900">Reschedule Appointment</h2>
                <button onClick={() => setRescheduleBooking(null)} className="text-stone-400 hover:text-stone-900">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="p-6">
                <p className="text-sm text-stone-600 mb-6">
                  Proposing a new time for <strong>{rescheduleBooking.student.name}</strong> with <strong>{rescheduleBooking.stylist.name}</strong>.
                </p>

                <h3 className="text-xs uppercase tracking-widest text-stone-500 mb-4">Select New Date</h3>
                <div className="flex overflow-x-auto pb-4 gap-4 snap-x mb-6">
                  {dates.map((date, i) => (
                    <div 
                      key={i}
                      onClick={() => { setRescheduleDate(date); setSelectedRescheduleSlot(''); }}
                      className={clsx(
                        "flex-shrink-0 w-20 p-3 border text-center cursor-pointer transition-all duration-300 snap-start",
                        format(rescheduleDate, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
                          ? "border-stone-900 bg-stone-900 text-white" 
                          : "border-stone-200 bg-white hover:border-stone-400 text-stone-900"
                      )}
                    >
                      <p className="text-[10px] uppercase tracking-widest mb-1">{format(date, 'EEE')}</p>
                      <p className="font-serif text-xl">{format(date, 'd')}</p>
                    </div>
                  ))}
                </div>

                <h3 className="text-xs uppercase tracking-widest text-stone-500 mb-4">Select New Time</h3>
                <div className="grid grid-cols-3 md:grid-cols-4 gap-3 mb-8">
                  {rescheduleSlots.length > 0 ? rescheduleSlots.map(slot => (
                    <button
                      key={slot.id}
                      disabled={slot.status !== 'AVAILABLE'}
                      onClick={() => setSelectedRescheduleSlot(slot.id)}
                      className={clsx(
                        "py-2 border text-sm uppercase tracking-widest transition-all duration-300",
                        slot.status !== 'AVAILABLE'
                          ? "bg-stone-100 text-stone-400 border-stone-100 cursor-not-allowed line-through" 
                          : selectedRescheduleSlot === slot.id
                            ? "border-stone-900 bg-stone-900 text-white"
                            : "border-stone-200 bg-white hover:border-stone-400 text-stone-900 cursor-pointer"
                      )}
                    >
                      {slot.time}
                    </button>
                  )) : (
                    <div className="col-span-full text-center py-4 text-stone-500 text-xs uppercase tracking-widest">
                      No slots available
                    </div>
                  )}
                </div>

                <div className="flex gap-4">
                  <button 
                    onClick={() => setRescheduleBooking(null)}
                    className="flex-1 px-6 py-3 text-sm uppercase tracking-widest bg-white border border-stone-200 text-stone-600 hover:bg-stone-50"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleReschedule}
                    disabled={!selectedRescheduleSlot}
                    className="flex-1 px-6 py-3 text-sm uppercase tracking-widest bg-stone-900 text-white hover:bg-stone-800 disabled:bg-stone-300 disabled:cursor-not-allowed"
                  >
                    Propose New Time
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

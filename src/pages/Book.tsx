import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { format, addDays, startOfToday } from 'date-fns';
import { clsx } from 'clsx';

interface Service { id: string; name: string; price: number; duration_minutes: number; }
interface Stylist { id: string; name: string; role: string; }
interface Slot { id: string; date: string; time: string; status: string; }

export default function Book() {
  const [services, setServices] = useState<Service[]>([]);
  const [stylists, setStylists] = useState<Stylist[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [selectedStylist, setSelectedStylist] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<Date>(startOfToday());
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  
  const navigate = useNavigate();
  const location = useLocation();
  const rescheduleState = location.state as { rescheduleBookingId?: string, currentStylist?: string, currentServices?: string[], oldSlotId?: string } | null;
  const isRescheduling = !!rescheduleState?.rescheduleBookingId;
  
  const isLoggedIn = !!localStorage.getItem('token');

  useEffect(() => {
    if (!isLoggedIn) {
      toast.error('Please login to book an appointment');
      navigate('/login');
      return;
    }
    fetch('/api/services').then(res => res.json()).then(services => {
      setServices(services);
      if (rescheduleState?.currentServices) {
        setSelectedServices(rescheduleState.currentServices);
      }
    });
    fetch('/api/stylists').then(res => res.json()).then(stylists => {
      setStylists(stylists);
      if (rescheduleState?.currentStylist) {
        setSelectedStylist(rescheduleState.currentStylist);
      }
    });
  }, [isLoggedIn, navigate]);

  useEffect(() => {
    setSelectedSlot('');
    if (selectedStylist && selectedDate) {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      fetch(`/api/slots?stylist_id=${selectedStylist}&date=${dateStr}`)
        .then(res => res.json())
        .then(setSlots);
    }
  }, [selectedStylist, selectedDate]);

  const handleBook = async () => {
    if (selectedServices.length === 0 || !selectedStylist || !selectedSlot) {
      toast.error('Please select all options');
      return;
    }

    try {
      const url = isRescheduling 
        ? `/api/student/bookings/${rescheduleState.rescheduleBookingId}/reschedule`
        : '/api/book';
        
      const res = await fetch(url, {
        method: isRescheduling ? 'PUT' : 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(isRescheduling ? {
          new_slot_id: selectedSlot
        } : {
          service_ids: selectedServices,
          stylist_id: selectedStylist,
          slot_id: selectedSlot
        })
      });

      if (res.ok) {
        toast.success(isRescheduling ? 'Appointment rescheduled successfully!' : 'Appointment booked successfully!');
        navigate('/dashboard');
      } else {
        const data = await res.json();
        toast.error(data.error || 'Booking failed');
      }
    } catch (err) {
      toast.error('An error occurred');
    }
  };

  const dates = Array.from({ length: 7 }).map((_, i) => addDays(startOfToday(), i));

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-16"
      >
        <h1 className="text-4xl md:text-5xl font-serif text-stone-900 mb-6">{isRescheduling ? "Reschedule Appointment" : "Book Appointment"}</h1>
        <div className="w-12 h-[1px] bg-stone-900 mx-auto"></div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        {/* Selection Column */}
        <div className="lg:col-span-2 space-y-12">
          
          {/* Service Selection */}
          <section>
            <div className="flex justify-between items-end mb-6">
              <h2 className="text-sm uppercase tracking-widest text-stone-500">1. Select Services</h2>
              <p className="text-[10px] uppercase tracking-widest text-stone-400">Multiple choice</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {services.map(service => {
                const isSelected = selectedServices.includes(service.id);
                return (
                  <div 
                    key={service.id}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedServices(selectedServices.filter(id => id !== service.id));
                      } else {
                        setSelectedServices([...selectedServices, service.id]);
                      }
                    }}
                    className={clsx(
                      "relative p-6 border cursor-pointer transition-all duration-200 flex flex-col justify-between min-h-[140px]",
                      isSelected 
                        ? "border-stone-900 bg-stone-50 ring-1 ring-stone-900" 
                        : "border-stone-200 bg-white hover:border-stone-400 shadow-sm hover:shadow-md"
                    )}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className={clsx(
                        "w-6 h-6 border rounded-sm flex items-center justify-center transition-colors",
                        isSelected ? "bg-stone-900 border-stone-900" : "border-stone-300 bg-white"
                      )}>
                        {isSelected && (
                          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div className="text-xl font-serif text-stone-900">₹{service.price}</div>
                    </div>
                    <div>
                      <h3 className="font-serif text-xl text-stone-900 mb-1">{service.name}</h3>
                      <p className="text-xs text-stone-500 uppercase tracking-widest">{service.duration_minutes} mins</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Stylist Selection */}
          <section>
            <h2 className="text-sm uppercase tracking-widest text-stone-500 mb-6">2. Select Stylist</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {stylists.map(stylist => (
                <div 
                  key={stylist.id}
                  onClick={() => { setSelectedStylist(stylist.id); setSelectedSlot(''); }}
                  className={clsx(
                    "p-6 border text-center cursor-pointer transition-all duration-300",
                    selectedStylist === stylist.id 
                      ? "border-stone-900 bg-stone-900 text-white" 
                      : "border-stone-200 bg-white hover:border-stone-400 text-stone-900"
                  )}
                >
                  <h3 className="font-serif text-lg mb-1">{stylist.name}</h3>
                  <p className={clsx("text-xs uppercase tracking-widest", selectedStylist === stylist.id ? "text-stone-300" : "text-stone-500")}>
                    {stylist.role}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Date & Time Selection */}
          {selectedStylist && (
            <section>
              <h2 className="text-sm uppercase tracking-widest text-stone-500 mb-6">3. Select Date & Time</h2>
              
              {/* Date Picker */}
              <div className="flex overflow-x-auto pb-4 gap-4 mb-8 snap-x">
                {dates.map((date, i) => (
                  <div 
                    key={i}
                    onClick={() => { setSelectedDate(date); setSelectedSlot(''); }}
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

              {/* Time Slots */}
              <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
                {slots.length > 0 ? slots.map(slot => {
                  const isOldSlot = rescheduleState?.oldSlotId === slot.id;
                  const isAvailable = slot.status === 'AVAILABLE' && !isOldSlot;
                  const isUnavailable = slot.status === 'UNAVAILABLE' || isOldSlot;
                  const isBooked = slot.status === 'BOOKED' || slot.status === 'PENDING' || slot.status === 'RESCHEDULE_PENDING';

                  return (
                  <button
                    key={slot.id}
                    disabled={!isAvailable}
                    onClick={() => setSelectedSlot(slot.id)}
                    className={clsx(
                      "py-3 border text-sm uppercase tracking-widest transition-all duration-300",
                      isUnavailable && "bg-yellow-50 text-yellow-800 border-yellow-200 cursor-not-allowed",
                      isBooked && "bg-red-50 text-red-800 border-red-200 cursor-not-allowed",
                      isAvailable && selectedSlot === slot.id && "border-green-800 bg-green-800 text-white",
                      isAvailable && selectedSlot !== slot.id && "border-green-200 bg-green-50 hover:bg-green-100 text-green-900 cursor-pointer"
                    )}
                  >
                    {slot.time}
                  </button>
                )}) : (
                  <div className="col-span-full text-center py-8 text-stone-500 text-sm uppercase tracking-widest">
                    No slots available for this date
                  </div>
                )}
              </div>
            </section>
          )}
        </div>

        {/* Summary Column */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-stone-200 p-8 sticky top-28">
            <h2 className="text-2xl font-serif text-stone-900 mb-8">Summary</h2>
            
            <div className="space-y-6 mb-12">
              <div>
                <p className="text-xs uppercase tracking-widest text-stone-500 mb-1">Services</p>
                <p className="font-serif text-lg">
                  {selectedServices.length > 0 
                    ? selectedServices.map(id => services.find(s => s.id === id)?.name).join(', ') 
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-stone-500 mb-1">Stylist</p>
                <p className="font-serif text-lg">
                  {selectedStylist ? stylists.find(s => s.id === selectedStylist)?.name : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-stone-500 mb-1">Date & Time</p>
                <p className="font-serif text-lg">
                  {selectedSlot ? (
                    `${format(selectedDate, 'MMM d, yyyy')} at ${slots.find(s => s.id === selectedSlot)?.time}`
                  ) : '—'}
                </p>
              </div>
              <div className="pt-6 border-t border-stone-200">
                <div className="flex justify-between items-center">
                  <p className="text-xs uppercase tracking-widest text-stone-500">Total</p>
                  <p className="font-serif text-2xl">
                    ₹{selectedServices.reduce((total, id) => {
                      const service = services.find(s => s.id === id);
                      return total + (service?.price || 0);
                    }, 0)}
                  </p>
                </div>
              </div>
            </div>

            <button 
              onClick={handleBook}
              disabled={selectedServices.length === 0 || !selectedStylist || !selectedSlot}
              className="w-full bg-stone-900 text-white py-4 text-sm uppercase tracking-widest hover:bg-stone-800 transition-colors disabled:bg-stone-300 disabled:cursor-not-allowed"
            >
              {isRescheduling ? "Confirm Reschedule" : "Request Booking"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

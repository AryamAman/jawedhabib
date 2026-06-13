import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { AnimatePresence, motion } from 'framer-motion';
import { addDays, format, startOfToday } from 'date-fns';
import { clsx } from 'clsx';
import { Check } from 'lucide-react';
import ScheduleLegend from '../components/ScheduleLegend';
import {
  DisplaySlotStatus,
  ScheduleResponse,
  ScheduleSlot,
  SLOT_INTERVAL_MINUTES,
  addMinutes,
  formatTimeRange,
  getBookingOccupancyRanges,
  getDisplayStatusAtTime,
  getSelectableStartTimes,
  getStatusClasses,
  timeToMinutes,
} from '../lib/scheduling';

interface Service {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
  gender?: string | null;
  category?: string | null;
}

interface Stylist {
  id: string;
  name: string;
  role: string;
}

interface AuthUser {
  id: string;
  profileCompleted: boolean;
}

type RescheduleState = {
  rescheduleBookingId?: string;
  currentStylist?: string;
  currentServices?: string[];
  oldSlotId?: string;
  oldDate?: string;
  oldTime?: string;
};

const CELL_WIDTH = 10;
const BOOKING_BLOCK_TOP = 18;
const BOOKING_BLOCK_HEIGHT = 34;
const SELECTION_BLOCK_TOP = 72;
const SELECTION_BLOCK_HEIGHT = 26;

const spring = { type: 'spring', stiffness: 280, damping: 26, mass: 0.8 } as const;

const STEPS = [
  { id: 1, label: 'Services' },
  { id: 2, label: 'Stylist' },
  { id: 3, label: 'Day & Time' },
] as const;

export default function Book() {
  const [services, setServices] = useState<Service[]>([]);
  const [stylists, setStylists] = useState<Stylist[]>([]);
  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [selectedStylist, setSelectedStylist] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<Date>(startOfToday());
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [focusedSlotId, setFocusedSlotId] = useState<string>('');
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [draggingSelection, setDraggingSelection] = useState(false);
  const [hoveredTime, setHoveredTime] = useState<{ time: string; left: number } | null>(null);

  const navigate = useNavigate();
  const location = useLocation();
  const rescheduleState = (location.state as RescheduleState | null) ?? null;
  const isRescheduling = Boolean(rescheduleState?.rescheduleBookingId);
  const [authReady, setAuthReady] = useState(false);
  const [selectedGender, setSelectedGender] = useState('Men');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['Hair Care'])
  );
  const [step, setStep] = useState(isRescheduling ? 3 : 1);
  const [submitting, setSubmitting] = useState(false);

  const bookingDuration = selectedServices.reduce((total, id) => {
    const service = services.find((candidate) => candidate.id === id);
    return total + (service?.duration_minutes ?? 0);
  }, 0);

  const totalPrice = selectedServices.reduce((total, id) => {
    const service = services.find((candidate) => candidate.id === id);
    return total + (service?.price ?? 0);
  }, 0);

  const dates = useMemo(() => Array.from({ length: 7 }).map((_, index) => addDays(startOfToday(), index)), []);

  useEffect(() => {
    fetch('/api/auth/me', {
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error('Unauthorized');
        }

        return res.json();
      })
      .then((data: { user: AuthUser }) => {
        if (!data.user.profileCompleted) {
          toast.error('Complete your profile before booking');
          navigate('/profile');
          return;
        }

        return Promise.all([
          fetch('/api/services').then(async (res) => {
            if (!res.ok) {
              throw new Error('Unable to load services');
            }

            return res.json();
          }),
          fetch('/api/stylists').then(async (res) => {
            if (!res.ok) {
              throw new Error('Unable to load stylists');
            }

            return res.json();
          }),
        ]);
      })
      .then((data) => {
        if (!data) {
          return;
        }

        const [servicesData, stylistsData] = data;
        setServices(servicesData);
        setStylists(stylistsData);

        if (rescheduleState?.currentServices?.length) {
          setSelectedServices(rescheduleState.currentServices);
        }

        if (rescheduleState?.currentStylist) {
          setSelectedStylist(rescheduleState.currentStylist);
        } else if (stylistsData[0]?.id) {
          setSelectedStylist(stylistsData[0].id);
        }

        if (rescheduleState?.oldDate) {
          setSelectedDate(new Date(`${rescheduleState.oldDate}T00:00:00`));
        }

        setAuthReady(true);
      })
      .catch((error) => {
        if (error instanceof Error && error.message === 'Unauthorized') {
          toast.error('Please login to continue');
          navigate('/login');
          return;
        }

        toast.error(error instanceof Error ? error.message : 'Unable to load booking details');
      });
  }, [navigate, rescheduleState]);

  useEffect(() => {
    if (!authReady || !selectedStylist) {
      return;
    }

    const dateString = format(selectedDate, 'yyyy-MM-dd');
    setLoadingSchedule(true);

    fetch(`/api/slots?stylist_id=${selectedStylist}&date=${dateString}`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error('Failed to load timeline');
        }
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error('Timeline API is not ready yet. Restart the backend and refresh.');
        }
        return res.json();
      })
      .then((data: ScheduleResponse) => {
        setSchedule(data);
        setFocusedSlotId((current) => current || data.slots[0]?.id || '');
      })
      .catch(() => {
        toast.error('Unable to load the day timeline');
      })
      .finally(() => setLoadingSchedule(false));
  }, [authReady, selectedStylist, selectedDate]);

  // Memoized so hovering/clicking the timeline (which churns local state every
  // mousemove) does not re-run this O(slots × bookings) sweep on each render.
  const selectableStartTimes = useMemo(() => (
    schedule && bookingDuration > 0
      ? getSelectableStartTimes({
          slots: schedule.slots,
          bookings: schedule.bookings,
          durationMinutes: bookingDuration,
          dayEnd: schedule.meta.dayEnd,
          stepMinutes: schedule.meta.stepMinutes,
          excludeBookingId: rescheduleState?.rescheduleBookingId,
        })
      : new Set<string>()
  ), [schedule, bookingDuration, rescheduleState?.rescheduleBookingId]);

  // Precompute each slot's base display status once per schedule change instead
  // of flat-mapping every booking for every cell on every render.
  const slotDisplayStatus = useMemo(() => {
    const slots = schedule?.slots ?? [];
    const bookings = schedule?.bookings ?? [];
    const map = new Map<string, DisplaySlotStatus>();
    for (const slot of slots) {
      map.set(slot.time, getDisplayStatusAtTime(slot.time, slots, bookings));
    }
    return map;
  }, [schedule]);

  useEffect(() => {
    if (!schedule) {
      return;
    }

    if (selectedSlot) {
      const selectedSlotData = schedule.slots.find((slot) => slot.id === selectedSlot);
      if (!selectedSlotData || !selectableStartTimes.has(selectedSlotData.time)) {
        setSelectedSlot('');
      }
    }
  }, [schedule, selectedSlot, selectableStartTimes]);

  const handleBook = async () => {
    if (submitting) {
      return;
    }

    if (selectedServices.length === 0 || !selectedStylist || !selectedSlot) {
      toast.error('Please select your services, stylist, and time');
      return;
    }

    setSubmitting(true);

    try {
      const url = isRescheduling
        ? `/api/student/bookings/${rescheduleState?.rescheduleBookingId}/reschedule`
        : '/api/book';

      const res = await fetch(url, {
        method: isRescheduling ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify(isRescheduling ? {
          new_slot_id: selectedSlot,
        } : {
          service_ids: selectedServices,
          stylist_id: selectedStylist,
          slot_id: selectedSlot,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Booking failed');
      }

      toast.success(isRescheduling ? 'Appointment rescheduled successfully' : 'Appointment booked successfully');
      navigate('/dashboard');
    } catch (error: any) {
      toast.error(error.message || 'An unexpected error occurred');
      setSubmitting(false);
    }
  };

  const timelineSlots = schedule?.slots ?? [];
  const timelineBookings = schedule?.bookings ?? [];
  const selectedSlotData = timelineSlots.find((slot) => slot.id === selectedSlot);
  const focusedSlot = timelineSlots.find((slot) => slot.id === focusedSlotId) ?? null;
  const timelineWidth = timelineSlots.length * CELL_WIDTH;
  const startMinute = schedule ? timeToMinutes(schedule.meta.dayStart) : 0;

  const selectedRangeLabel = selectedSlotData
    ? formatTimeRange(selectedSlotData.time, addMinutes(selectedSlotData.time, bookingDuration))
    : '';

  const getTimelineLeft = (time: string) => {
    if (!schedule) {
      return 0;
    }

    return ((timeToMinutes(time) - startMinute) / schedule.meta.stepMinutes) * CELL_WIDTH;
  };

  const getHoverTimeFromClientX = (clientX: number, boundsLeft: number) => {
    if (!timelineSlots.length) {
      return null;
    }

    const relativeX = Math.min(Math.max(clientX - boundsLeft - 8, 0), Math.max(timelineWidth - 1, 0));
    const slotIndex = Math.min(Math.floor(relativeX / CELL_WIDTH), timelineSlots.length - 1);
    const slot = timelineSlots[slotIndex];

    if (!slot) {
      return null;
    }

    return {
      time: slot.time,
      left: slotIndex * CELL_WIDTH,
    };
  };

  const getStudentSlotStatus = (slot: ScheduleSlot): DisplaySlotStatus => {
    const baseStatus = slotDisplayStatus.get(slot.time)
      ?? getDisplayStatusAtTime(slot.time, timelineSlots, timelineBookings);

    if (baseStatus !== 'AVAILABLE') {
      return baseStatus;
    }

    if (bookingDuration > 0 && !selectableStartTimes.has(slot.time)) {
      return 'UNAVAILABLE';
    }

    return 'AVAILABLE';
  };

  const getTrackCellClasses = (status: DisplaySlotStatus, isSelectable: boolean) => {
    if (status === 'BOOKED') {
      return 'timeline-cell--booked';
    }

    if (status === 'UNAVAILABLE') {
      return 'timeline-cell--unavailable';
    }

    if (status === 'RESCHEDULED') {
      return 'timeline-cell--rescheduled';
    }

    return isSelectable || bookingDuration === 0 ? 'timeline-cell--available timeline-cell--interactive' : 'timeline-cell--available-muted';
  };

  const handleSelectSlot = (slot: ScheduleSlot) => {
    setFocusedSlotId(slot.id);

    if (bookingDuration <= 0) {
      return;
    }

    if (selectableStartTimes.has(slot.time)) {
      setSelectedSlot(slot.id);
    }
  };

  const hourLabels = schedule
    ? Array.from({ length: Math.floor((timeToMinutes(schedule.meta.dayEnd) - startMinute) / 60) + 1 }).map((_, index) => {
        const time = addMinutes(schedule.meta.dayStart, index * 60);
        return { time, left: getTimelineLeft(time) };
      })
    : [];

  const canReachStep = (target: number) => {
    if (isRescheduling) {
      return true;
    }
    if (target <= 1) {
      return true;
    }
    if (target === 2) {
      return selectedServices.length > 0;
    }
    return selectedServices.length > 0 && Boolean(selectedStylist);
  };

  const goToStep = (target: number) => {
    if (canReachStep(target)) {
      setStep(target);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const isBookable = selectedServices.length > 0 && Boolean(selectedStylist) && Boolean(selectedSlot);

  return (
    <div className="page-shell section-light-alt min-h-[calc(100vh-8rem)]">
      <div className="mx-auto w-full max-w-6xl px-4 pb-32 pt-28 sm:px-6 lg:px-8 lg:pb-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
          className="mb-12 text-center"
        >
          <p className="section-kicker mb-4 text-xs">
            {isRescheduling ? 'Pick a new time that suits you' : 'Reserve your chair in three steps'}
          </p>
          <h1 className="section-heading mb-6 font-serif text-4xl md:text-5xl">
            {isRescheduling ? 'Reschedule Appointment' : 'Book an Appointment'}
          </h1>
          <div className="editorial-divider" />
        </motion.div>

        {/* Step rail */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.06 }}
          className="mb-12 flex justify-center"
        >
          <nav className="step-rail flex-wrap justify-center" aria-label="Booking steps">
            {STEPS.map((s, index) => {
              const isDone = step > s.id || (s.id === 1 && selectedServices.length > 0 && step !== 1);
              const isActive = step === s.id;
              return (
                <span key={s.id} className="flex items-center gap-2">
                  {index > 0 && <span className={clsx('step-connector', step > index && 'step-connector--done')} aria-hidden="true" />}
                  <button
                    type="button"
                    onClick={() => goToStep(s.id)}
                    disabled={!canReachStep(s.id)}
                    aria-current={isActive ? 'step' : undefined}
                    className={clsx(
                      'step-pill',
                      isActive && 'step-pill--active',
                      !isActive && isDone && 'step-pill--done',
                    )}
                  >
                    <span className="step-pill__num">
                      {!isActive && isDone ? <Check className="h-3.5 w-3.5" strokeWidth={2.2} /> : s.id}
                    </span>
                    {s.label}
                  </button>
                </span>
              );
            })}
          </nav>
        </motion.div>

        <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1.5fr)_340px] xl:grid-cols-[minmax(0,1.5fr)_360px]">
          <div className="min-w-0">
            <AnimatePresence mode="wait">
              {/* ---- Step 1: Services ---- */}
              {step === 1 && (
                <motion.section
                  key="step-services"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
                >
                  <div className="mb-6 flex items-end justify-between">
                    <h2 className="font-serif text-2xl text-[color:var(--text-dark)]">Choose your services</h2>
                    <p className="hidden text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-secondary)] sm:block">
                      Select one or more
                    </p>
                  </div>

                  {/* Gender tabs */}
                  <div className="mb-6 flex flex-wrap gap-2">
                    {(['Men', 'Women', 'Unisex', 'Beauty'] as const).map((gender) => (
                      <button
                        key={gender}
                        type="button"
                        onClick={() => {
                          setSelectedGender(gender);
                          setExpandedCategories(new Set(['Hair Care', 'Threading', 'Hydra Facial']));
                        }}
                        className={clsx('catalog-tab', selectedGender === gender && 'catalog-tab--active')}
                      >
                        {gender}
                      </button>
                    ))}
                  </div>

                  {/* Category accordion */}
                  {Array.from(
                    new Set(
                      services
                        .filter((s) => s.gender === selectedGender)
                        .map((s) => s.category ?? 'Other')
                    )
                  ).map((cat) => {
                    const catServices = services.filter(
                      (s) => s.gender === selectedGender && (s.category ?? 'Other') === cat
                    );
                    const isExpanded = expandedCategories.has(cat);
                    const selectedInCategory = catServices.filter((s) => selectedServices.includes(s.id)).length;

                    return (
                      <div key={cat} className="mb-4">
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedCategories((prev) => {
                              const next = new Set(prev);
                              if (next.has(cat)) next.delete(cat);
                              else next.add(cat);
                              return next;
                            });
                          }}
                          aria-expanded={isExpanded}
                          className="surface-card mb-3 flex w-full items-center justify-between px-5 py-4 text-left"
                        >
                          <span className="flex items-center gap-3">
                            <span className="font-serif text-lg text-[color:var(--text-dark)]">{cat}</span>
                            {selectedInCategory > 0 && (
                              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-[color:var(--accent-gold-border)] bg-[color:var(--accent-gold-dim)] px-2 text-[11px] text-[color:var(--accent-gold)]">
                                {selectedInCategory}
                              </span>
                            )}
                          </span>
                          <span className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-secondary)]">
                            {isExpanded ? 'Hide' : `${catServices.length} services`}
                          </span>
                        </button>

                        {isExpanded && (
                          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            {catServices.map((service) => {
                              const isSelected = selectedServices.includes(service.id);
                              return (
                                <button
                                  key={service.id}
                                  type="button"
                                  aria-pressed={isSelected}
                                  onClick={() => {
                                    if (isSelected) {
                                      setSelectedServices(selectedServices.filter((id) => id !== service.id));
                                    } else {
                                      setSelectedServices([...selectedServices, service.id]);
                                    }
                                  }}
                                  className={clsx(
                                    'booking-choice-card surface-card surface-card-hover flex min-h-[110px] flex-col justify-between p-5 text-left transition-all duration-200',
                                    isSelected ? 'booking-choice-card--selected' : 'text-[color:var(--text-dark)]',
                                  )}
                                >
                                  <div className="flex items-start justify-between gap-4">
                                    <div>
                                      <h3 className={clsx(
                                        'mb-1 font-serif text-lg leading-snug',
                                        isSelected && 'booking-choice-title--selected',
                                      )}>
                                        {service.name}
                                      </h3>
                                      <p className={clsx(
                                        'text-[11px] uppercase tracking-[0.22em]',
                                        isSelected ? 'booking-choice-meta--selected' : 'text-[color:var(--accent-gold)]',
                                      )}>
                                        {service.duration_minutes} mins
                                      </p>
                                    </div>
                                    <span className={clsx(
                                      'inline-flex h-8 min-w-8 items-center justify-center rounded-full border px-3 text-[12px] tracking-[0.04em]',
                                      isSelected ? 'booking-choice-chip--selected' : 'border-[color:var(--border-light)] text-[color:var(--text-muted-dark)]',
                                    )}>
                                      ₹{service.price}
                                    </span>
                                  </div>
                                  <span className={clsx(
                                    'inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] uppercase tracking-[0.2em]',
                                    isSelected ? 'booking-choice-pill--selected' : 'border-[color:var(--border-light)] text-[color:var(--text-secondary)]',
                                  )}>
                                    {isSelected && <Check className="h-3 w-3" strokeWidth={2.4} />}
                                    {isSelected ? 'Added' : 'Tap to add'}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <div className="surface-card mt-6 flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-[color:var(--text-dark)]">
                        {selectedServices.length > 0
                          ? `${selectedServices.length} service${selectedServices.length > 1 ? 's' : ''} · ${bookingDuration} mins · ₹${totalPrice}`
                          : 'No services selected yet'}
                      </span>
                      {selectedServices.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedServices([])}
                          className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-secondary)] hover:text-[color:var(--text-dark)]"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => goToStep(2)}
                      disabled={selectedServices.length === 0}
                      className="editorial-btn editorial-btn-dark px-8 py-3.5"
                    >
                      Continue
                    </button>
                  </div>
                </motion.section>
              )}

              {/* ---- Step 2: Stylist ---- */}
              {step === 2 && (
                <motion.section
                  key="step-stylist"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
                >
                  <div className="mb-6 flex items-end justify-between">
                    <h2 className="font-serif text-2xl text-[color:var(--text-dark)]">Choose your stylist</h2>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {stylists.map((stylist) => (
                      <button
                        key={stylist.id}
                        type="button"
                        aria-pressed={selectedStylist === stylist.id}
                        onClick={() => {
                          setSelectedStylist(stylist.id);
                          setSelectedSlot('');
                          setFocusedSlotId('');
                        }}
                        className={clsx(
                          'booking-choice-card surface-card surface-card-hover p-6 text-left transition-all duration-200',
                          selectedStylist === stylist.id
                            ? 'booking-choice-card--selected'
                            : 'text-[color:var(--text-dark)]',
                        )}
                      >
                        <h3 className={clsx(
                          'mb-2 font-serif text-2xl',
                          selectedStylist === stylist.id && 'booking-choice-title--selected',
                        )}
                        >
                          {stylist.name}
                        </h3>
                        <p className={clsx(
                          'text-xs uppercase tracking-[0.24em]',
                          selectedStylist === stylist.id ? 'booking-choice-meta--selected' : 'text-[color:var(--accent-gold)]',
                        )}
                        >
                          {stylist.role}
                        </p>
                      </button>
                    ))}
                  </div>

                  <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                    <button
                      type="button"
                      onClick={() => goToStep(1)}
                      className="editorial-btn editorial-btn-subtle px-8 py-3.5"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => goToStep(3)}
                      disabled={!selectedStylist}
                      className="editorial-btn editorial-btn-dark px-8 py-3.5"
                    >
                      Continue
                    </button>
                  </div>
                </motion.section>
              )}

              {/* ---- Step 3: Day & Time ---- */}
              {step === 3 && selectedStylist && (
                <motion.section
                  key="step-schedule"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
                  className="space-y-6"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <h2 className="mb-3 font-serif text-2xl text-[color:var(--text-dark)]">Choose a day and time</h2>
                      <p className="max-w-2xl text-sm leading-relaxed text-[color:var(--text-muted-dark)]">
                        Green start points fit your full appointment length.
                        {selectedSlotData ? ' You can drag the selected bar to another green start time.' : ''}
                      </p>
                    </div>
                    <div className="surface-card px-4 py-3 text-right">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-secondary)]">Service time</p>
                      <p className="font-serif text-2xl text-[color:var(--text-dark)]">{bookingDuration || '—'} {bookingDuration ? 'mins' : ''}</p>
                    </div>
                  </div>

                  <div className="max-w-full overflow-x-auto pb-3">
                    <div className="flex w-max snap-x gap-3 pr-2">
                      {dates.map((date) => (
                        <button
                          key={date.toISOString()}
                          type="button"
                          onClick={() => {
                            setSelectedDate(date);
                            setSelectedSlot('');
                          }}
                          className={clsx(
                            'surface-card min-w-[78px] flex-shrink-0 snap-start px-3 py-4 text-center transition-all duration-200 sm:min-w-[92px] sm:px-4',
                            format(selectedDate, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
                              ? 'booking-date-pill--selected'
                              : 'text-[color:var(--text-dark)]',
                          )}
                        >
                          <p className="booking-date-pill__meta mb-2 text-xs uppercase tracking-[0.24em]">{format(date, 'EEE')}</p>
                          <p className="font-serif text-3xl leading-none">{format(date, 'd')}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="surface-card p-6">
                    <div className="mb-6 flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <h3 className="section-heading font-serif text-2xl">Day Timeline</h3>
                        <p className="mt-1 text-sm text-[color:var(--text-muted-dark)]">
                          Tap any green point to reserve it. Hover the strip to read the exact time.
                        </p>
                      </div>
                      <div className="flex w-full flex-col items-start gap-3 lg:w-auto lg:items-end">
                        <div className="surface-card-muted px-4 py-3 text-left lg:text-right">
                          <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-secondary)]">Cursor time</p>
                          <p className="font-serif text-2xl text-[color:var(--text-dark)]">{hoveredTime?.time ?? '—'}</p>
                        </div>
                        <ScheduleLegend />
                      </div>
                    </div>

                    {loadingSchedule ? (
                      <div className="space-y-3" aria-busy="true" aria-label="Loading timeline">
                        <div className="skeleton h-7 w-2/3" />
                        <div className="skeleton h-[118px] w-full rounded-[28px]" />
                        <div className="skeleton h-24 w-full" />
                      </div>
                    ) : schedule ? (
                      <div className="min-w-0 space-y-5">
                        <div className="max-w-full overflow-x-auto pb-2">
                          <div className="min-w-max">
                            <div className="relative mb-3 h-7" style={{ width: timelineWidth + 16 }}>
                              {hourLabels.map((label) => (
                                <div
                                  key={label.time}
                                  className="absolute top-0"
                                  style={{ left: `${label.left + 8}px` }}
                                >
                                  <span className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-secondary)]">{label.time}</span>
                                </div>
                              ))}
                            </div>

                            <div
                              className="relative overflow-visible rounded-[28px] border border-[color:var(--border-light)] bg-[color:var(--surface-card-muted)] px-2 py-2 shadow-inner"
                              style={{ width: timelineWidth + 16, minHeight: 118 }}
                              onMouseMove={(event) => {
                                const nextHover = getHoverTimeFromClientX(event.clientX, event.currentTarget.getBoundingClientRect().left);
                                if (nextHover) {
                                  setHoveredTime(nextHover);
                                }
                              }}
                              onMouseLeave={() => setHoveredTime(null)}
                            >
                              {hoveredTime && (
                                <>
                                  <div
                                    className="timeline-tooltip pointer-events-none absolute -top-10 z-30 -translate-x-1/2 px-3 py-2 text-[11px] uppercase tracking-[0.22em] shadow-xl"
                                    style={{ left: `${hoveredTime.left + 8}px` }}
                                  >
                                    {hoveredTime.time}
                                  </div>
                                  <div
                                    className="timeline-cursor-line pointer-events-none absolute bottom-2 top-2 z-20 w-px"
                                    style={{ left: `${hoveredTime.left + 8}px` }}
                                  />
                                </>
                              )}

                              <div className="absolute inset-y-0 left-2 right-2 flex">
                                {timelineSlots.map((slot) => {
                                  const status = getStudentSlotStatus(slot);
                                  const isSelected = selectedSlot === slot.id;
                                  const isFocused = focusedSlotId === slot.id;
                                  const isSelectable = bookingDuration > 0 && selectableStartTimes.has(slot.time);

                                  return (
                                    <button
                                      key={slot.id}
                                      type="button"
                                      onClick={() => handleSelectSlot(slot)}
                                      onMouseEnter={() => setHoveredTime({ time: slot.time, left: getTimelineLeft(slot.time) })}
                                      onMouseMove={() => setHoveredTime({ time: slot.time, left: getTimelineLeft(slot.time) })}
                                      onDragOver={(event) => {
                                        if (draggingSelection && isSelectable) {
                                          event.preventDefault();
                                        }
                                      }}
                                      onDrop={(event) => {
                                        if (draggingSelection && isSelectable) {
                                          event.preventDefault();
                                          setSelectedSlot(slot.id);
                                          setFocusedSlotId(slot.id);
                                          setDraggingSelection(false);
                                        }
                                      }}
                                      className={clsx(
                                        'relative h-[118px] border-r border-white/20 transition-all duration-150 first:rounded-l-[22px] last:rounded-r-[22px]',
                                        getTrackCellClasses(status, isSelectable),
                                        isSelected && 'ring-2 ring-inset ring-[color:var(--accent-gold)]',
                                        isFocused && !isSelected && 'ring-2 ring-inset ring-[color:var(--accent-gold-border)]',
                                        !isSelectable && bookingDuration > 0 && status === 'AVAILABLE' && 'opacity-60',
                                      )}
                                      style={{ width: CELL_WIDTH }}
                                    >
                                      <span className="sr-only">{slot.time}</span>
                                    </button>
                                  );
                                })}
                              </div>

                              {timelineBookings.flatMap((booking) => (
                                getBookingOccupancyRanges(booking).map((range) => (
                                  <button
                                    key={`${booking.id}-${range.type}`}
                                    type="button"
                                    onClick={() => {
                                      const focusTarget = timelineSlots.find((slot) => slot.time === range.startTime);
                                      if (focusTarget) {
                                        setFocusedSlotId(focusTarget.id);
                                      }
                                    }}
                                    className={clsx(
                                      'absolute z-10 overflow-hidden border px-3 text-left shadow-sm',
                                      getStatusClasses(range.displayStatus),
                                    )}
                                    style={{
                                      left: `${getTimelineLeft(range.startTime) + 8}px`,
                                      top: BOOKING_BLOCK_TOP,
                                      width: `${((range.endMinutes - range.startMinutes) / SLOT_INTERVAL_MINUTES) * CELL_WIDTH}px`,
                                      height: BOOKING_BLOCK_HEIGHT,
                                    }}
                                  >
                                    <span className="block truncate text-[11px] uppercase tracking-[0.2em]">
                                      {range.displayStatus === 'RESCHEDULED' ? 'Rescheduled' : 'Booked'}
                                    </span>
                                    <span className="block truncate text-xs">{formatTimeRange(range.startTime, range.endTime)}</span>
                                  </button>
                                ))
                              ))}

                              {selectedSlotData && bookingDuration > 0 && (
                                <button
                                  type="button"
                                  draggable
                                  onDragStart={() => setDraggingSelection(true)}
                                  onDragEnd={() => setDraggingSelection(false)}
                                  className="timeline-selection-pill absolute z-20 px-3 text-left shadow-lg"
                                  style={{
                                    left: `${getTimelineLeft(selectedSlotData.time) + 8}px`,
                                    top: SELECTION_BLOCK_TOP,
                                    width: `${(bookingDuration / SLOT_INTERVAL_MINUTES) * CELL_WIDTH}px`,
                                    height: SELECTION_BLOCK_HEIGHT,
                                  }}
                                >
                                  <span className="block truncate text-[11px] uppercase tracking-[0.2em]">Selected</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
                          <div className="surface-card-muted min-w-0 p-5">
                            <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-secondary)]">Focused timeline segment</p>
                            {focusedSlot ? (
                              <>
                                <div className="mb-4 flex flex-wrap items-center gap-3">
                                  <span className="font-serif text-3xl text-[color:var(--text-dark)]">{focusedSlot.time}</span>
                                  <span className={clsx(
                                    '',
                                    getStatusClasses(getStudentSlotStatus(focusedSlot)),
                                  )}
                                  >
                                    {getStudentSlotStatus(focusedSlot) === 'BOOKED' && 'Already Booked'}
                                    {getStudentSlotStatus(focusedSlot) === 'AVAILABLE' && 'Available'}
                                    {getStudentSlotStatus(focusedSlot) === 'UNAVAILABLE' && 'Unavailable'}
                                    {getStudentSlotStatus(focusedSlot) === 'RESCHEDULED' && 'Rescheduled'}
                                  </span>
                                </div>
                                <p className="mb-5 text-sm leading-relaxed text-[color:var(--text-muted-dark)]">
                                  {bookingDuration <= 0
                                    ? 'Choose at least one service to unlock start times on the timeline.'
                                    : selectableStartTimes.has(focusedSlot.time)
                                      ? `This start point fits your full ${bookingDuration}-minute appointment.`
                                      : 'This point cannot fit your full appointment length right now.'}
                                </p>
                                <div className="flex flex-wrap gap-3">
                                  <button
                                    type="button"
                                    onClick={() => handleSelectSlot(focusedSlot)}
                                    disabled={bookingDuration <= 0 || !selectableStartTimes.has(focusedSlot.time)}
                                    className="editorial-btn editorial-btn-dark px-4 py-3 disabled:opacity-45"
                                  >
                                    {selectedSlot === focusedSlot.id ? 'Selected' : 'Use this time'}
                                  </button>
                                  {selectedSlot === focusedSlot.id && (
                                    <button
                                      type="button"
                                      onClick={() => setSelectedSlot('')}
                                      className="editorial-btn editorial-btn-subtle px-4 py-3"
                                    >
                                      Clear selection
                                    </button>
                                  )}
                                </div>
                              </>
                            ) : (
                              <p className="text-[color:var(--text-secondary)]">Tap any point on the timeline to inspect it.</p>
                            )}
                          </div>

                          <div className="surface-card min-w-0 p-5">
                            <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-secondary)]">Timeline tips</p>
                            <div className="space-y-3 text-sm text-[color:var(--text-muted-dark)]">
                              <p>Green starts are safe for the full appointment length you selected.</p>
                              <p>Drag the selected bar to another green start time to adjust quickly.</p>
                              <p>Red means already booked, pale neutral means unavailable, and purple marks rescheduled time.</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="empty-state">
                        Pick a stylist to load the day timeline
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                    <button
                      type="button"
                      onClick={() => goToStep(2)}
                      className="editorial-btn editorial-btn-subtle px-8 py-3.5"
                    >
                      Back
                    </button>
                  </div>
                </motion.section>
              )}
            </AnimatePresence>
          </div>

          <aside className="min-w-0 lg:sticky lg:top-28 lg:z-30 lg:h-fit lg:self-start">
            <div className="surface-card p-8 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
              <h2 className="section-heading mb-8 font-serif text-2xl">Your Appointment</h2>

              <div className="mb-10 space-y-6">
                <div>
                  <p className="section-kicker mb-2 text-[11px]">Services</p>
                  <p className="font-serif text-lg leading-snug text-[color:var(--text-dark)]">
                    {selectedServices.length > 0
                      ? selectedServices.map((id) => services.find((service) => service.id === id)?.name).join(', ')
                      : '—'}
                  </p>
                </div>

                <div>
                  <p className="section-kicker mb-2 text-[11px]">Stylist</p>
                  <p className="font-serif text-lg text-[color:var(--text-dark)]">
                    {selectedStylist ? stylists.find((stylist) => stylist.id === selectedStylist)?.name : '—'}
                  </p>
                </div>

                <div>
                  <p className="section-kicker mb-2 text-[11px]">Date</p>
                  <p className="font-serif text-lg text-[color:var(--text-dark)]">
                    {selectedStylist ? format(selectedDate, 'MMM d, yyyy') : '—'}
                  </p>
                </div>

                <div>
                  <p className="section-kicker mb-2 text-[11px]">Time Range</p>
                  <p className="font-serif text-lg text-[color:var(--text-dark)]">
                    {selectedSlotData && bookingDuration > 0 ? selectedRangeLabel : '—'}
                  </p>
                </div>

                <div>
                  <p className="section-kicker mb-2 text-[11px]">Total Duration</p>
                  <p className="font-serif text-lg text-[color:var(--text-dark)]">{bookingDuration ? `${bookingDuration} mins` : '—'}</p>
                </div>

                <div className="border-t border-[color:var(--border-light)] pt-6">
                  <div className="flex items-center justify-between">
                    <p className="section-kicker text-[11px]">Total</p>
                    <p className="font-serif text-3xl text-[color:var(--text-dark)]">₹{totalPrice}</p>
                  </div>
                </div>
              </div>

              {isRescheduling && rescheduleState?.oldDate && rescheduleState?.oldTime && (
                <div className="mb-6 rounded-[var(--radius-md)] border border-[color:var(--status-reschedule-border)] bg-[color:var(--status-reschedule-bg)] p-4">
                  <p className="mb-2 text-[11px] uppercase tracking-[0.22em] text-[color:var(--status-reschedule-text)]">Current booking</p>
                  <p className="text-sm text-[color:var(--text-dark)]">
                    {format(new Date(`${rescheduleState.oldDate}T00:00:00`), 'MMM d, yyyy')} at {rescheduleState.oldTime}
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={handleBook}
                disabled={!isBookable || submitting}
                className="editorial-btn editorial-btn-dark w-full py-4 disabled:opacity-45"
              >
                {submitting
                  ? (isRescheduling ? 'Rescheduling…' : 'Booking…')
                  : (isRescheduling ? 'Confirm Reschedule' : 'Request Booking')}
              </button>
              {!isBookable && (
                <p className="mt-4 text-center text-[11px] uppercase tracking-[0.2em] text-[color:var(--text-secondary)]">
                  {selectedServices.length === 0
                    ? 'Start by choosing your services'
                    : !selectedStylist
                      ? 'Choose a stylist to continue'
                      : 'Pick a start time on the timeline'}
                </p>
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* Mobile sticky confirm bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[color:var(--border-light)] bg-[color:var(--surface-elevated)]/95 px-4 py-3 backdrop-blur-md lg:hidden">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--text-secondary)]">
              {selectedServices.length > 0 ? `${selectedServices.length} service${selectedServices.length > 1 ? 's' : ''} · ${bookingDuration} mins` : 'No services selected'}
            </p>
            <p className="font-serif text-xl text-[color:var(--text-dark)]">₹{totalPrice}</p>
          </div>
          {step < 3 && !isBookable ? (
            <button
              type="button"
              onClick={() => goToStep(step + 1)}
              disabled={!canReachStep(step + 1)}
              className="editorial-btn editorial-btn-dark px-6 py-3"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              onClick={handleBook}
              disabled={!isBookable || submitting}
              className="editorial-btn editorial-btn-dark px-6 py-3"
            >
              {submitting ? 'Booking…' : (isRescheduling ? 'Confirm' : 'Request Booking')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

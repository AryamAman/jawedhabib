import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { addDays, format, startOfToday } from 'date-fns';
import { clsx } from 'clsx';
import ScheduleLegend from '../components/ScheduleLegend';
import {
  DisplaySlotStatus,
  ScheduleBooking,
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
  const isLoggedIn = Boolean(localStorage.getItem('token'));
  const [authReady, setAuthReady] = useState(false);

  const bookingDuration = selectedServices.reduce((total, id) => {
    const service = services.find((candidate) => candidate.id === id);
    return total + (service?.duration_minutes ?? 0);
  }, 0);

  const dates = Array.from({ length: 7 }).map((_, index) => addDays(startOfToday(), index));

  useEffect(() => {
    if (!isLoggedIn) {
      toast.error('Please login to book an appointment');
      navigate('/login');
      return;
    }

    const token = localStorage.getItem('token');

    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
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
          localStorage.removeItem('token');
          navigate('/login');
          return;
        }

        toast.error(error instanceof Error ? error.message : 'Unable to load booking details');
      });
  }, [isLoggedIn, navigate, rescheduleState]);

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
      .catch((error) => {
        console.error(error);
        toast.error('Unable to load the day timeline');
      })
      .finally(() => setLoadingSchedule(false));
  }, [authReady, selectedStylist, selectedDate]);

  const selectableStartTimes = schedule && bookingDuration > 0
    ? getSelectableStartTimes({
        slots: schedule.slots,
        bookings: schedule.bookings,
        durationMinutes: bookingDuration,
        dayEnd: schedule.meta.dayEnd,
        stepMinutes: schedule.meta.stepMinutes,
        excludeBookingId: rescheduleState?.rescheduleBookingId,
      })
    : new Set<string>();

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
    if (selectedServices.length === 0 || !selectedStylist || !selectedSlot) {
      toast.error('Please select your services, stylist, and time');
      return;
    }

    try {
      const url = isRescheduling
        ? `/api/student/bookings/${rescheduleState?.rescheduleBookingId}/reschedule`
        : '/api/book';

      const res = await fetch(url, {
        method: isRescheduling ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
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
    const baseStatus = getDisplayStatusAtTime(slot.time, timelineSlots, timelineBookings);

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

  return (
    <div className="page-shell section-light-alt min-h-[calc(100vh-8rem)]">
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-16"
      >
        <h1 className="section-heading text-4xl md:text-5xl font-serif mb-6">
          {isRescheduling ? 'Reschedule Appointment' : 'Book Appointment'}
        </h1>
        <div className="editorial-divider mb-6"></div>
        <p className="mx-auto max-w-2xl text-sm uppercase tracking-[0.28em] text-[color:var(--text-secondary)]">
          Flexible day timeline with shared booking colors for students and admins
        </p>
      </motion.div>

      <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1.5fr)_340px] xl:grid-cols-[minmax(0,1.5fr)_360px]">
        <div className="min-w-0 space-y-10">
          <section>
            <div className="flex justify-between items-end mb-6">
              <h2 className="section-kicker text-sm">1. Select Services</h2>
              <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-secondary)]">Drag-ready timeline unlocks after this</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {services.map((service) => {
                const isSelected = selectedServices.includes(service.id);

                return (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setSelectedServices(selectedServices.filter((id) => id !== service.id));
                      } else {
                        setSelectedServices([...selectedServices, service.id]);
                      }
                    }}
                    className={clsx(
                      'surface-card surface-card-hover p-6 text-left transition-all duration-200 min-h-[148px] flex flex-col justify-between',
                      isSelected
                        ? 'border-[color:var(--accent-gold)] bg-[color:var(--bg-base)] text-[color:var(--text-primary)] shadow-lg'
                        : 'text-[color:var(--text-dark)]',
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-serif text-2xl mb-2">{service.name}</h3>
                        <p className={clsx(
                          'text-xs uppercase tracking-[0.24em]',
                          isSelected ? 'text-[color:var(--text-secondary)]' : 'text-[color:var(--accent-gold)]',
                        )}
                        >
                          {service.duration_minutes} minutes
                        </p>
                      </div>
                      <span className={clsx(
                        'inline-flex h-8 min-w-8 items-center justify-center border px-2 text-[11px] uppercase tracking-[0.22em]',
                        isSelected ? 'border-[color:var(--accent-gold-border)] text-[color:var(--text-primary)]' : 'border-[color:var(--border-light)] text-[color:var(--text-muted-dark)]',
                      )}
                      >
                        ₹{service.price}
                      </span>
                    </div>
                    <span className={clsx(
                      'inline-flex w-fit rounded-full border px-3 py-2 text-[11px] uppercase tracking-[0.22em]',
                      isSelected ? 'border-[color:var(--accent-gold-border)] text-[color:var(--text-primary)]' : 'border-[color:var(--border-light)] text-[color:var(--text-secondary)]',
                    )}
                    >
                      {isSelected ? 'Included' : 'Tap to add'}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <h2 className="section-kicker mb-6 text-sm">2. Select Stylist</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {stylists.map((stylist) => (
                <button
                  key={stylist.id}
                  type="button"
                  onClick={() => {
                    setSelectedStylist(stylist.id);
                    setSelectedSlot('');
                    setFocusedSlotId('');
                  }}
                  className={clsx(
                    'surface-card surface-card-hover p-6 text-left transition-all duration-200',
                    selectedStylist === stylist.id
                      ? 'border-[color:var(--accent-gold)] bg-[color:var(--bg-base)] text-[color:var(--text-primary)] shadow-lg'
                      : 'text-[color:var(--text-dark)]',
                  )}
                >
                  <h3 className="font-serif text-2xl mb-2">{stylist.name}</h3>
                  <p className={clsx(
                    'text-xs uppercase tracking-[0.24em]',
                    selectedStylist === stylist.id ? 'text-[color:var(--text-secondary)]' : 'text-[color:var(--accent-gold)]',
                  )}
                  >
                    {stylist.role}
                  </p>
                </button>
              ))}
            </div>
          </section>

          {selectedStylist && (
            <section className="space-y-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="section-kicker mb-3 text-sm">3. Select Day & Time</h2>
                  <p className="max-w-2xl text-[color:var(--text-muted-dark)]">
                    Tap a segment to inspect it. Once you select services, the green start points stay valid for the full appointment length.
                    {selectedSlotData ? ' You can drag the selected booking bar to another green start time.' : ''}
                  </p>
                </div>
                <div className="surface-card px-4 py-3 text-right">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-secondary)]">Current service time</p>
                  <p className="font-serif text-2xl text-[color:var(--text-dark)]">{bookingDuration || '—'} {bookingDuration ? 'mins' : ''}</p>
                </div>
              </div>

              <div className="max-w-full overflow-x-auto pb-3">
                <div className="flex w-max gap-3 snap-x pr-2">
                  {dates.map((date) => (
                    <button
                      key={date.toISOString()}
                      type="button"
                      onClick={() => {
                        setSelectedDate(date);
                        setSelectedSlot('');
                      }}
                      className={clsx(
                        'flex-shrink-0 min-w-[78px] sm:min-w-[92px] surface-card px-3 sm:px-4 py-4 text-center snap-start transition-all duration-200',
                        format(selectedDate, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
                          ? 'border-[color:var(--btn-dark-bg)] bg-[color:var(--btn-dark-bg)] text-[color:var(--status-confirmed-text)]'
                          : 'text-[color:var(--text-dark)]',
                      )}
                    >
                      <p className="text-xs uppercase tracking-[0.24em] mb-2">{format(date, 'EEE')}</p>
                      <p className="font-serif text-3xl leading-none">{format(date, 'd')}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="surface-card p-6">
                <div className="mb-6 flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <h3 className="section-heading text-2xl font-serif">Day Timeline</h3>
                    <p className="mt-1 text-sm text-[color:var(--text-muted-dark)]">
                      Click any green point to book it. Hover anywhere on the strip to read the exact time.
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
                  <div className="empty-state">
                    Loading timeline
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
                                    'relative h-[118px] transition-all duration-150 first:rounded-l-[22px] last:rounded-r-[22px] border-r border-white/20',
                                    getTrackCellClasses(status, isSelectable),
                                    isSelected && 'ring-2 ring-[color:var(--accent-gold)] ring-inset',
                                    isFocused && !isSelected && 'ring-2 ring-[color:var(--accent-gold-border)] ring-inset',
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
                            <div className="flex flex-wrap items-center gap-3 mb-4">
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
                            <p className="mb-5 text-[color:var(--text-muted-dark)]">
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
                          <p>Drag the selected green bar to another green start time to reschedule quickly.</p>
                          <p>Muted sage is available, mocha is booked, pale warm grey is unavailable, and warm amber marks rescheduled time.</p>
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
            </section>
          )}
        </div>

        <aside className="min-w-0 lg:h-fit lg:self-start lg:sticky lg:top-24 lg:z-30">
          <div className="surface-card p-8 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
            <h2 className="section-heading mb-8 text-2xl font-serif">Booking Summary</h2>

            <div className="space-y-6 mb-10">
              <div>
                <p className="section-kicker mb-2 text-[11px]">Services</p>
                <p className="font-serif text-xl text-[color:var(--text-dark)]">
                  {selectedServices.length > 0
                    ? selectedServices.map((id) => services.find((service) => service.id === id)?.name).join(', ')
                    : '—'}
                </p>
              </div>

              <div>
                <p className="section-kicker mb-2 text-[11px]">Stylist</p>
                <p className="font-serif text-xl text-[color:var(--text-dark)]">
                  {selectedStylist ? stylists.find((stylist) => stylist.id === selectedStylist)?.name : '—'}
                </p>
              </div>

              <div>
                <p className="section-kicker mb-2 text-[11px]">Date</p>
                <p className="font-serif text-xl text-[color:var(--text-dark)]">
                  {selectedStylist ? format(selectedDate, 'MMM d, yyyy') : '—'}
                </p>
              </div>

              <div>
                <p className="section-kicker mb-2 text-[11px]">Time Range</p>
                <p className="font-serif text-xl text-[color:var(--text-dark)]">
                  {selectedSlotData && bookingDuration > 0 ? selectedRangeLabel : '—'}
                </p>
              </div>

              <div>
                <p className="section-kicker mb-2 text-[11px]">Total Duration</p>
                <p className="font-serif text-xl text-[color:var(--text-dark)]">{bookingDuration ? `${bookingDuration} mins` : '—'}</p>
              </div>

              <div className="border-t border-[color:var(--border-light)] pt-6">
                <div className="flex items-center justify-between">
                  <p className="section-kicker text-[11px]">Total</p>
                  <p className="font-serif text-3xl text-[color:var(--text-dark)]">
                    ₹{selectedServices.reduce((total, id) => {
                      const service = services.find((candidate) => candidate.id === id);
                      return total + (service?.price ?? 0);
                    }, 0)}
                  </p>
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
              disabled={selectedServices.length === 0 || !selectedStylist || !selectedSlot}
              className="editorial-btn editorial-btn-dark w-full py-4 disabled:opacity-45"
            >
              {isRescheduling ? 'Confirm Reschedule' : 'Request Booking'}
            </button>
          </div>
        </aside>
      </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { addDays, format, startOfToday } from 'date-fns';
import { clsx } from 'clsx';
import ScheduleLegend from '../components/ScheduleLegend';
import { getStudentToken } from '../lib/client-auth';
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
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  const bookingDuration = selectedServices.reduce((total, id) => {
    const service = services.find((candidate) => candidate.id === id);
    return total + (service?.duration_minutes ?? 0);
  }, 0);

  const dates = Array.from({ length: 7 }).map((_, index) => addDays(startOfToday(), index));

  useEffect(() => {
    setIsLoggedIn(Boolean(getStudentToken()));
  }, []);

  useEffect(() => {
    if (isLoggedIn === null) {
      return;
    }

    if (!isLoggedIn) {
      toast.error('Please login to book an appointment');
      navigate('/login');
      return;
    }

    fetch('/api/services')
      .then((res) => res.json())
      .then((data) => {
        setServices(data);
        if (rescheduleState?.currentServices?.length) {
          setSelectedServices(rescheduleState.currentServices);
        }
      })
      .catch(() => toast.error('Unable to load services'));

    fetch('/api/stylists')
      .then((res) => res.json())
      .then((data) => {
        setStylists(data);
        if (rescheduleState?.currentStylist) {
          setSelectedStylist(rescheduleState.currentStylist);
        } else if (data[0]?.id) {
          setSelectedStylist(data[0].id);
        }
      })
      .catch(() => toast.error('Unable to load stylists'));

    if (rescheduleState?.oldDate) {
      setSelectedDate(new Date(`${rescheduleState.oldDate}T00:00:00`));
    }
  }, [isLoggedIn, navigate, rescheduleState]);

  useEffect(() => {
    if (!selectedStylist) {
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
  }, [selectedStylist, selectedDate]);

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
          Authorization: `Bearer ${getStudentToken() ?? ''}`,
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
      return 'bg-red-300/85';
    }

    if (status === 'UNAVAILABLE') {
      return 'bg-yellow-300/85';
    }

    if (status === 'RESCHEDULED') {
      return 'bg-purple-300/85';
    }

    return isSelectable || bookingDuration === 0 ? 'bg-green-300/85 hover:bg-green-400/85' : 'bg-green-200/45';
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
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-16"
      >
        <h1 className="text-4xl md:text-5xl font-serif text-stone-900 mb-6">
          {isRescheduling ? 'Reschedule Appointment' : 'Book Appointment'}
        </h1>
        <p className="max-w-2xl mx-auto text-sm uppercase tracking-[0.28em] text-stone-500">
          Flexible day timeline with shared booking colors for students and admins
        </p>
      </motion.div>

      <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1.5fr)_340px] xl:grid-cols-[minmax(0,1.5fr)_360px]">
        <div className="min-w-0 space-y-10">
          <section>
            <div className="flex justify-between items-end mb-6">
              <h2 className="text-sm uppercase tracking-[0.28em] text-stone-500">1. Select Services</h2>
              <p className="text-[11px] uppercase tracking-[0.22em] text-stone-400">Drag-ready timeline unlocks after this</p>
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
                      'border p-6 text-left transition-all duration-200 min-h-[148px] flex flex-col justify-between',
                      isSelected
                        ? 'border-stone-900 bg-stone-900 text-white shadow-lg'
                        : 'border-stone-200 bg-white text-stone-900 hover:border-stone-400 hover:shadow-md',
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-serif text-2xl mb-2">{service.name}</h3>
                        <p className={clsx(
                          'text-xs uppercase tracking-[0.24em]',
                          isSelected ? 'text-stone-300' : 'text-stone-500',
                        )}
                        >
                          {service.duration_minutes} minutes
                        </p>
                      </div>
                      <span className={clsx(
                        'inline-flex h-8 min-w-8 items-center justify-center border px-2 text-[11px] uppercase tracking-[0.22em]',
                        isSelected ? 'border-stone-300 text-stone-100' : 'border-stone-300 text-stone-600',
                      )}
                      >
                        ₹{service.price}
                      </span>
                    </div>
                    <span className={clsx(
                      'inline-flex w-fit border px-3 py-2 text-[11px] uppercase tracking-[0.22em]',
                      isSelected ? 'border-stone-300 text-stone-100' : 'border-stone-200 text-stone-500',
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
            <h2 className="text-sm uppercase tracking-[0.28em] text-stone-500 mb-6">2. Select Stylist</h2>
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
                    'border p-6 text-left transition-all duration-200',
                    selectedStylist === stylist.id
                      ? 'border-stone-900 bg-stone-900 text-white shadow-lg'
                      : 'border-stone-200 bg-white text-stone-900 hover:border-stone-400',
                  )}
                >
                  <h3 className="font-serif text-2xl mb-2">{stylist.name}</h3>
                  <p className={clsx(
                    'text-xs uppercase tracking-[0.24em]',
                    selectedStylist === stylist.id ? 'text-stone-300' : 'text-stone-500',
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
                  <h2 className="text-sm uppercase tracking-[0.28em] text-stone-500 mb-3">3. Select Day & Time</h2>
                  <p className="text-stone-600 max-w-2xl">
                    Tap a segment to inspect it. Once you select services, the green start points stay valid for the full appointment length.
                    {selectedSlotData ? ' You can drag the selected booking bar to another green start time.' : ''}
                  </p>
                </div>
                <div className="border border-stone-200 bg-white px-4 py-3 text-right">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-stone-500">Current service time</p>
                  <p className="font-serif text-2xl text-stone-900">{bookingDuration || '—'} {bookingDuration ? 'mins' : ''}</p>
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
                        'flex-shrink-0 min-w-[78px] sm:min-w-[92px] border px-3 sm:px-4 py-4 text-center snap-start transition-all duration-200',
                        format(selectedDate, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
                          ? 'border-stone-900 bg-stone-900 text-white'
                          : 'border-stone-200 bg-white text-stone-900 hover:border-stone-400',
                      )}
                    >
                      <p className="text-xs uppercase tracking-[0.24em] mb-2">{format(date, 'EEE')}</p>
                      <p className="font-serif text-3xl leading-none">{format(date, 'd')}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="border border-stone-200 bg-white p-6">
                <div className="mb-6 flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <h3 className="font-serif text-2xl text-stone-900">Day Timeline</h3>
                    <p className="text-sm text-stone-500 mt-1">
                      Click any green point to book it. Hover anywhere on the strip to read the exact time.
                    </p>
                  </div>
                  <div className="flex w-full flex-col items-start gap-3 lg:w-auto lg:items-end">
                    <div className="border border-stone-200 bg-stone-50 px-4 py-3 text-left lg:text-right">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-stone-500">Cursor time</p>
                      <p className="font-serif text-2xl text-stone-900">{hoveredTime?.time ?? '—'}</p>
                    </div>
                    <ScheduleLegend />
                  </div>
                </div>

                {loadingSchedule ? (
                  <div className="border border-dashed border-stone-300 p-12 text-center text-sm uppercase tracking-[0.28em] text-stone-500">
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
                              <span className="text-[11px] uppercase tracking-[0.22em] text-stone-500">{label.time}</span>
                            </div>
                          ))}
                        </div>

                        <div
                          className="relative overflow-visible rounded-[28px] border border-stone-200 bg-stone-50/80 px-2 py-2 shadow-inner"
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
                                className="pointer-events-none absolute -top-10 z-30 -translate-x-1/2 border border-stone-900 bg-stone-900 px-3 py-2 text-[11px] uppercase tracking-[0.22em] text-white shadow-xl"
                                style={{ left: `${hoveredTime.left + 8}px` }}
                              >
                                {hoveredTime.time}
                              </div>
                              <div
                                className="pointer-events-none absolute bottom-2 top-2 z-20 w-px bg-stone-900/35"
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
                                    isSelected && 'ring-2 ring-green-700 ring-inset',
                                    isFocused && !isSelected && 'ring-2 ring-stone-900/30 ring-inset',
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
                              className="absolute z-20 border border-green-800 bg-green-700 px-3 text-left text-white shadow-lg"
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
                      <div className="min-w-0 border border-stone-200 bg-stone-50 p-5">
                        <p className="text-[11px] uppercase tracking-[0.22em] text-stone-500 mb-3">Focused timeline segment</p>
                        {focusedSlot ? (
                          <>
                            <div className="flex flex-wrap items-center gap-3 mb-4">
                              <span className="font-serif text-3xl text-stone-900">{focusedSlot.time}</span>
                              <span className={clsx(
                                'border px-3 py-2 text-[11px] uppercase tracking-[0.22em]',
                                getStatusClasses(getStudentSlotStatus(focusedSlot)),
                              )}
                              >
                                {getStudentSlotStatus(focusedSlot) === 'BOOKED' && 'Already Booked'}
                                {getStudentSlotStatus(focusedSlot) === 'AVAILABLE' && 'Available'}
                                {getStudentSlotStatus(focusedSlot) === 'UNAVAILABLE' && 'Unavailable'}
                                {getStudentSlotStatus(focusedSlot) === 'RESCHEDULED' && 'Rescheduled'}
                              </span>
                            </div>
                            <p className="text-stone-600 mb-5">
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
                                className="border border-green-700 bg-green-700 px-4 py-3 text-xs uppercase tracking-[0.22em] text-white transition-colors hover:bg-green-800 disabled:border-stone-300 disabled:bg-stone-200 disabled:text-stone-500"
                              >
                                {selectedSlot === focusedSlot.id ? 'Selected' : 'Use this time'}
                              </button>
                              {selectedSlot === focusedSlot.id && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedSlot('')}
                                  className="border border-stone-300 px-4 py-3 text-xs uppercase tracking-[0.22em] text-stone-600 hover:bg-stone-100"
                                >
                                  Clear selection
                                </button>
                              )}
                            </div>
                          </>
                        ) : (
                          <p className="text-stone-500">Tap any point on the timeline to inspect it.</p>
                        )}
                      </div>

                      <div className="min-w-0 border border-stone-200 bg-white p-5">
                        <p className="text-[11px] uppercase tracking-[0.22em] text-stone-500 mb-3">Timeline tips</p>
                        <div className="space-y-3 text-sm text-stone-600">
                          <p>Green starts are safe for the full appointment length you selected.</p>
                          <p>Drag the selected green bar to another green start time to reschedule quickly.</p>
                          <p>Yellow means unavailable, red is already booked, and purple marks rescheduled time.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="border border-dashed border-stone-300 p-12 text-center text-sm uppercase tracking-[0.28em] text-stone-500">
                    Pick a stylist to load the day timeline
                  </div>
                )}
              </div>
            </section>
          )}
        </div>

        <aside className="min-w-0 lg:h-fit lg:self-start lg:sticky lg:top-24 lg:z-30">
          <div className="border border-stone-200 bg-white p-8 shadow-sm lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
            <h2 className="text-2xl font-serif text-stone-900 mb-8">Booking Summary</h2>

            <div className="space-y-6 mb-10">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-stone-500 mb-2">Services</p>
                <p className="font-serif text-xl text-stone-900">
                  {selectedServices.length > 0
                    ? selectedServices.map((id) => services.find((service) => service.id === id)?.name).join(', ')
                    : '—'}
                </p>
              </div>

              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-stone-500 mb-2">Stylist</p>
                <p className="font-serif text-xl text-stone-900">
                  {selectedStylist ? stylists.find((stylist) => stylist.id === selectedStylist)?.name : '—'}
                </p>
              </div>

              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-stone-500 mb-2">Date</p>
                <p className="font-serif text-xl text-stone-900">
                  {selectedStylist ? format(selectedDate, 'MMM d, yyyy') : '—'}
                </p>
              </div>

              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-stone-500 mb-2">Time Range</p>
                <p className="font-serif text-xl text-stone-900">
                  {selectedSlotData && bookingDuration > 0 ? selectedRangeLabel : '—'}
                </p>
              </div>

              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-stone-500 mb-2">Total Duration</p>
                <p className="font-serif text-xl text-stone-900">{bookingDuration ? `${bookingDuration} mins` : '—'}</p>
              </div>

              <div className="pt-6 border-t border-stone-200">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-stone-500">Total</p>
                  <p className="font-serif text-3xl text-stone-900">
                    ₹{selectedServices.reduce((total, id) => {
                      const service = services.find((candidate) => candidate.id === id);
                      return total + (service?.price ?? 0);
                    }, 0)}
                  </p>
                </div>
              </div>
            </div>

            {isRescheduling && rescheduleState?.oldDate && rescheduleState?.oldTime && (
              <div className="border border-purple-300 bg-purple-50 p-4 mb-6">
                <p className="text-[11px] uppercase tracking-[0.22em] text-purple-700 mb-2">Current booking</p>
                <p className="text-sm text-purple-900">
                  {format(new Date(`${rescheduleState.oldDate}T00:00:00`), 'MMM d, yyyy')} at {rescheduleState.oldTime}
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={handleBook}
              disabled={selectedServices.length === 0 || !selectedStylist || !selectedSlot}
              className="w-full border border-stone-900 bg-stone-900 py-4 text-sm uppercase tracking-[0.24em] text-white transition-colors hover:bg-stone-800 disabled:border-stone-300 disabled:bg-stone-300 disabled:text-stone-500"
            >
              {isRescheduling ? 'Confirm Reschedule' : 'Request Booking'}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

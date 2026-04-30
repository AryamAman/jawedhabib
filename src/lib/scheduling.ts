export const SLOT_INTERVAL_MINUTES = 5;
export const DAY_START_TIME = '10:00';
export const DAY_END_TIME = '20:00';

export const OCCUPIED_BOOKING_STATUSES = ['PENDING', 'CONFIRMED', 'RESCHEDULE_PENDING'] as const;

type BaseSlotStatus = 'AVAILABLE' | 'UNAVAILABLE';
export type DisplaySlotStatus = 'AVAILABLE' | 'BOOKED' | 'UNAVAILABLE' | 'RESCHEDULED';

export interface ScheduleSlot {
  id: string;
  date: string;
  time: string;
  status: string;
}

interface SchedulePerson {
  name: string;
  email?: string;
}

interface ScheduleService {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
}

interface ScheduleStylist {
  id: string;
  name: string;
}

export interface ScheduleBooking {
  id: string;
  status: string;
  duration_minutes: number;
  slot_id: string;
  proposed_slot_id?: string | null;
  start_time: string;
  end_time: string;
  proposed_start_time?: string | null;
  proposed_end_time?: string | null;
  student?: SchedulePerson;
  services?: ScheduleService[];
  stylist?: ScheduleStylist;
}

interface ScheduleMeta {
  date: string;
  stylist_id: string;
  dayStart: string;
  dayEnd: string;
  stepMinutes: number;
}

export interface ScheduleResponse {
  meta: ScheduleMeta;
  slots: ScheduleSlot[];
  bookings: ScheduleBooking[];
}

interface TimeRange {
  startTime: string;
  endTime: string;
  startMinutes: number;
  endMinutes: number;
}

interface OccupancyRange extends TimeRange {
  bookingId: string;
  bookingStatus: string;
  type: 'current' | 'proposed';
  displayStatus: DisplaySlotStatus;
}

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours * 60) + minutes;
}

export function minutesToTime(totalMinutes: number): string {
  const safeMinutes = Math.max(0, totalMinutes);
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function addMinutes(time: string, minutes: number): string {
  return minutesToTime(timeToMinutes(time) + minutes);
}

export function formatTimeRange(startTime: string, endTime: string): string {
  return `${startTime} - ${endTime}`;
}

function getRangeFromStart(startTime: string, durationMinutes: number): TimeRange {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = startMinutes + durationMinutes;

  return {
    startTime,
    endTime: minutesToTime(endMinutes),
    startMinutes,
    endMinutes,
  };
}

export function generateTimeSteps(
  dayStart: string = DAY_START_TIME,
  dayEnd: string = DAY_END_TIME,
  stepMinutes: number = SLOT_INTERVAL_MINUTES,
): string[] {
  const steps: string[] = [];
  const start = timeToMinutes(dayStart);
  const end = timeToMinutes(dayEnd);

  for (let minute = start; minute < end; minute += stepMinutes) {
    steps.push(minutesToTime(minute));
  }

  return steps;
}

export function normalizeBaseSlotStatus(status: string): BaseSlotStatus {
  return status === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'AVAILABLE';
}

export function rangesOverlap(
  firstStart: number,
  firstEnd: number,
  secondStart: number,
  secondEnd: number,
): boolean {
  return firstStart < secondEnd && secondStart < firstEnd;
}

function getBookingCurrentRange(booking: Pick<ScheduleBooking, 'id' | 'status' | 'duration_minutes' | 'start_time' | 'end_time'>): OccupancyRange | null {
  if (!OCCUPIED_BOOKING_STATUSES.includes(booking.status as typeof OCCUPIED_BOOKING_STATUSES[number])) {
    return null;
  }

  const range = getRangeFromStart(booking.start_time, booking.duration_minutes);

  return {
    ...range,
    bookingId: booking.id,
    bookingStatus: booking.status,
    type: 'current',
    displayStatus: booking.status === 'RESCHEDULE_PENDING' ? 'RESCHEDULED' : 'BOOKED',
  };
}

function getBookingProposedRange(booking: Pick<ScheduleBooking, 'id' | 'status' | 'duration_minutes' | 'proposed_start_time' | 'proposed_end_time'>): OccupancyRange | null {
  if (booking.status !== 'RESCHEDULE_PROPOSED' || !booking.proposed_start_time || !booking.proposed_end_time) {
    return null;
  }

  const range = getRangeFromStart(booking.proposed_start_time, booking.duration_minutes);

  return {
    ...range,
    bookingId: booking.id,
    bookingStatus: booking.status,
    type: 'proposed',
    displayStatus: 'RESCHEDULED',
  };
}

export function getBookingOccupancyRanges(booking: ScheduleBooking): OccupancyRange[] {
  const current = getBookingCurrentRange(booking);
  const proposed = getBookingProposedRange(booking);

  return [current, proposed].filter((range): range is OccupancyRange => Boolean(range));
}

export function getDisplayStatusAtTime(
  slotTime: string,
  slots: ScheduleSlot[],
  bookings: ScheduleBooking[],
): DisplaySlotStatus {
  const minute = timeToMinutes(slotTime);
  const slot = slots.find((candidate) => candidate.time === slotTime);

  const occupiedRange = bookings
    .flatMap((booking) => getBookingOccupancyRanges(booking))
    .find((range) => range.startMinutes <= minute && range.endMinutes > minute);

  if (occupiedRange) {
    return occupiedRange.displayStatus;
  }

  if (!slot || normalizeBaseSlotStatus(slot.status) === 'UNAVAILABLE') {
    return 'UNAVAILABLE';
  }

  return 'AVAILABLE';
}

function getSlotByTime(slots: ScheduleSlot[], slotTime: string): ScheduleSlot | undefined {
  return slots.find((slot) => slot.time === slotTime);
}

export function isStartTimeSelectable(options: {
  slotTime: string;
  slots: ScheduleSlot[];
  bookings: ScheduleBooking[];
  durationMinutes: number;
  dayEnd?: string;
  stepMinutes?: number;
  excludeBookingId?: string;
}): boolean {
  const {
    slotTime,
    slots,
    bookings,
    durationMinutes,
    dayEnd = DAY_END_TIME,
    stepMinutes = SLOT_INTERVAL_MINUTES,
    excludeBookingId,
  } = options;

  const startMinutes = timeToMinutes(slotTime);
  const endMinutes = startMinutes + durationMinutes;
  const dayEndMinutes = timeToMinutes(dayEnd);

  if (durationMinutes <= 0 || endMinutes > dayEndMinutes) {
    return false;
  }

  for (let minute = startMinutes; minute < endMinutes; minute += stepMinutes) {
    const time = minutesToTime(minute);
    const slot = getSlotByTime(slots, time);

    if (!slot || normalizeBaseSlotStatus(slot.status) === 'UNAVAILABLE') {
      return false;
    }
  }

  for (const booking of bookings) {
    if (booking.id === excludeBookingId) {
      continue;
    }

    const ranges = getBookingOccupancyRanges(booking);
    const overlaps = ranges.some((range) => rangesOverlap(startMinutes, endMinutes, range.startMinutes, range.endMinutes));

    if (overlaps) {
      return false;
    }
  }

  return true;
}

export function getSelectableStartTimes(options: {
  slots: ScheduleSlot[];
  bookings: ScheduleBooking[];
  durationMinutes: number;
  dayEnd?: string;
  stepMinutes?: number;
  excludeBookingId?: string;
}): Set<string> {
  const selectable = new Set<string>();

  for (const slot of options.slots) {
    if (isStartTimeSelectable({
      ...options,
      slotTime: slot.time,
    })) {
      selectable.add(slot.time);
    }
  }

  return selectable;
}

export function getStatusClasses(status: DisplaySlotStatus): string {
  switch (status) {
    case 'AVAILABLE':
      return 'timeline-status timeline-status--available';
    case 'BOOKED':
      return 'timeline-status timeline-status--booked';
    case 'UNAVAILABLE':
      return 'timeline-status timeline-status--unavailable';
    case 'RESCHEDULED':
      return 'timeline-status timeline-status--rescheduled';
    default:
      return 'timeline-status timeline-status--unavailable';
  }
}

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { addDays, format, parseISO, startOfToday } from 'date-fns';
import { clsx } from 'clsx';
import { Undo2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import ScheduleLegend from '../components/ScheduleLegend';
import EmptyState from '../components/EmptyState';
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
  getStatusClasses,
  isStartTimeSelectable,
  minutesToTime,
  rangesOverlap,
  timeToMinutes,
} from '../lib/scheduling';

interface Booking {
  id: string;
  status: string;
  duration_minutes: number;
  displayStatus: 'Requested' | 'Confirmed' | 'Asked to Reschedule' | 'Reschedule Proposed' | 'Rescheduled' | 'Expired' | 'Cancelled' | 'Rejected';
  isExpired: boolean;
  isUpcoming: boolean;
  canAdminConfirm: boolean;
  canAdminReject: boolean;
  canAdminAskReschedule: boolean;
  canAdminProposeSlot: boolean;
  canAdminCancel: boolean;
  student: { name: string; email: string; phone_display?: string | null };
  services: { id: string; name: string; price: number; duration_minutes: number }[];
  stylist: { id: string; name: string };
  slot: { id: string; date: string; time: string };
  proposed_slot?: { id: string; date: string; time: string; stylist_id: string } | null;
}

interface Stylist {
  id: string;
  name: string;
  role: string;
}

interface DragRange {
  anchorTime: string;
  currentTime: string;
  cursorX: number;
  cursorY: number;
}

interface SelectedRange {
  startTime: string;
  endTime: string;
}

interface UndoBookingSnapshot {
  id: string;
  status: string;
  slot_id: string;
  proposed_slot_id: string | null;
  stylist_id: string;
}

interface UndoSlotSnapshot {
  id: string;
  status: string;
}

interface UndoAction {
  id: string;
  label: string;
  createdAt: string;
  bookingUpdates: UndoBookingSnapshot[];
  slotUpdates: UndoSlotSnapshot[];
}

const CELL_WIDTH = 10;
const BOOKING_BLOCK_TOP = 18;
const BOOKING_BLOCK_HEIGHT = 34;
const UNDO_STORAGE_KEY = 'admin-undo-stack-v1';
const INDIA_TIME_ZONE = 'Asia/Kolkata';

const getDateStringInIndia = (date: Date) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: INDIA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return `${year}-${month}-${day}`;
};

const compareBookings = (first: Booking, second: Booking) => {
  const firstKey = `${first.slot.date}T${first.slot.time}`;
  const secondKey = `${second.slot.date}T${second.slot.time}`;
  return firstKey.localeCompare(secondKey);
};

export default function AdminDashboard() {
  const [admin, setAdmin] = useState<{ email: string } | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [activeTab, setActiveTab] = useState<'bookings' | 'slots' | 'records'>('bookings');
  const [stylists, setStylists] = useState<Stylist[]>([]);
  const [selectedStylist, setSelectedStylist] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<Date>(startOfToday());
  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [dailyRecords, setDailyRecords] = useState<Booking[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [focusedSlotId, setFocusedSlotId] = useState<string>('');
  const [focusedBookingId, setFocusedBookingId] = useState<string>('');
  const [dragRange, setDragRange] = useState<DragRange | null>(null);
  const [selectedRange, setSelectedRange] = useState<SelectedRange | null>(null);
  const [draggingBookingId, setDraggingBookingId] = useState<string>('');
  const [dropTargetSlotId, setDropTargetSlotId] = useState<string>('');
  const [hoveredTime, setHoveredTime] = useState<{ time: string; left: number } | null>(null);
  const timelineStripRef = useRef<HTMLDivElement | null>(null);
  const dragRangeRef = useRef<DragRange | null>(null);
  const [undoStack, setUndoStack] = useState<UndoAction[]>(() => {
    const savedStack = localStorage.getItem(UNDO_STORAGE_KEY);

    if (!savedStack) {
      return [];
    }

    try {
      const parsed = JSON.parse(savedStack) as UndoAction[];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Failed to parse saved undo stack:', error);
      localStorage.removeItem(UNDO_STORAGE_KEY);
      return [];
    }
  });

  const navigate = useNavigate();
  const token = localStorage.getItem('adminToken');

  const dates = Array.from({ length: 14 }).map((_, index) => addDays(startOfToday(), index));
  const selectedDateString = format(selectedDate, 'yyyy-MM-dd');
  const todayInIndia = getDateStringInIndia(new Date());
  const isSelectedDatePast = selectedDateString < todayInIndia;

  const fetchBookings = async () => {
    if (!token) {
      return;
    }

    try {
      const res = await fetch('/api/admin/bookings', {
        headers: { Authorization: `Bearer ${token}` },
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
    } catch (error) {
      console.error(error);
      toast.error('Failed to load bookings');
    }
  };

  const fetchSchedule = async () => {
    if (!token || !selectedStylist) {
      return;
    }

    const dateString = selectedDateString;
    setLoadingSchedule(true);

    try {
      const res = await fetch(`/api/admin/schedule?stylist_id=${selectedStylist}&date=${dateString}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          navigate('/admin/login');
          return;
        }

        throw new Error('Failed to load schedule');
      }
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('Schedule API is not ready yet. Restart the backend and refresh.');
      }

      const data: ScheduleResponse = await res.json();
      setSchedule(data);
      setFocusedSlotId((current) => current || data.slots[0]?.id || '');
    } catch (error) {
      console.error(error);
      toast.error('Failed to load day timeline');
    } finally {
      setLoadingSchedule(false);
    }
  };

  const fetchDailyRecords = async () => {
    if (!token) {
      return;
    }

    const dateString = selectedDateString;
    setLoadingRecords(true);

    try {
      const res = await fetch(`/api/admin/records?date=${dateString}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          navigate('/admin/login');
          return;
        }

        throw new Error('Failed to load daily records');
      }

      const data = await res.json();
      setDailyRecords(data);
    } catch (error) {
      console.error(error);
      toast.error('Failed to load daily records');
    } finally {
      setLoadingRecords(false);
    }
  };

  useEffect(() => {
    if (!token) {
      navigate('/admin/login');
      return;
    }

    fetch('/api/admin/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setAdmin(data.admin))
      .catch(() => navigate('/admin/login'));

    fetch('/api/stylists')
      .then((res) => res.json())
      .then((data) => {
        setStylists(data);
        if (data[0]?.id && !selectedStylist) {
          setSelectedStylist(data[0].id);
        }
      })
      .catch(() => toast.error('Failed to load stylists'));

    fetchBookings();
  }, [navigate, token]);

  useEffect(() => {
    if (selectedStylist) {
      fetchSchedule();
    }
  }, [selectedStylist, selectedDateString]);

  useEffect(() => {
    if (activeTab === 'records') {
      fetchDailyRecords();
    }
  }, [activeTab, selectedDateString]);

  useEffect(() => {
    localStorage.setItem(UNDO_STORAGE_KEY, JSON.stringify(undoStack));
  }, [undoStack]);

  const currentScheduleBookings = schedule?.bookings ?? [];
  const currentScheduleSlots = schedule?.slots ?? [];
  const selectedDayStylist = stylists.find((stylist) => stylist.id === selectedStylist);
  const focusedSlot = currentScheduleSlots.find((slot) => slot.id === focusedSlotId) ?? null;
  const focusedBooking = currentScheduleBookings.find((booking) => booking.id === focusedBookingId) ?? null;
  const timelineWidth = currentScheduleSlots.length * CELL_WIDTH;
  const timelineStartMinute = schedule ? timeToMinutes(schedule.meta.dayStart) : 0;

  const getTimelineLeft = (time: string) => {
    if (!schedule) {
      return 0;
    }

    return ((timeToMinutes(time) - timelineStartMinute) / schedule.meta.stepMinutes) * CELL_WIDTH;
  };

  const getHoverTimeFromClientX = (clientX: number, boundsLeft: number) => {
    if (!currentScheduleSlots.length) {
      return null;
    }

    const relativeX = Math.min(Math.max(clientX - boundsLeft - 8, 0), Math.max(timelineWidth - 1, 0));
    const slotIndex = Math.min(Math.floor(relativeX / CELL_WIDTH), currentScheduleSlots.length - 1);
    const slot = currentScheduleSlots[slotIndex];

    if (!slot) {
      return null;
    }

    return {
      time: slot.time,
      left: slotIndex * CELL_WIDTH,
    };
  };

  const setDragSelection = (nextDragRange: DragRange | null) => {
    dragRangeRef.current = nextDragRange;
    setDragRange(nextDragRange);
  };

  const getTimelineHoverAtClientX = (clientX: number) => {
    const boundsLeft = timelineStripRef.current?.getBoundingClientRect().left;

    if (boundsLeft === undefined) {
      return null;
    }

    return getHoverTimeFromClientX(clientX, boundsLeft);
  };

  const finalizeRangeSelection = (currentDragRange: DragRange, finalTime: string, stepMinutes: number) => {
    const startMinutes = Math.min(timeToMinutes(currentDragRange.anchorTime), timeToMinutes(finalTime));
    const endMinutes = Math.max(timeToMinutes(currentDragRange.anchorTime), timeToMinutes(finalTime)) + stepMinutes;

    setSelectedRange({
      startTime: minutesToTime(startMinutes),
      endTime: minutesToTime(endMinutes),
    });
    setDragSelection(null);
  };

  useEffect(() => {
    if (!dragRange || !schedule) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const currentDragRange = dragRangeRef.current;

      if (!currentDragRange) {
        return;
      }

      const nextHover = getTimelineHoverAtClientX(event.clientX);
      if (nextHover) {
        setHoveredTime(nextHover);
      }

      setDragSelection({
        ...currentDragRange,
        cursorX: event.clientX,
        cursorY: event.clientY,
        currentTime: nextHover?.time ?? currentDragRange.currentTime,
      });
    };

    const handleMouseUp = (event: MouseEvent) => {
      const currentDragRange = dragRangeRef.current;

      if (!currentDragRange) {
        return;
      }

      const nextHover = getTimelineHoverAtClientX(event.clientX);
      if (nextHover) {
        setHoveredTime(nextHover);
      }

      finalizeRangeSelection(
        currentDragRange,
        nextHover?.time ?? currentDragRange.currentTime,
        schedule.meta.stepMinutes,
      );
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragRange, schedule]);

  const hourLabels = schedule
    ? Array.from({ length: Math.floor((timeToMinutes(schedule.meta.dayEnd) - timelineStartMinute) / 60) + 1 }).map((_, index) => {
        const time = addMinutes(schedule.meta.dayStart, index * 60);
        return { time, left: getTimelineLeft(time) };
      })
    : [];

  const getAdminBookingDuration = (booking: Booking | ScheduleBooking) => {
    if (booking.duration_minutes > 0) {
      return booking.duration_minutes;
    }

    return booking.services?.reduce((total, service) => total + service.duration_minutes, 0) ?? 0;
  };

  const getBookingCardStatus = (booking: Booking) => {
    if (booking.displayStatus === 'Requested') return 'booking-status booking-status--requested';
    if (booking.displayStatus === 'Rescheduled' || booking.displayStatus === 'Reschedule Proposed' || booking.displayStatus === 'Asked to Reschedule') {
      return 'booking-status booking-status--reschedule';
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
    return 'booking-status booking-status--confirmed';
  };

  const getBookingCardTone = (booking: Booking) => {
    if (booking.displayStatus === 'Cancelled') return 'booking-card--cancelled';
    if (booking.displayStatus === 'Rejected') return 'booking-card--rejected';
    if (booking.displayStatus === 'Expired') return 'booking-card--expired';
    if (booking.displayStatus === 'Rescheduled' || booking.displayStatus === 'Reschedule Proposed' || booking.displayStatus === 'Asked to Reschedule') {
      return 'booking-card--rescheduled';
    }
    if (booking.displayStatus === 'Requested') return 'booking-card--requested';
    return 'booking-card--confirmed';
  };

  const getBookingStatusLabel = (booking: Booking) => booking.displayStatus;

  const getScheduleBookingStatusLabel = (status: string) => {
    if (status === 'PENDING') return 'Requested';
    if (status === 'RESCHEDULE_PENDING') return 'Rescheduled';
    if (status === 'RESCHEDULE_PROPOSED') return 'Reschedule Proposed';
    if (status === 'NEEDS_RESCHEDULE') return 'Asked to Reschedule';
    if (status === 'CONFIRMED') return 'Confirmed';
    return status;
  };

  const createBookingSnapshot = (booking: Pick<Booking, 'id' | 'status' | 'slot' | 'proposed_slot' | 'stylist'>): UndoBookingSnapshot => ({
    id: booking.id,
    status: booking.status,
    slot_id: booking.slot.id,
    proposed_slot_id: booking.proposed_slot?.id ?? null,
    stylist_id: booking.stylist.id,
  });

  const pushUndoAction = (action: Omit<UndoAction, 'id' | 'createdAt'>) => {
    setUndoStack((current) => [{
      ...action,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
    }, ...current].slice(0, 5));
  };

  const refreshAdminData = () => {
    fetchBookings();
    fetchSchedule();
    fetchDailyRecords();
  };

  const getRangeUndoSnapshots = (range: SelectedRange) => {
    const rangeStart = timeToMinutes(range.startTime);
    const rangeEnd = timeToMinutes(range.endTime);
    const bookingSnapshots = new Map<string, UndoBookingSnapshot>();

    currentScheduleBookings.forEach((scheduleBooking) => {
      const overlaps = getBookingOccupancyRanges(scheduleBooking).some((occupancyRange) => (
        rangesOverlap(rangeStart, rangeEnd, occupancyRange.startMinutes, occupancyRange.endMinutes)
      ));

      if (!overlaps) {
        return;
      }

      const fullBooking = bookings.find((booking) => booking.id === scheduleBooking.id);
      if (fullBooking) {
        bookingSnapshots.set(fullBooking.id, createBookingSnapshot(fullBooking));
      }
    });

    return {
      bookingUpdates: Array.from(bookingSnapshots.values()),
      slotUpdates: currentScheduleSlots
        .filter((slot) => {
          const minute = timeToMinutes(slot.time);
          return minute >= rangeStart && minute < rangeEnd;
        })
        .map((slot) => ({
          id: slot.id,
          status: slot.status,
        })),
    };
  };

  const handleUndoLatest = async () => {
    const latestAction = undoStack[0];

    if (!latestAction) {
      return;
    }

    try {
      const res = await fetch('/api/admin/undo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          booking_updates: latestAction.bookingUpdates,
          slot_updates: latestAction.slotUpdates,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to undo the last admin action');
      }

      setUndoStack((current) => current.slice(1));
      toast.success(`Undid: ${latestAction.label}`);
      refreshAdminData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to undo the last admin action');
    }
  };

  const handleStatusChange = async (bookingId: string, status: string, confirmMessage?: string) => {
    if (confirmMessage && !window.confirm(confirmMessage)) {
      return;
    }

    const booking = bookings.find((candidate) => candidate.id === bookingId);

    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update booking');
      }

      toast.success(`Booking ${status.toLowerCase()}`);
      if (booking) {
        const label = status === 'CONFIRMED'
          ? `Accepted ${booking.student.name}`
          : status === 'CANCELLED'
            ? `Cancelled ${booking.student.name}`
            : status === 'NEEDS_RESCHEDULE'
              ? `Asked ${booking.student.name} to reschedule`
              : status === 'REJECTED'
                ? `Rejected ${booking.student.name}`
                : `Updated ${booking.student.name}`;

        pushUndoAction({
          label,
          bookingUpdates: [createBookingSnapshot(booking)],
          slotUpdates: [],
        });
      }

      refreshAdminData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update booking');
    }
  };

  const handleProposeNewTime = async (bookingId: string, slotId: string) => {
    if (isSelectedDatePast) {
      toast.error('Past-day bookings are read-only.');
      return;
    }

    const booking = bookings.find((candidate) => candidate.id === bookingId);

    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/propose-slot`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ new_slot_id: slotId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to propose a new time');
      }

      toast.success('New time proposed to the student');
      setDraggingBookingId('');
      setDropTargetSlotId('');
      if (booking) {
        pushUndoAction({
          label: `Proposed a new time for ${booking.student.name}`,
          bookingUpdates: [createBookingSnapshot(booking)],
          slotUpdates: [],
        });
      }
      refreshAdminData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to move the booking');
    }
  };

  const handleApplyRangeStatus = async (status: 'AVAILABLE' | 'UNAVAILABLE') => {
    if (isSelectedDatePast) {
      toast.error('Past-day timelines are read-only.');
      return;
    }

    if (!selectedRange || !selectedStylist) {
      return;
    }

    const undoPayload = getRangeUndoSnapshots(selectedRange);
    const actionLabel = `Marked ${formatTimeRange(selectedRange.startTime, selectedRange.endTime)} ${status === 'UNAVAILABLE' ? 'unavailable' : 'available'}`;

    try {
      const res = await fetch('/api/admin/slots/range', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          date: format(selectedDate, 'yyyy-MM-dd'),
          stylist_id: selectedStylist,
          start_time: selectedRange.startTime,
          end_time: selectedRange.endTime,
          status,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update the range');
      }

      toast.success(`Range marked ${status.toLowerCase()}`);
      setSelectedRange(null);
      pushUndoAction({
        label: actionLabel,
        bookingUpdates: undoPayload.bookingUpdates,
        slotUpdates: undoPayload.slotUpdates,
      });
      refreshAdminData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update the range');
    }
  };

  const handleSingleSegmentStatus = async (slot: ScheduleSlot, status: 'AVAILABLE' | 'UNAVAILABLE') => {
    if (isSelectedDatePast) {
      toast.error('Past-day timelines are read-only.');
      return;
    }

    const range = {
      startTime: slot.time,
      endTime: addMinutes(slot.time, schedule?.meta.stepMinutes ?? SLOT_INTERVAL_MINUTES),
    };
    const undoPayload = getRangeUndoSnapshots(range);

    try {
      const res = await fetch('/api/admin/slots/range', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          date: format(selectedDate, 'yyyy-MM-dd'),
          stylist_id: selectedStylist,
          start_time: range.startTime,
          end_time: range.endTime,
          status,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update the segment');
      }

      toast.success(`Segment marked ${status.toLowerCase()}`);
      setSelectedRange(null);
      pushUndoAction({
        label: `Marked ${formatTimeRange(range.startTime, range.endTime)} ${status === 'UNAVAILABLE' ? 'unavailable' : 'available'}`,
        bookingUpdates: undoPayload.bookingUpdates,
        slotUpdates: undoPayload.slotUpdates,
      });
      refreshAdminData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update the segment');
    }
  };

  const getTimelineSlotStatus = (slot: ScheduleSlot): DisplaySlotStatus =>
    getDisplayStatusAtTime(slot.time, currentScheduleSlots, currentScheduleBookings);

  const getTrackCellClasses = (status: DisplaySlotStatus, canDrop: boolean) => {
    if (status === 'BOOKED') {
      return 'timeline-cell--booked';
    }

    if (status === 'UNAVAILABLE') {
      return 'timeline-cell--unavailable';
    }

    if (status === 'RESCHEDULED') {
      return 'timeline-cell--rescheduled';
    }

    return canDrop ? 'timeline-cell--available timeline-cell--interactive' : 'timeline-cell--available';
  };

  const currentDraggedBooking = currentScheduleBookings.find((booking) => booking.id === draggingBookingId) ?? null;

  const canDropBookingOnSlot = (slot: ScheduleSlot) => {
    if (!schedule || !currentDraggedBooking || isSelectedDatePast) {
      return false;
    }

    if (slot.time === currentDraggedBooking.start_time) {
      return false;
    }

    return isStartTimeSelectable({
      slotTime: slot.time,
      slots: schedule.slots,
      bookings: schedule.bookings,
      durationMinutes: currentDraggedBooking.duration_minutes,
      dayEnd: schedule.meta.dayEnd,
      stepMinutes: schedule.meta.stepMinutes,
      excludeBookingId: currentDraggedBooking.id,
    });
  };

  const activeRange = dragRange && schedule
    ? {
        startTime: minutesToTime(Math.min(timeToMinutes(dragRange.anchorTime), timeToMinutes(dragRange.currentTime))),
        endTime: minutesToTime(Math.max(timeToMinutes(dragRange.anchorTime), timeToMinutes(dragRange.currentTime)) + schedule.meta.stepMinutes),
      }
    : selectedRange;
  const activeRangeMinutes = activeRange
    ? timeToMinutes(activeRange.endTime) - timeToMinutes(activeRange.startTime)
    : 0;

  const archivedBookings = bookings
    .filter((booking) => booking.isExpired || booking.displayStatus === 'Cancelled' || booking.displayStatus === 'Rejected')
    .sort(compareBookings);
  const upcomingBookings = bookings
    .filter((booking) => !booking.isExpired && booking.isUpcoming && booking.displayStatus !== 'Cancelled' && booking.displayStatus !== 'Rejected')
    .sort(compareBookings);
  const pendingBookings = bookings
    .filter((booking) => !booking.isExpired && !booking.isUpcoming && (booking.status === 'PENDING' || booking.status === 'RESCHEDULE_PENDING'))
    .sort(compareBookings);
  const activeBookings = bookings
    .filter((booking) => !booking.isExpired && !booking.isUpcoming && booking.status !== 'PENDING' && booking.status !== 'RESCHEDULE_PENDING' && booking.displayStatus !== 'Cancelled' && booking.displayStatus !== 'Rejected')
    .sort(compareBookings);

  const BookingCard = ({ booking }: { booking: Booking }) => {
    const durationMinutes = getAdminBookingDuration(booking);
    const endTime = addMinutes(booking.slot.time, durationMinutes);

    return (
      <div className={clsx('booking-card p-5', getBookingCardTone(booking))}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="font-serif text-2xl mb-1 text-[color:var(--text-dark)]">{booking.student.name}</h3>
            <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--text-secondary)]">{booking.student.email}</p>
            {booking.student.phone_display ? (
              <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-secondary)]">{booking.student.phone_display}</p>
            ) : null}
          </div>
          <span className={clsx(getBookingCardStatus(booking))}>
            {getBookingStatusLabel(booking)}
          </span>
        </div>

        <div className="space-y-2 text-sm text-[color:var(--text-muted-dark)]">
          <p>{format(parseISO(booking.slot.date), 'MMM d, yyyy')} • {formatTimeRange(booking.slot.time, endTime)}</p>
          <p>Stylist: {booking.stylist.name}</p>
          <p>Services: {booking.services.map((service) => service.name).join(', ')}</p>
        </div>

        {booking.proposed_slot && (
          <div className="mt-4 rounded-[var(--radius-md)] border border-[color:var(--status-reschedule-border)] bg-[color:var(--status-reschedule-bg)] p-3 text-sm text-[color:var(--text-dark)]">
            Proposed: {format(parseISO(booking.proposed_slot.date), 'MMM d, yyyy')} • {formatTimeRange(
              booking.proposed_slot.time,
              addMinutes(booking.proposed_slot.time, durationMinutes),
            )}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          {booking.canAdminConfirm && (
            <>
              <button
                type="button"
                onClick={() => handleStatusChange(booking.id, 'CONFIRMED')}
                className="editorial-btn editorial-btn-dark px-4 py-3"
              >
                Accept
              </button>
            </>
          )}
          {booking.canAdminReject && (
            <>
              <button
                type="button"
                onClick={() => handleStatusChange(booking.id, 'REJECTED', 'Reject this booking request?')}
                className="editorial-btn editorial-btn-subtle px-4 py-3"
              >
                Reject
              </button>
            </>
          )}
          {booking.canAdminAskReschedule && (
            <>
              <button
                type="button"
                onClick={() => handleStatusChange(booking.id, 'NEEDS_RESCHEDULE', 'Ask the student to pick a new time?')}
                className="editorial-btn editorial-btn-soft px-4 py-3"
              >
                Reschedule
              </button>
            </>
          )}

          {booking.canAdminCancel && booking.status === 'CONFIRMED' && (
            <button
              type="button"
              onClick={() => handleStatusChange(booking.id, 'CANCELLED', 'Cancel this confirmed appointment?')}
              className="editorial-btn editorial-btn-subtle px-4 py-3"
            >
              Cancel
            </button>
          )}

          {booking.displayStatus === 'Asked to Reschedule' && (
            <span className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--status-reschedule-text)]">
              Student needs to pick a new time
            </span>
          )}

          {booking.displayStatus === 'Expired' && (
            <span className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-secondary)]">
              Expired and non-actionable
            </span>
          )}
        </div>
      </div>
    );
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    window.location.href = '/admin/login';
  };

  return (
    <div className="page-shell section-light min-h-[calc(100vh-8rem)]">
      <div className="w-full max-w-7xl mx-auto overflow-x-hidden px-4 sm:px-6 lg:px-8 py-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-16"
      >
        <div className="surface-card editorial-border-left mb-12 flex flex-col gap-6 p-8 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[color:var(--btn-dark-bg)] text-2xl font-serif text-[color:var(--status-confirmed-text)]">
              {admin?.email?.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="section-heading text-3xl font-serif">Admin</h1>
              <p className="mt-1 text-sm uppercase tracking-[0.24em] text-[color:var(--text-secondary)]">{admin?.email}</p>
              <span className="booking-status booking-status--requested mt-2 inline-flex">
                Scheduling Control
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="editorial-btn editorial-btn-subtle self-start"
          >
            Sign Out
          </button>
        </div>

        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <h2 className="section-heading mb-4 text-4xl md:text-5xl font-serif">Admin Dashboard</h2>
            <p className="text-sm uppercase tracking-[0.28em] text-[color:var(--text-secondary)]">Compact horizontal scheduler and booking controls</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={refreshAdminData}
              className="editorial-btn editorial-btn-subtle"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('bookings')}
              className={clsx(
                'editorial-btn rounded-[6px] border px-5 py-3 text-sm uppercase tracking-[0.22em]',
                activeTab === 'bookings'
                  ? 'border-[color:var(--btn-dark-bg)] bg-[color:var(--btn-dark-bg)] text-[color:var(--status-confirmed-text)]'
                  : 'border-[color:var(--border-light)] bg-[color:var(--surface-elevated)] text-[color:var(--text-muted-dark)] hover:bg-[color:var(--status-expired-bg)]',
              )}
            >
              Bookings
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('slots')}
              className={clsx(
                'editorial-btn rounded-[6px] border px-5 py-3 text-sm uppercase tracking-[0.22em]',
                activeTab === 'slots'
                  ? 'border-[color:var(--btn-dark-bg)] bg-[color:var(--btn-dark-bg)] text-[color:var(--status-confirmed-text)]'
                  : 'border-[color:var(--border-light)] bg-[color:var(--surface-elevated)] text-[color:var(--text-muted-dark)] hover:bg-[color:var(--status-expired-bg)]',
              )}
            >
              Day Timeline
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('records')}
              className={clsx(
                'editorial-btn rounded-[6px] border px-5 py-3 text-sm uppercase tracking-[0.22em]',
                activeTab === 'records'
                  ? 'border-[color:var(--btn-dark-bg)] bg-[color:var(--btn-dark-bg)] text-[color:var(--status-confirmed-text)]'
                  : 'border-[color:var(--border-light)] bg-[color:var(--surface-elevated)] text-[color:var(--text-muted-dark)] hover:bg-[color:var(--status-expired-bg)]',
              )}
            >
              Daily Records
            </button>
          </div>
        </div>
      </motion.div>

      {activeTab === 'bookings' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <section className="surface-card-muted p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="section-heading text-2xl font-serif">Pending Requests</h3>
              <span className="booking-status booking-status--expired">
                {pendingBookings.length}
              </span>
            </div>
            <div className="space-y-4">
              {pendingBookings.length > 0 ? pendingBookings.map((booking) => (
                <div key={booking.id}>
                  <BookingCard booking={booking} />
                </div>
              )) : (
                <EmptyState label="No pending requests" />
              )}
            </div>
          </section>

          <section className="surface-card-muted p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="section-heading text-2xl font-serif">Active & Rescheduled</h3>
              <span className="booking-status booking-status--expired">
                {activeBookings.length}
              </span>
            </div>
            <div className="space-y-4">
              {activeBookings.length > 0 ? activeBookings.map((booking) => (
                <div key={booking.id}>
                  <BookingCard booking={booking} />
                </div>
              )) : (
                <EmptyState label="No active appointments" />
              )}
            </div>
          </section>

          <section className="surface-card-muted p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="section-heading text-2xl font-serif">Upcoming</h3>
              <span className="booking-status booking-status--expired">
                {upcomingBookings.length}
              </span>
            </div>
            <div className="space-y-4">
              {upcomingBookings.length > 0 ? upcomingBookings.map((booking) => (
                <div key={booking.id}>
                  <BookingCard booking={booking} />
                </div>
              )) : (
                <EmptyState label="No upcoming bookings" />
              )}
            </div>
          </section>

          <section className="surface-card-muted p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="section-heading text-2xl font-serif">Expired & Past</h3>
              <span className="booking-status booking-status--expired">
                {archivedBookings.length}
              </span>
            </div>
            <div className="space-y-4">
              {archivedBookings.length > 0 ? archivedBookings.map((booking) => (
                <div key={booking.id}>
                  <BookingCard booking={booking} />
                </div>
              )) : (
                <EmptyState label="No expired bookings" />
              )}
            </div>
          </section>
        </div>
      )}

      {activeTab === 'slots' && (
        <div className="space-y-8">
          <div className="surface-card p-6">
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0 space-y-6">
                <div>
                  <h3 className="section-heading mb-2 text-2xl font-serif">Schedule Controls</h3>
                  <p className="text-[color:var(--text-muted-dark)]">
                    Press, hold, and drag anywhere on the strip to sweep-select time. Then mark the whole selection unavailable or reopen part of a blocked section back to available.
                  </p>
                </div>

                <div>
                  <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-secondary)]">Stylist</p>
                  <div className="flex flex-wrap gap-3">
                    {stylists.map((stylist) => (
                      <button
                        key={stylist.id}
                        type="button"
                        onClick={() => {
                          setSelectedStylist(stylist.id);
                          setFocusedBookingId('');
                          setFocusedSlotId('');
                        }}
                        className={clsx(
                          'editorial-btn rounded-[6px] border px-5 py-3 text-sm uppercase tracking-[0.22em]',
                          selectedStylist === stylist.id
                            ? 'border-[color:var(--btn-dark-bg)] bg-[color:var(--btn-dark-bg)] text-[color:var(--status-confirmed-text)]'
                            : 'border-[color:var(--border-light)] bg-[color:var(--surface-elevated)] text-[color:var(--text-muted-dark)] hover:bg-[color:var(--status-expired-bg)]',
                        )}
                      >
                        {stylist.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-secondary)]">Date</p>
                  <div className="max-w-full overflow-x-auto pb-2">
                    <div className="flex w-max gap-3 pr-2">
                      {dates.map((date) => (
                        <button
                          key={date.toISOString()}
                          type="button"
                          onClick={() => setSelectedDate(date)}
                          className={clsx(
                            'surface-card min-w-[78px] sm:min-w-[92px] px-3 sm:px-4 py-4 text-center',
                            format(selectedDate, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
                              ? 'border-[color:var(--btn-dark-bg)] bg-[color:var(--btn-dark-bg)] text-[color:var(--status-confirmed-text)]'
                              : 'text-[color:var(--text-dark)]',
                          )}
                        >
                          <p className="text-xs uppercase tracking-[0.22em] mb-2">{format(date, 'EEE')}</p>
                          <p className="font-serif text-3xl leading-none">{format(date, 'd')}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="surface-card-muted h-fit w-full max-w-full p-5">
                <p className="mb-4 text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-secondary)]">Quick Actions</p>
                <div className="space-y-4">
                  <div className="surface-card p-4">
                    <p className="mb-2 text-[11px] uppercase tracking-[0.22em] text-[color:var(--accent-gold)]">Sweep Selection</p>
                    <p className="text-sm text-[color:var(--text-muted-dark)]">
                      Drag across any mix of green, blocked, red, or purple time to select that exact portion of the day.
                    </p>
                  </div>
                  <div className="surface-card p-4">
                    <p className="mb-2 text-[11px] uppercase tracking-[0.22em] text-[color:var(--accent-gold)]">Reopen Time</p>
                    <p className="text-sm text-[color:var(--text-muted-dark)]">
                      If part of the strip is already blocked, drag just that portion and use <span className="font-medium">Mark Available</span>.
                    </p>
                  </div>
                  <div className="surface-card p-4">
                    <p className="mb-2 text-[11px] uppercase tracking-[0.22em] text-[color:var(--accent-gold)]">Reschedule</p>
                    <p className="text-sm text-[color:var(--text-muted-dark)]">
                      Drag a booking pill onto a green start point to propose a new time to the student.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="surface-card p-6">
            <div className="mb-6 flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <h3 className="section-heading text-2xl font-serif">
                  {selectedDayStylist?.name || 'Stylist'} on {format(selectedDate, 'MMM d, yyyy')}
                </h3>
                <p className="mt-1 text-sm text-[color:var(--text-muted-dark)]">
                  Hover the strip to read the exact time, drag on the strip to select a full range, or drag a booking pill onto a green start point to propose a new time.
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
                      ref={timelineStripRef}
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
                        {currentScheduleSlots.map((slot) => {
                          const status = getTimelineSlotStatus(slot);
                          const canDrop = canDropBookingOnSlot(slot);

                          return (
                            <button
                              key={slot.id}
                              type="button"
                              onClick={() => {
                                setFocusedSlotId(slot.id);
                                setFocusedBookingId('');
                              }}
                              onMouseEnter={() => {
                                setHoveredTime({ time: slot.time, left: getTimelineLeft(slot.time) });
                              }}
                              onMouseMove={() => setHoveredTime({ time: slot.time, left: getTimelineLeft(slot.time) })}
                              onMouseDown={(event) => {
                                event.preventDefault();
                                setFocusedSlotId(slot.id);
                                setFocusedBookingId('');
                                setSelectedRange(null);
                                setDragSelection({
                                  anchorTime: slot.time,
                                  currentTime: slot.time,
                                  cursorX: event.clientX,
                                  cursorY: event.clientY,
                                });
                              }}
                              onDragOver={(event) => {
                                if (canDrop) {
                                  event.preventDefault();
                                  setDropTargetSlotId(slot.id);
                                }
                              }}
                              onDragLeave={() => {
                                if (dropTargetSlotId === slot.id) {
                                  setDropTargetSlotId('');
                                }
                              }}
                              onDrop={(event) => {
                                if (canDrop && draggingBookingId) {
                                  event.preventDefault();
                                  handleProposeNewTime(draggingBookingId, slot.id);
                                }
                              }}
                              className={clsx(
                                'relative h-[118px] border-r border-white/20 transition-all duration-150 first:rounded-l-[22px] last:rounded-r-[22px]',
                                getTrackCellClasses(status, canDrop),
                                focusedSlotId === slot.id && !focusedBookingId && 'ring-2 ring-[color:var(--accent-gold-border)] ring-inset',
                                dropTargetSlotId === slot.id && 'ring-2 ring-[color:var(--accent-gold)] ring-inset',
                              )}
                              style={{ width: CELL_WIDTH }}
                            >
                              <span className="sr-only">{slot.time}</span>
                            </button>
                          );
                        })}
                      </div>

                      {currentScheduleBookings.flatMap((booking) => (
                        getBookingOccupancyRanges(booking).map((range) => {
                          const canDrag = !isSelectedDatePast && range.type === 'current' && (
                            booking.status === 'CONFIRMED'
                            || booking.status === 'PENDING'
                            || booking.status === 'RESCHEDULE_PENDING'
                            || booking.status === 'RESCHEDULE_PROPOSED'
                          );

                          return (
                            <button
                              key={`${booking.id}-${range.type}`}
                              type="button"
                              draggable={canDrag}
                              onDragStart={() => {
                                setDraggingBookingId(booking.id);
                                setFocusedBookingId(booking.id);
                                setFocusedSlotId('');
                              }}
                              onDragEnd={() => {
                                setDraggingBookingId('');
                                setDropTargetSlotId('');
                              }}
                              onClick={() => {
                                setFocusedBookingId(booking.id);
                                setFocusedSlotId('');
                              }}
                              className={clsx(
                                  'absolute z-10 overflow-hidden border px-3 text-left shadow-sm',
                                  getStatusClasses(range.displayStatus),
                                  canDrag && 'cursor-grab active:cursor-grabbing',
                                  focusedBookingId === booking.id && 'ring-2 ring-[color:var(--accent-gold-border)]',
                              )}
                              style={{
                                left: `${getTimelineLeft(range.startTime) + 8}px`,
                                top: BOOKING_BLOCK_TOP,
                                width: `${((range.endMinutes - range.startMinutes) / SLOT_INTERVAL_MINUTES) * CELL_WIDTH}px`,
                                height: BOOKING_BLOCK_HEIGHT,
                              }}
                            >
                              <span className="block truncate text-[11px] uppercase tracking-[0.2em]">
                                {booking.student?.name || 'Booking'}
                              </span>
                              <span className="block truncate text-xs">{formatTimeRange(range.startTime, range.endTime)}</span>
                            </button>
                          );
                        })
                      ))}

                      {activeRange && (
                        <div
                          className="timeline-range-overlay pointer-events-none absolute bottom-2 top-2 z-20 rounded-[20px] border-2 shadow-lg"
                          style={{
                            left: `${getTimelineLeft(activeRange.startTime) + 8}px`,
                            width: `${((timeToMinutes(activeRange.endTime) - timeToMinutes(activeRange.startTime)) / SLOT_INTERVAL_MINUTES) * CELL_WIDTH}px`,
                          }}
                        />
                      )}
                    </div>
                  </div>
                </div>

                {dragRange && (
                  <div
                    className="timeline-tooltip pointer-events-none fixed z-50 px-3 py-2 text-[11px] uppercase tracking-[0.22em] shadow-2xl"
                    style={{ left: dragRange.cursorX + 14, top: dragRange.cursorY - 44 }}
                  >
                    {activeRange ? formatTimeRange(activeRange.startTime, activeRange.endTime) : 'Selecting range'}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="surface-card-muted min-w-0 p-5">
                    {focusedBooking ? (
                      <>
                        <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-secondary)]">Focused booking</p>
                        <div className="flex flex-wrap items-center gap-3 mb-4">
                          <span className="font-serif text-3xl text-[color:var(--text-dark)]">{focusedBooking.student?.name || 'Booking'}</span>
                          <span className={clsx(
                            '',
                            focusedBooking.status === 'PENDING'
                              ? 'booking-status booking-status--requested'
                              : focusedBooking.status === 'NEEDS_RESCHEDULE' || focusedBooking.status === 'RESCHEDULE_PENDING' || focusedBooking.status === 'RESCHEDULE_PROPOSED'
                                ? 'booking-status booking-status--reschedule'
                                : 'booking-status booking-status--confirmed',
                          )}
                          >
                            {getScheduleBookingStatusLabel(focusedBooking.status)}
                          </span>
                        </div>
                        <div className="mb-5 space-y-2 text-[color:var(--text-muted-dark)]">
                          <p>{formatTimeRange(focusedBooking.start_time, focusedBooking.end_time)}</p>
                          <p>{focusedBooking.services?.map((service) => service.name).join(', ')}</p>
                          <p>{isSelectedDatePast ? 'Past-day bookings are read-only.' : 'Drag this block to a green start point to propose a new time.'}</p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          {!isSelectedDatePast && (focusedBooking.status === 'CONFIRMED' || focusedBooking.status === 'PENDING' || focusedBooking.status === 'RESCHEDULE_PENDING') && (
                            <button
                              type="button"
                              onClick={() => handleStatusChange(focusedBooking.id, 'NEEDS_RESCHEDULE', 'Ask the student to choose a new time?')}
                              className="editorial-btn editorial-btn-soft px-4 py-3"
                            >
                              Ask to Reschedule
                            </button>
                          )}
                          {!isSelectedDatePast && focusedBooking.status === 'PENDING' && (
                            <button
                              type="button"
                              onClick={() => handleStatusChange(focusedBooking.id, 'CONFIRMED')}
                              className="editorial-btn editorial-btn-dark px-4 py-3"
                            >
                              Confirm Now
                            </button>
                          )}
                        </div>
                      </>
                    ) : focusedSlot ? (
                      <>
                        <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-secondary)]">Focused segment</p>
                        <div className="flex flex-wrap items-center gap-3 mb-4">
                          <span className="font-serif text-3xl text-[color:var(--text-dark)]">{focusedSlot.time}</span>
                          <span className={clsx(
                            '',
                            getStatusClasses(getTimelineSlotStatus(focusedSlot)),
                          )}
                          >
                            {getTimelineSlotStatus(focusedSlot) === 'BOOKED' && 'Already Booked'}
                            {getTimelineSlotStatus(focusedSlot) === 'AVAILABLE' && 'Available'}
                            {getTimelineSlotStatus(focusedSlot) === 'UNAVAILABLE' && 'Unavailable'}
                            {getTimelineSlotStatus(focusedSlot) === 'RESCHEDULED' && 'Rescheduled'}
                          </span>
                        </div>
                        <p className="mb-5 text-[color:var(--text-muted-dark)]">
                          Drag from this segment to sweep across a larger section of the day, or use the quick action below for this single 5-minute segment.
                        </p>
                        <div className="flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedRange({
                                startTime: focusedSlot.time,
                                endTime: addMinutes(focusedSlot.time, schedule?.meta.stepMinutes ?? SLOT_INTERVAL_MINUTES),
                              });
                            }}
                            disabled={isSelectedDatePast}
                            className="editorial-btn editorial-btn-soft px-4 py-3 disabled:opacity-45"
                          >
                            Select This Segment
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const status = getTimelineSlotStatus(focusedSlot) === 'UNAVAILABLE' ? 'AVAILABLE' : 'UNAVAILABLE';
                              handleSingleSegmentStatus(focusedSlot, status);
                            }}
                            disabled={isSelectedDatePast}
                            className="editorial-btn editorial-btn-subtle px-4 py-3 disabled:opacity-45"
                          >
                            {getTimelineSlotStatus(focusedSlot) === 'UNAVAILABLE' ? 'Mark Available' : 'Mark Unavailable'}
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="text-[color:var(--text-secondary)]">Select a booking or time segment to see actions here.</p>
                    )}
                  </div>

                  <div className="surface-card min-w-0 p-5">
                    <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-secondary)]">Range actions</p>
                    {activeRange ? (
                      <>
                        <p className="mb-2 font-serif text-2xl text-[color:var(--text-dark)]">
                          {formatTimeRange(activeRange.startTime, activeRange.endTime)}
                        </p>
                        <p className="mb-2 text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-secondary)]">
                          {activeRangeMinutes} minutes selected
                        </p>
                        <p className="mb-5 text-sm text-[color:var(--text-muted-dark)]">
                          {isSelectedDatePast
                            ? 'Past-day timelines are read-only.'
                            : 'Use this swept selection to block multiple timeline segments at once or reopen just a portion of an unavailable section.'}
                        </p>
                        <div className="flex flex-col gap-3">
                          <button
                            type="button"
                            onClick={() => handleApplyRangeStatus('UNAVAILABLE')}
                            disabled={isSelectedDatePast}
                            className="editorial-btn editorial-btn-soft px-4 py-3 disabled:opacity-45"
                          >
                            Mark Unavailable
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApplyRangeStatus('AVAILABLE')}
                            disabled={isSelectedDatePast}
                            className="editorial-btn editorial-btn-dark px-4 py-3 disabled:opacity-45"
                          >
                            Mark Available
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedRange(null);
                              setDragSelection(null);
                            }}
                            className="editorial-btn editorial-btn-subtle px-4 py-3"
                          >
                            Clear Selection
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="space-y-3 text-sm text-[color:var(--text-muted-dark)]">
                        <p>Press, hold, and drag anywhere on the strip to sweep-select a time range.</p>
                        <p>You can sweep across blocked time too, then mark just that portion available again.</p>
                        <p>Dragging a booking block to a green slot sends a reschedule proposal to the student.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState label="Select a stylist to load the timeline" />
            )}
          </div>
        </div>
      )}

      {activeTab === 'records' && (
        <div className="space-y-8">
          <div className="surface-card p-6">
            <div className="flex min-w-0 flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="min-w-0">
                <p className="mb-2 text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-secondary)]">Daily Booking Register</p>
                <h3 className="section-heading text-2xl font-serif">Booking Record For One Day</h3>
                <p className="mt-1 text-sm text-[color:var(--text-muted-dark)]">
                  This view keeps the selected day’s bookings in one place. Past-day rows are informational only.
                </p>
              </div>

              <div className="max-w-full overflow-x-auto pb-2">
                <div className="flex w-max gap-3 pr-2">
                  {dates.map((date) => (
                    <button
                      key={date.toISOString()}
                      type="button"
                      onClick={() => setSelectedDate(date)}
                      className={clsx(
                        'surface-card min-w-[78px] sm:min-w-[92px] px-3 sm:px-4 py-4 text-center',
                        format(selectedDate, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
                          ? 'border-[color:var(--btn-dark-bg)] bg-[color:var(--btn-dark-bg)] text-[color:var(--status-confirmed-text)]'
                          : 'text-[color:var(--text-dark)]',
                      )}
                    >
                      <p className="text-xs uppercase tracking-[0.22em] mb-2">{format(date, 'EEE')}</p>
                      <p className="font-serif text-3xl leading-none">{format(date, 'd')}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
            <div className="surface-card p-6 h-fit">
              <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-secondary)]">Day Summary</p>
              <div className="space-y-5">
                <div>
                  <p className="mb-1 text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-secondary)]">Date</p>
                  <p className="font-serif text-2xl text-[color:var(--text-dark)]">{format(selectedDate, 'MMM d, yyyy')}</p>
                </div>
                <div>
                  <p className="mb-1 text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-secondary)]">Bookings On Day</p>
                  <p className="font-serif text-4xl text-[color:var(--text-dark)]">{dailyRecords.length}</p>
                </div>
                <div>
                  <p className="mb-1 text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-secondary)]">Window</p>
                  <p className="text-sm text-[color:var(--text-muted-dark)]">10:00 AM to 8:00 PM</p>
                </div>
              </div>
            </div>

            <div className="surface-card min-w-0 p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="mb-1 text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-secondary)]">Day Register</p>
                  <h4 className="section-heading text-2xl font-serif">Appointment Log</h4>
                </div>
                <span className="booking-status booking-status--expired">
                  {format(selectedDate, 'EEE, MMM d')}
                </span>
              </div>

              {loadingRecords ? (
                <EmptyState label="Loading booking records" />
              ) : dailyRecords.length > 0 ? (
                <div className="space-y-4">
                  {dailyRecords.map((booking) => {
                    const durationMinutes = getAdminBookingDuration(booking);
                    return (
                      <div key={booking.id} className={clsx('booking-card p-5', getBookingCardTone(booking))}>
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <p className="mb-2 text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-secondary)]">Student</p>
                            <h5 className="font-serif text-2xl text-[color:var(--text-dark)]">{booking.student.name}</h5>
                            <p className="mt-1 text-sm text-[color:var(--text-muted-dark)]">{booking.student.email}</p>
                            {booking.student.phone_display ? (
                              <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-secondary)]">{booking.student.phone_display}</p>
                            ) : null}
                          </div>
                          <div className="text-right">
                            <span className={clsx(getBookingCardStatus(booking))}>
                              {booking.displayStatus}
                            </span>
                            <p className="mt-3 font-serif text-2xl text-[color:var(--text-dark)]">
                              {formatTimeRange(booking.slot.time, addMinutes(booking.slot.time, durationMinutes))}
                            </p>
                          </div>
                        </div>

                        <div className="mt-5 grid grid-cols-1 gap-4 text-sm text-[color:var(--text-muted-dark)] md:grid-cols-3">
                          <div>
                            <p className="mb-1 text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-secondary)]">Stylist</p>
                            <p>{booking.stylist.name}</p>
                          </div>
                          <div>
                            <p className="mb-1 text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-secondary)]">Services</p>
                            <p>{booking.services.map((service) => service.name).join(', ')}</p>
                          </div>
                          <div>
                            <p className="mb-1 text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-secondary)]">Duration</p>
                            <p>{durationMinutes} mins</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState label="No bookings recorded for this day" />
              )}
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={handleUndoLatest}
        disabled={undoStack.length === 0}
        aria-label="Undo latest admin action"
        title={undoStack.length > 0 ? 'Undo latest admin action' : 'No undo actions available'}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full border border-[color:var(--accent-gold-border)] bg-[color:var(--btn-dark-bg)] text-[color:var(--accent-gold)] shadow-[0_18px_45px_rgba(28,25,23,0.22)] transition hover:bg-[color:var(--bg-elevated)] disabled:border-[color:var(--border-light)] disabled:bg-[color:var(--status-expired-bg)] disabled:text-[color:var(--text-secondary)] disabled:shadow-none"
      >
        <Undo2 className="h-5 w-5" strokeWidth={2.2} />
      </button>
      </div>
    </div>
  );
}


'use client';
import { useState, useCallback, useEffect, useMemo } from 'react';
import React from 'react';
import Image from 'next/image';
import { logoBase64 } from '@/lib/logo-data';
import { BookingForm } from '@/components/booking-form';
import { AvailabilityCalendar } from '@/components/availability-calendar';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { DailyAvailability, Colonia, Clinic, Holiday, SpecialActionDay, ServiceType, Specialty } from '@/lib/definitions';
import { PatientType, BookingMode } from '@/lib/definitions';
import { getAppointments, getClinics, getHolidays, verifyCitasMedicasPassword, getSpecialActionDays, getServiceTypes } from '@/lib/actions';

import { useToast } from '@/hooks/use-toast';
import { Hospital, LayoutList, CalendarDays, CalendarPlus, Check, Loader2, RefreshCw, MapPin, Clock } from 'lucide-react';
import { format, eachDayOfInterval, isSaturday, isSunday, startOfToday, addDays, isSameDay, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { ModuleLoginForm } from '@/components/shared/module-login-form';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

type PageContentProps = {
    initialAnnouncements: string[];
    initialColonias: Colonia[];
    initialClinics: Clinic[];
    initialHolidays: Holiday[];
    initialSpecialActionDays: SpecialActionDay[];
    initialServiceTypes: ServiceType[];
    initialSpecialties: Specialty[];
};

export default function PageContent({ 
    initialAnnouncements, 
    initialColonias, 
    initialClinics, 
    initialServiceTypes,
}: PageContentProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  const [selectedServiceTypeId, setSelectedServiceTypeId] = React.useState<string | undefined>();
  const [selectedClinicId, setSelectedClinicId] = React.useState<string | undefined>();
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>();
  const [selectedColoniaId, setSelectedColoniaId] = React.useState<string | undefined>();
  const [patientType, setPatientType] = React.useState<PatientType>(PatientType.General);
  const [isDoubleSlot, setIsDoubleSlot] = React.useState(false);
  const [selectedTime, setSelectedTime] = React.useState<string | undefined>();
  
  const [availabilityCache, setAvailabilityCache] = useState<Record<string, boolean>>({});
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  
  const [availability, setAvailability] = React.useState<DailyAvailability[]>([]);
  const [announcements] = React.useState<string[]>(initialAnnouncements);
  const [colonias] = React.useState<Colonia[]>(initialColonias);
  const [clinics] = React.useState<Clinic[]>(initialClinics);
  const [serviceTypes] = React.useState<ServiceType[]>(initialServiceTypes);
  
  const [currentMonth, setCurrentMonth] = React.useState(new Date());
  const { toast } = useToast();

  const normalize = useCallback((val: any): string => {
    if (val === null || val === undefined) return "";
    const str = String(val);
    try {
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
    } catch (e) {
        return str.toUpperCase().trim();
    }
  }, []);

  const generateDynamicTimeSlots = React.useCallback((startTimeStr: string, endTimeStr: string, duration: number): string[] => {
    const startHour = startTimeStr || "08:00";
    const endHour = endTimeStr || "14:00";
    const slotDuration = duration || 30;
    const slots: string[] = [];
    try {
        const [sH, sM] = startHour.split(':').map(Number);
        const [eH, eM] = endHour.split(':').map(Number);
        let current = new Date(1970, 0, 1, sH, sM);
        const end = new Date(1970, 0, 1, eH, eM);
        while (current < end) {
            slots.push(current.toTimeString().substring(0, 5));
            current = new Date(current.getTime() + slotDuration * 60000);
        }
    } catch (e) {}
    return slots;
  }, []);

  const calculateForClinic = useCallback((clinic: Clinic, startDate: Date, endDate: Date, allAppointments: any[], holidaySet: Set<string>, freshSpecialActionDays: SpecialActionDay[]): DailyAvailability[] => {
      const dayClinicMap = new Map<string, any[]>();
      
      allAppointments.forEach(app => {
          if (!app.date || !app.clinicId || app.clinicId !== clinic.id) return;
          const d = format(parseISO(app.date), 'yyyy-MM-dd');
          if (!dayClinicMap.has(d)) dayClinicMap.set(d, []);
          dayClinicMap.get(d)!.push(app);
      });

      const dayNames = ["DOMINGO", "LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO"];
      const availabilityResult: DailyAvailability[] = [];
      const daysInInterval = eachDayOfInterval({ start: startDate, end: endDate });

      const clinicServiceTypeName = normalize(serviceTypes.find(t => t.id === clinic.serviceTypeId)?.name || clinic.serviceTypeId);

      for (const day of daysInInterval) {
        const dateString = format(day, 'yyyy-MM-dd'); 
        const dayBooked = dayClinicMap.get(dateString) || [];
        const dayName = dayNames[day.getDay()];
        
        const isHoliday = holidaySet.has(dateString);
        const isWeekend = isSaturday(day) || isSunday(day);
        
        const isSpecialActionDay = freshSpecialActionDays.some(sad => 
            sad.date === dateString && 
            (normalize(sad.clinicType) === clinicServiceTypeName || 
             normalize(sad.clinicType) === "CONSULTA EXTERNA")
        );

        const isDateBlocked = clinic.unavailableDates?.includes(dateString);
        const isWeekendBlocked = isWeekend && !clinic.weekendBookingEnabled;
        
        const effectiveDaysOfAction = (clinic.daysOfAction && clinic.daysOfAction.length > 0)
            ? clinic.daysOfAction.map(d => normalize(d))
            : ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES"];
            
        const isActionDay = !effectiveDaysOfAction.includes(dayName);
        const isBlocked = isDateBlocked || isHoliday || isWeekendBlocked || isSpecialActionDay || isActionDay;

        let availableSlotsForClinic = 0;
        let takenInfo = dayBooked.map(a => ({ time: a.time, duration: a.duration }));

        if (!isBlocked) {
            const customSchedule = clinic.customSchedules?.find(s => s.date === dateString);
            const currentEndTime = customSchedule ? customSchedule.endTime : (clinic.endTime || "14:00");
            const currentStartTime = clinic.startTime || "08:00";
            const currentDuration = clinic.consultationDuration || 30;

            if (clinic.bookingMode === BookingMode.Time) {
                const allSlots = generateDynamicTimeSlots(currentStartTime, currentEndTime, currentDuration);
                const filteredSlots = allSlots.filter(s => s !== clinic.breakTime);
                availableSlotsForClinic = Math.max(0, filteredSlots.length - dayBooked.length);
            } else {
                const totalSlots = (clinic.dailySlots || 15) + (clinic.waitlistSlots || 0);
                availableSlotsForClinic = Math.max(0, totalSlots - dayBooked.length);
            }
        }

        availabilityResult.push({ 
            date: dateString, 
            availableSlots: availableSlotsForClinic, 
            availabilityByClinic: { [clinic.id]: availableSlotsForClinic }, 
            takenTimesByClinic: { [clinic.id]: takenInfo } 
        });
      }
      return availabilityResult;
  }, [generateDynamicTimeSlots, serviceTypes, normalize]);

  const fetchAvailabilityForRange = React.useCallback(async (targetClinicId: string, startDate: Date, endDate: Date, cacheKey: string) => {
      setIsLoadingAvailability(true);
      try {
          // CONSULTA ESPECÍFICA MEDIANTE FILTRADO HÍBRIDO: Fidelidad total por consultorio
          const [allAppointments, freshHolidays, freshSpecialActionDays] = await Promise.all([
            getAppointments({ 
                startDate: startDate.toISOString(), 
                endDate: endDate.toISOString(),
                clinicId: targetClinicId 
            }), 
            getHolidays(), 
            getSpecialActionDays()
          ]);
          
          const holidaySet = new Set(freshHolidays.map(h => h.date));
          const targetClinic = clinics.find(c => c.id === targetClinicId);
          
          if (targetClinic) {
              const targetAvail = calculateForClinic(targetClinic, startDate, endDate, allAppointments, holidaySet, freshSpecialActionDays);
              setAvailability(prev => {
                  const combined = [...prev];
                  targetAvail.forEach(item => {
                      const idx = combined.findIndex(c => c.date === item.date);
                      if (idx >= 0) {
                          combined[idx] = {
                              ...combined[idx],
                              availabilityByClinic: { ...combined[idx].availabilityByClinic, [targetClinicId]: item.availabilityByClinic[targetClinicId] },
                              takenTimesByClinic: { ...combined[idx].takenTimesByClinic, [targetClinicId]: item.takenTimesByClinic[targetClinicId] },
                              availableSlots: item.availableSlots 
                          };
                      }
                      else combined.push(item);
                  });
                  return combined.sort((a,b) => a.date.localeCompare(b.date));
              });
              setAvailabilityCache(prev => ({ ...prev, [cacheKey]: true }));
          }
      } catch (e) {
          console.error("Fetch availability error", e);
      } finally {
          setIsLoadingAvailability(false); 
      }
  }, [clinics, calculateForClinic]);

  React.useEffect(() => {
    if (isAuthenticated && selectedClinicId) {
        // CARGA PROACTIVA: Sincroniza bloques mensuales para garantizar visibilidad 100%
        const today = startOfToday();
        const endOfRange = addDays(today, 14);
        
        const monthsToFetch = [startOfMonth(today)];
        if (format(today, 'MM') !== format(endOfRange, 'MM')) {
            monthsToFetch.push(startOfMonth(endOfRange));
        }

        monthsToFetch.forEach(monthDate => {
            const start = startOfMonth(monthDate);
            const end = endOfMonth(monthDate);
            const cacheKey = `${selectedClinicId}-${format(start, 'yyyy-MM')}`;
            
            if (!availabilityCache[cacheKey]) {
                fetchAvailabilityForRange(selectedClinicId, start, end, cacheKey);
            }
        });

        // También sincronizar el mes que el usuario esté viendo en el calendario manual
        const calMonthStart = startOfMonth(currentMonth);
        const calCacheKey = `${selectedClinicId}-${format(calMonthStart, 'yyyy-MM')}`;
        if (!availabilityCache[calCacheKey]) {
            fetchAvailabilityForRange(selectedClinicId, calMonthStart, endOfMonth(currentMonth), calCacheKey);
        }
    }
  }, [isAuthenticated, selectedClinicId, currentMonth, availabilityCache, fetchAvailabilityForRange]);

  const handleMonthChange = (monthDate: Date) => {
    setCurrentMonth(monthDate);
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (date && date < startOfToday()) {
        toast({ title: 'Fecha no válida', description: 'No puedes agendar en el pasado.', variant: 'destructive' });
        return;
    }
    setSelectedDate(date);
    setSelectedTime(undefined);
  };

  const handleClinicSelect = (clinicId: string) => {
    setSelectedClinicId(clinicId);
    setSelectedDate(undefined);
    setSelectedColoniaId(undefined);
    setSelectedTime(undefined);
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const cacheKey = `${clinicId}-${format(start, 'yyyy-MM')}`;
    fetchAvailabilityForRange(clinicId, start, end, cacheKey);
  };

  const selectedClinic = useMemo(() => clinics.find(c => c.id === selectedClinicId), [selectedClinicId, clinics]);
  const selectedColonia = useMemo(() => colonias.find(c => c.id === selectedColoniaId), [selectedColoniaId, colonias]);
  
  const clinicOptions = React.useMemo(() => {
    if (!selectedServiceTypeId) return [];
    return clinics
        .filter(c => c.serviceTypeId === selectedServiceTypeId)
        .map(clinic => ({ 
            value: clinic.id, 
            label: clinic.name,
            doctor: clinic.doctorName
        })).sort((a,b) => a.label.localeCompare(b.label));
  }, [clinics, selectedServiceTypeId]);

  const projectedGridData = useMemo(() => {
    if (!selectedClinicId) return [];
    const today = startOfToday();
    const range = Array.from({ length: 14 }, (_, i) => addDays(today, i));
    return range.map(date => {
        const dateStr = format(date, 'yyyy-MM-dd');
        const avail = availability.find(a => a.date === dateStr);
        const clinicSlots = avail?.availabilityByClinic[selectedClinicId];
        
        return { 
            date, 
            dateStr, 
            slots: clinicSlots ?? 0, 
            isClosed: avail ? clinicSlots === 0 : false,
            isLoading: !avail && isLoadingAvailability
        };
    });
  }, [selectedClinicId, availability, isLoadingAvailability]);

  const availableTimeSlots = React.useMemo(() => {
    if (!selectedClinic || !selectedDate || selectedClinic.bookingMode !== BookingMode.Time) return [];
    const dateString = format(selectedDate, 'yyyy-MM-dd');
    const dayAvail = availability.find(d => d.date === dateString);
    if (!dayAvail) return [];

    const booked = dayAvail.takenTimesByClinic[selectedClinic.id] || [];
    const customSchedule = selectedClinic.customSchedules?.find(s => s.date === dateString);
    const endTime = customSchedule ? customSchedule.endTime : (selectedClinic.endTime || "14:00");
    const startTime = selectedClinic.startTime || "08:00";
    const duration = selectedClinic.consultationDuration || 30;
    
    const allSlots = generateDynamicTimeSlots(startTime, endTime, duration);
    const slots = allSlots.filter(s => s !== selectedClinic.breakTime && !booked.some(a => a.time === s));

    if (patientType === PatientType.Embarazada && isDoubleSlot) {
        return slots.filter((slot) => {
            const slotIndex = allSlots.indexOf(slot);
            const nextSlot = allSlots[slotIndex + 1];
            return nextSlot && nextSlot !== selectedClinic.breakTime && !booked.some(a => a.time === nextSlot);
        });
    }
    return slots;
  }, [selectedClinic, availability, selectedDate, generateDynamicTimeSlots, patientType, isDoubleSlot]);

  const availableTokens = React.useMemo(() => {
    if (!selectedClinic || !selectedDate || selectedClinic.bookingMode !== BookingMode.Token) return [];
    const dateString = format(selectedDate, 'yyyy-MM-dd');
    const dayAvail = availability.find(d => d.date === dateString);
    if (!dayAvail) return [];

    const booked = dayAvail.takenTimesByClinic[selectedClinic.id] || [];
    const totalSlots = (selectedClinic.dailySlots || 15) + (selectedClinic.waitlistSlots || 0);
    const allTokens = Array.from({ length: totalSlots }, (_, i) => `Ficha ${i + 1}`);
    const freeTokens = allTokens.filter(t => !booked.some(a => a.time === t));

    if (patientType === PatientType.Embarazada && isDoubleSlot) {
        return freeTokens.filter((token) => {
            const tokenNum = parseInt(token.split(' ')[1]);
            const nextToken = `Ficha ${tokenNum + 1}`;
            return freeTokens.includes(nextToken);
        });
    }
    return freeTokens;
  }, [selectedClinic, availability, selectedDate, patientType, isDoubleSlot]);

  const filteredColonias = React.useMemo(() => {
    if (!selectedClinicId) return [];
    return colonias.filter(c => c.clinicId === selectedClinicId).sort((a,b) => a.name.localeCompare(b.name));
  }, [colonias, selectedClinicId]);

  const calendarAvailability = useMemo(() => {
    if (!selectedClinicId) return availability;
    return availability.map(day => ({
        ...day,
        availableSlots: day.availabilityByClinic[selectedClinicId] ?? 0
    }));
  }, [availability, selectedClinicId]);

  if (!isAuthenticated) return <ModuleLoginForm title="Citas Médicas" onVerify={verifyCitasMedicasPassword} onSuccess={() => setIsAuthenticated(true)} />;

  return (
    <div className="container mx-auto px-4 py-8 md:py-12">
      <div className="text-center mb-10 flex flex-col items-center">
        <div className="text-primary mb-4"><Image src={logoBase64} alt="Logo" width={80} height={80} className="rounded-md" /></div>
        <h1 className="text-4xl lg:text-5xl font-bold font-headline text-foreground tracking-tight uppercase">Reserva tu Cita Médica</h1>
        <p className="text-muted-foreground mt-2 font-medium max-w-2xl mx-auto">Sigue los pasos para agendar tu consulta de forma segura.</p>
      </div>

      <div className="grid lg:grid-cols-12 gap-8 max-w-7xl mx-auto">
          <div className="lg:col-span-4 space-y-6">
              <Card className="shadow-lg border-primary/10 overflow-hidden">
                <CardContent className="p-6 space-y-8">
                    <div className="space-y-4">
                        <h3 className="text-lg font-black uppercase text-primary tracking-widest flex items-center gap-2"><LayoutList className="h-5 w-5" /> 1. Categoría</h3>
                        <Select onValueChange={setSelectedServiceTypeId} value={selectedServiceTypeId}>
                            <SelectTrigger className="h-12 text-base font-bold"><SelectValue placeholder="Elige el servicio..." /></SelectTrigger>
                            <SelectContent>{serviceTypes.map(t => <SelectItem key={t.id} value={t.id} className="font-bold">{t.name}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>

                    {selectedServiceTypeId && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
                            <h3 className="text-lg font-black uppercase text-primary tracking-widest flex items-center justify-between">
                                <span className="flex items-center gap-2"><Hospital className="h-5 w-5" /> 2. Consultorio</span>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => handleClinicSelect(selectedClinicId!)}><RefreshCw className={cn("h-4 w-4", isLoadingAvailability && "animate-spin")} /></Button>
                            </h3>
                            <div className="grid gap-2">
                                {clinicOptions.map(opt => (
                                    <button key={opt.value} onClick={() => handleClinicSelect(opt.value)} className={cn("w-full p-4 rounded-xl border-2 text-left transition-all group", selectedClinicId === opt.value ? "bg-primary border-primary text-white shadow-md ring-2 ring-primary/20 scale-[1.02]" : "bg-background border-muted hover:border-primary/40 hover:bg-muted/30")}>
                                        <div className="flex justify-between items-start">
                                            <div><p className="font-black text-sm uppercase leading-none">{opt.label}</p><p className={cn("text-[10px] mt-1 font-bold uppercase", selectedClinicId === opt.value ? "text-white/70" : "text-muted-foreground group-hover:text-primary")}>Dr. {opt.doctor}</p></div>
                                            {selectedClinicId === opt.value && <Check className="h-5 w-5 text-white" />}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </CardContent>
              </Card>
          </div>

          <div className="lg:col-span-8 space-y-8">
              {!selectedClinicId ? (
                  <div className="h-full min-h-[500px] flex flex-col items-center justify-center border-2 border-dashed rounded-[2.5rem] opacity-20 bg-muted/5">
                      <CalendarPlus className="h-20 w-20 mb-4" />
                      <p className="text-2xl font-black uppercase tracking-widest">Espera de Selección</p>
                  </div>
              ) : (
                  <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
                      <Card className="shadow-xl border-primary/10 overflow-hidden rounded-[2.5rem] relative">
                          <CardHeader className="bg-primary/5 pb-4 border-b border-primary/5">
                               <div className="flex items-center justify-between">
                                    <CardTitle className="text-xl font-black uppercase text-primary tracking-wider flex items-center gap-2"><CalendarDays className="h-6 w-6" /> 3. DISPONIBILIDAD PRÓXIMAS 2 SEMANAS</CardTitle>
                                    <Badge variant="outline" className="font-bold bg-background uppercase">Cupo en {selectedClinic?.name}</Badge>
                               </div>
                          </CardHeader>
                          <CardContent className="p-8 min-h-[300px] relative">
                              {isLoadingAvailability && <div className="absolute inset-0 z-50 bg-background/60 backdrop-blur-[2px] flex flex-col items-center justify-center rounded-[2rem]"><Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="text-xs font-black uppercase tracking-widest mt-4 text-primary animate-pulse">Sincronizando Agenda...</p></div>}
                              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
                                  {projectedGridData.map((item) => (
                                      <button key={item.dateStr} onClick={() => handleDateSelect(item.date)} disabled={item.isClosed || item.isLoading} className={cn("relative flex flex-col items-center p-3 rounded-2xl border-2 transition-all group", isSameDay(selectedDate || new Date(0), item.date) ? "bg-primary border-primary text-white shadow-lg ring-4 ring-primary/10 scale-105 z-10" : (item.isClosed) ? "bg-muted/30 border-muted opacity-40 cursor-not-allowed grayscale" : "bg-background border-muted hover:border-primary/40 hover:bg-primary/5", item.isLoading && "animate-pulse")}>
                                          <span className={cn("text-[9px] font-black uppercase tracking-tighter mb-1", isSameDay(selectedDate || new Date(0), item.date) ? "text-white/60" : "text-muted-foreground")}>{format(item.date, 'EEEE', { locale: es })}</span>
                                          <span className="text-lg font-black leading-none">{format(item.date, 'dd')}</span>
                                          <span className={cn("text-[9px] font-bold uppercase", isSameDay(selectedDate || new Date(0), item.date) ? "text-white/80" : "text-muted-foreground")}>{format(item.date, 'MMM', { locale: es })}</span>
                                          {!item.isClosed ? <Badge className={cn("mt-2 text-[9px] font-black w-full justify-center px-1", isSameDay(selectedDate || new Date(0), item.date) ? "bg-white text-primary" : item.slots > 5 ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700")}>{item.slots} LIBRES</Badge> : <Badge variant="ghost" className="mt-2 text-[9px] font-black text-muted-foreground">CERRADO</Badge>}
                                      </button>
                                  ))}
                              </div>
                              <div className="mt-8 flex justify-center">
                                    <Popover>
                                        <PopoverTrigger asChild><Button variant="outline" className="h-10 px-8 font-bold border-dashed border-primary/40 text-primary">Buscar otra fecha en el Calendario</Button></PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="center"><AvailabilityCalendar selectedDate={selectedDate} onDateSelect={handleDateSelect} availability={calendarAvailability} onMonthChange={handleMonthChange} isLoading={isLoadingAvailability} /></PopoverContent>
                                    </Popover>
                              </div>
                          </CardContent>
                      </Card>

                      {selectedDate && (
                          <Card className="shadow-xl border-primary/20 animate-in fade-in slide-in-from-bottom-6 duration-700 rounded-[2.5rem]">
                              <CardContent className="p-10 space-y-10">
                                  <div className="grid md:grid-cols-2 gap-10">
                                      <div className="space-y-4">
                                          <h3 className="text-lg font-black uppercase text-primary tracking-widest flex items-center gap-2"><MapPin className="h-5 w-5" /> 4. Tu Localidad</h3>
                                          <Select onValueChange={setSelectedColoniaId} value={selectedColoniaId}>
                                              <SelectTrigger className="h-12 text-base font-bold border-primary/20"><SelectValue placeholder="Busca tu colonia..." /></SelectTrigger>
                                              <SelectContent>{filteredColonias.length > 0 ? (filteredColonias.map(c => <SelectItem key={c.id} value={c.id} className="font-bold uppercase text-xs">{c.name}</SelectItem>)) : (<div className="p-4 text-center text-sm text-muted-foreground italic">No hay localidades vinculadas.</div>)}</SelectContent>
                                          </Select>
                                      </div>
                                      <div className="space-y-4">
                                          <h3 className="text-lg font-black uppercase text-primary tracking-widest flex items-center gap-2">Tipo de Paciente</h3>
                                          <Select onValueChange={(v: PatientType) => setPatientType(v)} value={patientType}>
                                              <SelectTrigger className="h-12 text-base font-bold"><SelectValue /></SelectTrigger>
                                              <SelectContent>{Object.values(PatientType).map(t => <SelectItem key={t} value={t} className="font-bold">{t}</SelectItem>)}</SelectContent>
                                          </Select>
                                          {patientType === PatientType.Embarazada && (<div className="flex items-center space-x-2 p-3 bg-pink-50 border border-pink-100 rounded-xl"><Checkbox id="d-slot" checked={isDoubleSlot} onCheckedChange={(v) => setIsDoubleSlot(!!v)} /><Label htmlFor="d-slot" className="text-xs font-black text-pink-700 uppercase">Solicitar Horario Doble</Label></div>)}
                                      </div>
                                  </div>
                                  <Separator className="opacity-50" />
                                  {(selectedColoniaId || selectedClinic?.serviceTypeId.toUpperCase().includes('ESPECIALIZADA')) && (
                                      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                                          <h3 className="text-lg font-black uppercase text-primary tracking-widest flex items-center gap-2"><Clock className="h-5 w-5" /> 5. Elige tu Horario</h3>
                                          {selectedClinic?.bookingMode === BookingMode.Time ? (
                                              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                                                  {availableTimeSlots.map(time => (<Button key={time} variant={selectedTime === time ? 'default' : 'outline'} onClick={() => setSelectedTime(time)} className={cn("h-14 text-base font-black transition-all rounded-2xl", selectedTime === time ? "scale-105 shadow-xl" : "")}>{time}</Button>))}
                                                  {availableTimeSlots.length === 0 && (<div className="col-span-full text-center py-12 bg-rose-50 border-2 border-dashed border-rose-200 rounded-3xl text-rose-700 font-bold">No hay horarios disponibles.</div>)}
                                              </div>
                                          ) : (
                                              <div className="max-w-md mx-auto"><Select onValueChange={setSelectedTime} value={selectedTime}><SelectTrigger className="h-14 text-lg font-black rounded-2xl"><SelectValue placeholder="Selecciona una ficha..." /></SelectTrigger><SelectContent>{availableTokens.map(token => <SelectItem key={token} value={token} className="font-bold">{token}</SelectItem>)}</SelectContent></Select></div>
                                          )}
                                          {selectedTime && (<div className="pt-10 animate-in fade-in zoom-in-95 duration-500 border-t border-dashed mt-10"><div className="bg-primary/5 p-8 rounded-[2rem] border border-primary/10"><div className="flex items-center gap-3 mb-8"><div className="bg-primary text-white h-8 w-8 rounded-full flex items-center justify-center font-black">6</div><h3 className="text-xl font-black uppercase text-primary tracking-widest">Confirma tus Datos</h3></div><BookingForm selectedDate={selectedDate} selectedClinic={selectedClinic} selectedColoniaName={selectedColonia?.name} selectedTime={selectedTime} patientType={patientType} isDoubleSlot={isDoubleSlot} onBookingSuccess={() => { setAvailabilityCache({}); setAvailability([]); handleClinicSelect(selectedClinicId!); }} announcements={announcements} requireColonia={true} /></div></div>)}
                                      </div>
                                  )}
                              </CardContent>
                          </Card>
                      )}
                  </div>
              )}
          </div>
      </div>
    </div>
  );
}

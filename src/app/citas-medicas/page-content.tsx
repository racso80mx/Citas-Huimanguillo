
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
import { Bell, MapPin, Hospital, LayoutList, Clock, CalendarDays, CalendarPlus, Check, Loader2, RefreshCw } from 'lucide-react';
import { format, eachDayOfInterval, isSaturday, isSunday, startOfToday, addDays, isSameDay, startOfMonth, endOfMonth } from 'date-fns';
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
    initialHolidays, 
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
  
  const [availabilityCache, setAvailabilityCache] = useState<Record<string, DailyAvailability[]>>({});
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  
  const [availability, setAvailability] = React.useState<DailyAvailability[]>([]);
  const [announcements] = React.useState<string[]>(initialAnnouncements);
  const [colonias] = React.useState<Colonia[]>(initialColonias);
  const [clinics] = React.useState<Clinic[]>(initialClinics);
  const [serviceTypes] = React.useState<ServiceType[]>(initialServiceTypes);
  
  const [currentMonth, setCurrentMonth] = React.useState(new Date());
  const { toast } = useToast();

  const generateDynamicTimeSlots = React.useCallback((startTimeStr: string, endTimeStr: string, duration: number): string[] => {
    if (!startTimeStr || !endTimeStr || !duration) return [];
    const slots: string[] = [];
    try {
        const start = new Date(`1970-01-01T${startTimeStr}:00`);
        const end = new Date(`1970-01-01T${endTimeStr}:00`);
        let current = start;
        while (current < end) {
            slots.push(current.toTimeString().substring(0, 5));
            current = new Date(current.getTime() + duration * 60000);
        }
    } catch (e) {}
    return slots;
  }, []);

  const calculateForClinic = useCallback((clinic: Clinic, startDate: Date, endDate: Date, allAppointments: any[], holidaySet: Set<string>, freshSpecialActionDays: SpecialActionDay[]): DailyAvailability[] => {
      // PRECISIÓN: Agrupar por Fecha y Consultorio específicamente
      const dayClinicMap = new Map<string, Map<string, any[]>>();
      allAppointments.forEach(app => {
          const d = app.date.split('T')[0];
          if (!dayClinicMap.has(d)) dayClinicMap.set(d, new Map());
          const clinicMap = dayClinicMap.get(d)!;
          if (!clinicMap.has(app.clinicId)) clinicMap.set(app.clinicId, []);
          clinicMap.get(app.clinicId)!.push(app);
      });

      const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
      const availabilityResult: DailyAvailability[] = [];
      const daysInInterval = eachDayOfInterval({ start: startDate, end: endDate });

      for (const day of daysInInterval) {
        const dateString = format(day, 'yyyy-MM-dd'); 
        const dayBooked = dayClinicMap.get(dateString)?.get(clinic.id) || [];
        const dayName = dayNames[day.getDay()];
        
        const isHoliday = holidaySet.has(dateString);
        const isWeekend = isSaturday(day) || isSunday(day);
        
        const isSpecialActionDay = freshSpecialActionDays.some(sad => 
            sad.date === dateString && 
            (sad.clinicType === clinic.serviceTypeId || 
             sad.clinicType === "Consulta Externa" ||
             serviceTypes.find(t => t.id === clinic.serviceTypeId)?.name === sad.clinicType)
        );

        const isDateBlocked = clinic.unavailableDates?.includes(dateString);
        const isWeekendBlocked = isWeekend && !clinic.weekendBookingEnabled;
        const isActionDay = clinic.daysOfAction && !clinic.daysOfAction.includes(dayName);

        const isBlocked = isDateBlocked || isHoliday || isWeekendBlocked || isSpecialActionDay || isActionDay;

        let availableSlotsForClinic = 0;
        let takenInfo = dayBooked.map(a => ({ time: a.time, duration: a.duration }));

        if (!isBlocked) {
            const customSchedule = clinic.customSchedules?.find(s => s.date === dateString);
            const currentEndTime = customSchedule ? customSchedule.endTime : clinic.endTime;

            if (clinic.bookingMode === BookingMode.Time && clinic.consultationDuration) {
                const allSlots = generateDynamicTimeSlots(clinic.startTime, currentEndTime, clinic.consultationDuration);
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
  }, [generateDynamicTimeSlots, serviceTypes]);

  const fetchAvailabilityForRange = React.useCallback(async (targetClinicId: string, startDate: Date, endDate: Date, cacheKey: string) => {
      if (availabilityCache[cacheKey]) {
          setAvailability(prev => {
              const combined = [...prev];
              availabilityCache[cacheKey].forEach(item => {
                  const idx = combined.findIndex(c => c.date === item.date);
                  if (idx >= 0) combined[idx] = item;
                  else combined.push(item);
              });
              return combined.sort((a,b) => a.date.localeCompare(b.date));
          });
          return;
      }

      setIsLoadingAvailability(true);
      try {
          // PRECISIÓN: Enviar fechas en ISO puro para filtrado atómico en servidor
          const [allAppointments, freshHolidays, freshSpecialActionDays] = await Promise.all([
            getAppointments({ startDate: startDate.toISOString(), endDate: endDate.toISOString() }), 
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
                      if (idx >= 0) combined[idx] = item;
                      else combined.push(item);
                  });
                  return combined.sort((a,b) => a.date.localeCompare(b.date));
              });
              setAvailabilityCache(prev => ({ ...prev, [cacheKey]: targetAvail }));
          }
      } finally {
          setIsLoadingAvailability(false); 
      }
  }, [clinics, calculateForClinic, availabilityCache]);

  React.useEffect(() => {
    if (isAuthenticated && selectedClinicId) {
        const today = startOfToday();
        const end = addDays(today, 45);
        fetchAvailabilityForRange(selectedClinicId, today, end, `${selectedClinicId}-initial`);
    }
  }, [isAuthenticated, selectedClinicId, fetchAvailabilityForRange]);

  const handleMonthChange = (monthDate: Date) => {
    setCurrentMonth(monthDate);
    if (selectedClinicId) {
        const start = startOfMonth(monthDate);
        const end = endOfMonth(monthDate);
        const cacheKey = `${selectedClinicId}-${format(monthDate, 'yyyy-MM')}`;
        fetchAvailabilityForRange(selectedClinicId, start, end, cacheKey);
    }
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (date && date < startOfToday()) {
        toast({ title: 'Fecha no válida', description: 'No puedes seleccionar una fecha en el pasado.', variant: 'destructive' });
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
    setAvailability([]);
  };

  const handleManualRefresh = () => {
      if (selectedClinicId) {
          setAvailabilityCache({});
          setAvailability([]);
          const today = startOfToday();
          const end = addDays(today, 45);
          fetchAvailabilityForRange(selectedClinicId, today, end, `${selectedClinicId}-initial`);
          toast({ title: 'Agenda Sincronizada' });
      }
  };

  const selectedClinic = useMemo(() => clinics.find(c => c.id === selectedClinicId), [selectedClinicId, clinics]);
  const selectedColonia = useMemo(() => colonias.find(c => c.id === selectedColoniaId), [selectedColoniaId, colonias]);
  
  const clinicOptions = React.useMemo(() => {
    if (!selectedServiceTypeId) return [];
    return clinics
        .filter(c => {
            const type = serviceTypes.find(t => t.id === c.serviceTypeId) || serviceTypes.find(t => t.name === c.serviceTypeId);
            return type?.id === selectedServiceTypeId;
        })
        .map(clinic => ({ 
            value: clinic.id, 
            label: clinic.name,
            doctor: clinic.doctorName
        })).sort((a,b) => a.label.localeCompare(b.label));
  }, [clinics, selectedServiceTypeId, serviceTypes]);

  const projectedGridData = useMemo(() => {
    if (!selectedClinicId) return [];
    const today = startOfToday();
    const range = Array.from({ length: 7 }, (_, i) => addDays(today, i));
    return range.map(date => {
        const dateStr = format(date, 'yyyy-MM-dd');
        const avail = availability.find(a => a.date === dateStr);
        return { 
            date, 
            dateStr, 
            slots: avail?.availableSlots ?? 0, 
            isClosed: !avail || avail.availableSlots === 0 
        };
    });
  }, [selectedClinicId, availability]);

  const availableTimeSlots = React.useMemo(() => {
    if (!selectedClinic || !selectedDate || selectedClinic.bookingMode !== BookingMode.Time) return [];
    const dateString = format(selectedDate, 'yyyy-MM-dd');
    const dayAvail = availability.find(d => d.date === dateString);
    if (!dayAvail) return [];

    const booked = dayAvail.takenTimesByClinic[selectedClinic.id] || [];
    const customSchedule = selectedClinic.customSchedules?.find(s => s.date === dateString);
    const endTime = customSchedule ? customSchedule.endTime : selectedClinic.endTime;
    
    const allSlots = generateDynamicTimeSlots(selectedClinic.startTime, endTime, selectedClinic.consultationDuration || 30);
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

  if (!isAuthenticated) return <ModuleLoginForm title="Citas Médicas" onVerify={verifyCitasMedicasPassword} onSuccess={() => setIsAuthenticated(true)} />;

  return (
    <div className="container mx-auto px-4 py-8 md:py-12">
      <div className="text-center mb-10 flex flex-col items-center">
        <div className="text-primary mb-4"><Image src={logoBase64} alt="Logo" width={80} height={80} className="rounded-md" /></div>
        <h1 className="text-4xl lg:text-5xl font-bold font-headline text-foreground tracking-tight">Reserva tu Cita Médica</h1>
        <p className="text-muted-foreground mt-2 font-medium max-w-2xl mx-auto">Consulta los espacios disponibles y agenda tu cita en pocos pasos.</p>
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
                                {selectedClinicId && (
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={handleManualRefresh}>
                                        <RefreshCw className={cn("h-4 w-4", isLoadingAvailability && "animate-spin")} />
                                    </Button>
                                )}
                            </h3>
                            <div className="grid gap-2">
                                {clinicOptions.map(opt => (
                                    <button 
                                        key={opt.value} 
                                        onClick={() => handleClinicSelect(opt.value)}
                                        className={cn(
                                            "w-full p-4 rounded-xl border-2 text-left transition-all group",
                                            selectedClinicId === opt.value ? "bg-primary border-primary text-white shadow-md ring-2 ring-primary/20 scale-[1.02]" : "bg-background border-muted hover:border-primary/40 hover:bg-muted/30"
                                        )}
                                    >
                                        <div className="flex justify-between items-start">
                                            <div><p className="font-black text-sm uppercase leading-none">{opt.label}</p><p className={cn("text-[10px] mt-1 font-bold uppercase", selectedClinicId === opt.value ? "text-white/70" : "text-muted-foreground group-hover:text-primary")}>Dr. {opt.doctor}</p></div>
                                            {selectedClinicId === opt.value && <Check className="h-5 w-5 text-white" />}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    <Separator className="opacity-50" />
                    <div className="space-y-4">
                         <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground"><Clock className="h-4 w-4" /> Los horarios se actualizan en tiempo real.</div>
                         <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground"><Bell className="h-4 w-4" /> Recuerda llegar 15 min antes.</div>
                    </div>
                </CardContent>
              </Card>
          </div>

          <div className="lg:col-span-8 space-y-8">
              {!selectedClinicId ? (
                  <div className="h-full min-h-[500px] flex flex-col items-center justify-center border-2 border-dashed rounded-[2.5rem] opacity-20 bg-muted/5">
                      <CalendarPlus className="h-20 w-20 mb-4" />
                      <p className="text-2xl font-black uppercase tracking-widest text-center">Espera de Selección</p>
                      <p className="font-bold text-center">Selecciona una categoría y consultorio para ver disponibilidad.</p>
                  </div>
              ) : (
                  <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
                      <Card className="shadow-xl border-primary/10 overflow-hidden rounded-[2.5rem] relative">
                          <CardHeader className="bg-primary/5 pb-4 border-b border-primary/5">
                               <div className="flex items-center justify-between">
                                    <CardTitle className="text-xl font-black uppercase text-primary tracking-wider flex items-center gap-2"><CalendarDays className="h-6 w-6" /> 3. Disponibilidad Próximos 7 Días</CardTitle>
                                    <Badge variant="outline" className="font-bold bg-background">Cupo en {selectedClinic?.name}</Badge>
                               </div>
                          </CardHeader>
                          <CardContent className="p-8 min-h-[300px] relative">
                              {(isLoadingAvailability && availability.length === 0) && (
                                  <div className="absolute inset-0 z-50 bg-background/60 backdrop-blur-[2px] flex flex-col items-center justify-center rounded-[2rem] animate-in fade-in">
                                      <Loader2 className="h-12 w-12 animate-spin text-primary" />
                                      <p className="text-xs font-black uppercase tracking-widest mt-4 text-primary animate-pulse">Sincronizando Agenda...</p>
                                  </div>
                              )}
                              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
                                  {projectedGridData.map((item) => (
                                      <button 
                                        key={item.dateStr}
                                        onClick={() => handleDateSelect(item.date)}
                                        disabled={item.isClosed && !isLoadingAvailability}
                                        className={cn(
                                            "relative flex flex-col items-center p-3 rounded-2xl border-2 transition-all group",
                                            isSameDay(selectedDate || new Date(0), item.date) ? "bg-primary border-primary text-white shadow-lg ring-4 ring-primary/10 scale-105 z-10" : (item.isClosed && !isLoadingAvailability) ? "bg-muted/30 border-muted opacity-40 cursor-not-allowed grayscale" : "bg-background border-muted hover:border-primary/40 hover:bg-primary/5"
                                        )}
                                      >
                                          <span className={cn("text-[9px] font-black uppercase tracking-tighter mb-1", isSameDay(selectedDate || new Date(0), item.date) ? "text-white/60" : "text-muted-foreground")}>{format(item.date, 'EEEE', { locale: es })}</span>
                                          <span className="text-lg font-black leading-none">{format(item.date, 'dd')}</span>
                                          <span className={cn("text-[9px] font-bold uppercase", isSameDay(selectedDate || new Date(0), item.date) ? "text-white/80" : "text-muted-foreground")}>{format(item.date, 'MMM', { locale: es })}</span>
                                          {isLoadingAvailability && !availability.some(a => a.date === item.dateStr) ? (
                                              <Loader2 className="h-4 w-4 animate-spin mt-2 text-primary opacity-40" />
                                          ) : (
                                              <>
                                                {!item.isClosed && (<Badge className={cn("mt-2 text-[9px] font-black w-full justify-center px-1", isSameDay(selectedDate || new Date(0), item.date) ? "bg-white text-primary" : item.slots > 5 ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700")}>{item.slots} LIBRES</Badge>)}
                                                {item.isClosed && (<Badge variant="ghost" className="mt-2 text-[9px] font-black text-muted-foreground">CERRADO</Badge>)}
                                              </>
                                          )}
                                      </button>
                                  ))}
                              </div>
                              <div className="mt-8 flex justify-center">
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" className="h-10 px-8 font-bold border-dashed border-primary/40 text-primary hover:bg-primary/5">
                                                <CalendarDays className="mr-2 h-4 w-4" /> Buscar otra fecha en el Calendario
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="center">
                                            <AvailabilityCalendar 
                                                selectedDate={selectedDate} 
                                                onDateSelect={handleDateSelect} 
                                                availability={availability} 
                                                onMonthChange={handleMonthChange} 
                                                isLoading={isLoadingAvailability} 
                                            />
                                        </PopoverContent>
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
                                              <SelectContent>{filteredColonias.length > 0 ? (filteredColonias.map(c => <SelectItem key={c.id} value={c.id} className="font-bold uppercase text-xs">{c.name}</SelectItem>)) : (<div className="p-4 text-center text-sm text-muted-foreground italic">No hay localidades vinculadas a este consultorio.</div>)}</SelectContent>
                                          </Select>
                                      </div>
                                      <div className="space-y-4">
                                          <h3 className="text-lg font-black uppercase text-primary tracking-widest flex items-center gap-2"><Badge variant="outline" className="border-primary text-primary h-5 text-[10px]">P2</Badge> Tipo de Paciente</h3>
                                          <Select onValueChange={(v: PatientType) => setPatientType(v)} value={patientType}>
                                              <SelectTrigger className="h-12 text-base font-bold"><SelectValue /></SelectTrigger>
                                              <SelectContent>{Object.values(PatientType).map(t => <SelectItem key={t} value={t} className="font-bold">{t}</SelectItem>)}</SelectContent>
                                          </Select>
                                          {patientType === PatientType.Embarazada && (<div className="flex items-center space-x-2 p-3 bg-pink-50 border border-pink-100 rounded-xl animate-in slide-in-from-top-2"><Checkbox id="d-slot" checked={isDoubleSlot} onCheckedChange={(v) => setIsDoubleSlot(!!v)} /><Label htmlFor="d-slot" className="text-xs font-black text-pink-700 uppercase cursor-pointer">Solicitar Horario Doble (Consecutivo)</Label></div>)}
                                      </div>
                                  </div>
                                  <Separator className="opacity-50" />
                                  {(selectedColoniaId || selectedClinic?.serviceTypeId.toUpperCase().includes('ESPECIALIZADA')) && (
                                      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                                          <h3 className="text-lg font-black uppercase text-primary tracking-widest flex items-center gap-2"><Clock className="h-5 w-5" /> 5. Elige tu Horario</h3>
                                          {selectedClinic?.bookingMode === BookingMode.Time ? (
                                              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                                                  {availableTimeSlots.map(time => (<Button key={time} variant={selectedTime === time ? 'default' : 'outline'} onClick={() => setSelectedTime(time)} className={cn("h-14 text-base font-black transition-all rounded-2xl", selectedTime === time ? "scale-105 shadow-xl ring-4 ring-primary/20" : "")}>{time}</Button>))}
                                                  {availableTimeSlots.length === 0 && (<div className="col-span-full text-center py-12 bg-rose-50/50 border-2 border-dashed border-rose-200 rounded-3xl text-rose-700 font-bold italic">No hay horarios disponibles para el criterio seleccionado.</div>)}
                                              </div>
                                          ) : (
                                              <div className="max-w-md mx-auto"><Select onValueChange={setSelectedTime} value={selectedTime}><SelectTrigger className="h-14 text-lg font-black border-primary/30 rounded-2xl"><SelectValue placeholder="Selecciona una ficha disponible..." /></SelectTrigger><SelectContent>{availableTokens.map(token => <SelectItem key={token} value={token} className="font-bold">{token}</SelectItem>)}</SelectContent></Select></div>
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

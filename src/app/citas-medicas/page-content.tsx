'use client';
import { useState, useCallback, useEffect, useMemo, useTransition } from 'react';
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
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { DailyAvailability, Colonia, Clinic, Holiday, SpecialActionDay, ServiceType, Specialty } from '@/lib/definitions';
import { PatientType, BookingMode } from '@/lib/definitions';
import { getAppointments, getClinics, getHolidays, verifyCitasMedicasPassword, getSpecialActionDays, getServiceTypes } from '@/lib/actions';

import { useToast } from '@/hooks/use-toast';
import { Hospital, LayoutList, CalendarDays, CalendarPlus, Check, Loader2, RefreshCw, MapPin, Clock, Info, CheckCircle2, AlertCircle } from 'lucide-react';
import { format, eachDayOfInterval, isSaturday, isSunday, startOfToday, addDays, isSameDay, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn, normalize } from '@/lib/utils';
import { ModuleLoginForm } from '@/components/shared/module-login-form';
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
  
  const [availabilityCache, setAvailabilityCache] = useState<Record<string, DailyAvailability[]>>({});
  const [availability, setAvailability] = React.useState<DailyAvailability[]>([]);
  
  const [announcements] = React.useState<string[]>(initialAnnouncements);
  const [colonias] = React.useState<Colonia[]>(initialColonias);
  const [clinics] = React.useState<Clinic[]>(initialClinics);
  const [serviceTypes] = React.useState<ServiceType[]>(initialServiceTypes);
  
  const [currentMonth, setCurrentMonth] = React.useState(new Date());
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const generateDynamicTimeSlots = useCallback((startTimeStr: string, endTimeStr: string, duration: number): string[] => {
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

  const calculateAvailability = useCallback((targetClinic: Clinic, monthDate: Date, allAppointments: any[], holidaySet: Set<string>, specialDays: SpecialActionDay[]): DailyAvailability[] => {
      const startDate = startOfMonth(monthDate);
      const endDate = endOfMonth(monthDate);
      const daysInMonth = eachDayOfInterval({ start: startDate, end: endDate });
      const dayNames = ["DOMINGO", "LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO"];
      const clinicServiceTypeName = normalize(serviceTypes.find(t => t.id === targetClinic.serviceTypeId)?.name || targetClinic.serviceTypeId);
      
      const results: DailyAvailability[] = [];

      for (const day of daysInMonth) {
          const dateString = format(day, 'yyyy-MM-dd');
          const dayBooked = allAppointments.filter(a => {
              const appDate = typeof a.date === 'string' ? a.date.split('T')[0] : format(a.date, 'yyyy-MM-dd');
              return appDate === dateString && a.clinicId === targetClinic.id;
          });
          const dayName = dayNames[day.getDay()];
          
          const isHoliday = holidaySet.has(dateString);
          const isWeekend = isSaturday(day) || isSunday(day);
          const isSpecialActionDay = specialDays.some(sad => 
              sad.date === dateString && (normalize(sad.clinicType) === clinicServiceTypeName || normalize(sad.clinicType) === "CONSULTA EXTERNA")
          );

          const worksOnThisDay = !targetClinic.daysOfAction || targetClinic.daysOfAction.length === 0 || targetClinic.daysOfAction.map(d => normalize(d)).includes(dayName);
          const isDateBlocked = targetClinic.unavailableDates?.includes(dateString);
          const isWeekendBlocked = isWeekend && !targetClinic.weekendBookingEnabled;
          
          const isBlocked = isDateBlocked || isHoliday || isWeekendBlocked || isSpecialActionDay || !worksOnThisDay;

          let availableSlotsCount = 0;
          let takenInfo = dayBooked.map(a => ({ time: a.time, duration: a.duration }));

          if (!isBlocked) {
              const customSchedule = targetClinic.customSchedules?.find(s => s.date === dateString);
              const currentEndTime = customSchedule ? customSchedule.endTime : (targetClinic.endTime || "14:00");
              const currentStartTime = targetClinic.startTime || "08:00";
              const currentDuration = targetClinic.consultationDuration || 30;

              if (targetClinic.bookingMode === BookingMode.Time) {
                  const allSlots = generateDynamicTimeSlots(currentStartTime, currentEndTime, currentDuration);
                  const filteredSlots = allSlots.filter(s => s !== targetClinic.breakTime);
                  availableSlotsCount = Math.max(0, filteredSlots.length - dayBooked.length);
              } else {
                  const totalSlots = (targetClinic.dailySlots || 15) + (targetClinic.waitlistSlots || 0);
                  availableSlotsCount = Math.max(0, totalSlots - dayBooked.length);
              }
          }

          results.push({ 
              date: dateString, 
              availableSlots: availableSlotsCount, 
              availabilityByClinic: { [targetClinic.id]: availableSlotsCount }, 
              takenTimesByClinic: { [targetClinic.id]: takenInfo } 
          });
      }
      return results;
  }, [generateDynamicTimeSlots, serviceTypes]);

  const fetchMonthAvailability = useCallback(async (targetClinicId: string, monthDate: Date) => {
      const cacheKey = `${targetClinicId}-${format(monthDate, 'yyyy-MM')}`;
      if (availabilityCache[cacheKey]) {
          setAvailability(availabilityCache[cacheKey]);
          return;
      }

      const startDate = startOfMonth(monthDate);
      const endDate = endOfMonth(monthDate);
      
      try {
          const [allAppointments, freshHolidays, freshSpecialActionDays] = await Promise.all([
            getAppointments({ startDate: startDate.toISOString(), endDate: endDate.toISOString(), clinicId: targetClinicId }), 
            getHolidays(), 
            getSpecialActionDays()
          ]);
          
          const holidaySet = new Set(freshHolidays.map(h => h.date));
          const targetClinic = clinics.find(c => c.id === targetClinicId);
          
          if (targetClinic) {
              const monthAvail = calculateAvailability(targetClinic, monthDate, allAppointments, holidaySet, freshSpecialActionDays);
              setAvailability(monthAvail);
              setAvailabilityCache(prev => ({ ...prev, [cacheKey]: monthAvail }));
          }
      } catch (e) {
          console.error("Fetch month availability error", e);
          toast({ title: 'Error al sincronizar', variant: 'destructive' });
      }
  }, [clinics, availabilityCache, calculateAvailability, toast]);

  useEffect(() => {
    if (isAuthenticated && selectedClinicId) {
        startTransition(async () => {
            await fetchMonthAvailability(selectedClinicId, currentMonth);
        });
    }
  }, [isAuthenticated, selectedClinicId, currentMonth, fetchMonthAvailability]);

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
    setAvailability([]);
  };

  const selectedClinic = useMemo(() => clinics.find(c => c.id === selectedClinicId), [selectedClinicId, clinics]);
  const selectedColonia = useMemo(() => colonias.find(c => c.id === selectedColoniaId), [selectedColoniaId, colonias]);
  
  const clinicOptions = useMemo(() => {
    if (!selectedServiceTypeId) return [];
    return clinics
        .filter(c => c.serviceTypeId === selectedServiceTypeId)
        .map(clinic => ({ 
            value: clinic.id, 
            label: clinic.name,
            doctor: clinic.doctorName
        })).sort((a,b) => a.label.localeCompare(b.label));
  }, [clinics, selectedServiceTypeId]);

  const selectedDayAvailability = useMemo(() => {
    if (!selectedDate) return null;
    const dateString = format(selectedDate, 'yyyy-MM-dd');
    return availability.find((d) => d.date === dateString) || null;
  }, [selectedDate, availability]);

  const availableTimeSlots = useMemo(() => {
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

  const availableTokens = useMemo(() => {
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

  const filteredColonias = useMemo(() => {
    if (!selectedClinicId) return [];
    return colonias.filter(c => c.clinicId === selectedClinicId).sort((a,b) => a.name.localeCompare(b.name));
  }, [colonias, selectedClinicId]);

  const refreshData = () => {
      if (selectedClinicId) {
          setAvailabilityCache({});
          fetchMonthAvailability(selectedClinicId, currentMonth);
      }
  };

  if (!isAuthenticated) return <ModuleLoginForm title="Citas Médicas" onVerify={verifyCitasMedicasPassword} onSuccess={() => setIsAuthenticated(true)} />;

  return (
    <div className="container mx-auto px-4 py-8 md:py-12">
      <div className="text-center mb-8 flex flex-col items-center">
        <div className="text-primary mb-4">
          <Image src={logoBase64} alt="Logo" width={80} height={80} className="rounded-md shadow-md" />
        </div>
        <h1 className="text-4xl lg:text-5xl font-bold font-headline text-foreground uppercase tracking-tight">Agenda tu Cita Médica</h1>
        <p className="text-lg text-muted-foreground mt-2 max-w-2xl mx-auto">Selecciona un día, el consultorio que te corresponde y registra tus datos.</p>
      </div>

      <Card className="w-full max-w-6xl mx-auto shadow-2xl border-border/60 overflow-hidden">
        <CardContent className="p-4 md:p-8">
          <div className="grid md:grid-cols-2 gap-12 items-start">
            {/* COLUMNA IZQUIERDA: SELECCIÓN */}
            <div className="flex flex-col gap-8">
              <div>
                <h3 className="text-2xl font-bold font-headline text-foreground mb-6 flex items-center justify-between">
                  <span className="flex items-center gap-2"><CalendarDays className="h-6 w-6 text-primary" /> 1. Selecciona un día</span>
                  <Button variant="ghost" size="icon" onClick={refreshData} disabled={!selectedClinicId || isPending}>
                      <RefreshCw className={cn("h-5 w-5 text-primary", isPending && "animate-spin")} />
                  </Button>
                </h3>
                <AvailabilityCalendar
                  selectedDate={selectedDate}
                  onDateSelect={handleDateSelect}
                  availability={availability}
                  onMonthChange={handleMonthChange}
                  isLoading={isPending}
                />
              </div>

              {selectedDate && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
                      <div className="space-y-4">
                          <h3 className="text-xl font-bold font-headline text-foreground flex items-center gap-2">
                              <LayoutList className="h-5 w-5 text-primary" /> 2. Categoría de Atención
                          </h3>
                          <Select onValueChange={(v) => { setSelectedServiceTypeId(v); setSelectedClinicId(undefined); }} value={selectedServiceTypeId}>
                              <SelectTrigger className="h-12 text-base font-bold"><SelectValue placeholder="Elige el servicio..." /></SelectTrigger>
                              <SelectContent>{serviceTypes.map(t => <SelectItem key={t.id} value={t.id} className="font-bold">{t.name}</SelectItem>)}</SelectContent>
                          </Select>
                      </div>

                      {selectedServiceTypeId && (
                          <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                              <h3 className="text-xl font-bold font-headline text-foreground flex items-center gap-2">
                                  <Hospital className="h-5 w-5 text-primary" /> 3. Consultorio / Núcleo
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
                  </div>
              )}
            </div>

            {/* COLUMNA DERECHA: HORARIOS Y DATOS */}
            <div className="flex flex-col gap-8">
              {selectedDate && selectedClinicId && selectedDayAvailability && (
                  <Card className="border-primary/20 bg-primary/5 animate-in zoom-in-95 duration-500">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Info className="h-5 w-5 text-primary" />
                          <span className="font-semibold text-sm">Cupo para el {format(selectedDate, 'dd/MM/yyyy')}:</span>
                        </div>
                        <Badge variant={selectedDayAvailability.availableSlots > 5 ? "secondary" : "destructive"} className={cn("text-lg px-3 py-1 font-bold", selectedDayAvailability.availableSlots > 5 ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700")}>
                          {selectedDayAvailability.availableSlots === 0 ? (
                            <span className="flex items-center gap-1"><AlertCircle className="h-4 w-4" /> Agotado</span>
                          ) : (
                            <span className="flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> {selectedDayAvailability.availableSlots} espacios libres</span>
                          )}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
              )}

              {selectedDate && selectedClinicId && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                      <div className="grid md:grid-cols-2 gap-6">
                          <div className="space-y-3">
                              <Label className="text-xs font-black uppercase text-primary tracking-widest flex items-center gap-2"><MapPin className="h-4 w-4" /> 4. Tu Localidad</Label>
                              <Select onValueChange={setSelectedColoniaId} value={selectedColoniaId}>
                                  <SelectTrigger className="h-12 text-base font-bold border-primary/20"><SelectValue placeholder="Busca tu colonia..." /></SelectTrigger>
                                  <SelectContent>{filteredColonias.length > 0 ? (filteredColonias.map(c => <SelectItem key={c.id} value={c.id} className="font-bold uppercase text-xs">{c.name}</SelectItem>)) : (<div className="p-4 text-center text-sm text-muted-foreground italic">No hay localidades vinculadas.</div>)}</SelectContent>
                              </Select>
                          </div>
                          <div className="space-y-3">
                              <Label className="text-xs font-black uppercase text-primary tracking-widest">Tipo de Paciente</Label>
                              <Select onValueChange={(v: PatientType) => setPatientType(v)} value={patientType}>
                                  <SelectTrigger className="h-12 text-base font-bold"><SelectValue /></SelectTrigger>
                                  <SelectContent>{Object.values(PatientType).map(t => <SelectItem key={t} value={t} className="font-bold">{t}</SelectItem>)}</SelectContent>
                              </Select>
                          </div>
                      </div>

                      {(selectedColoniaId || selectedClinic?.serviceTypeId.toUpperCase().includes('ESPECIALIZADA')) && (
                          <div className="space-y-6">
                              <h3 className="text-xl font-bold font-headline text-foreground flex items-center gap-2"><Clock className="h-5 w-5 text-primary" /> 5. Elige tu Horario</h3>
                              {selectedClinic?.bookingMode === BookingMode.Time ? (
                                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                                      {availableTimeSlots.map(time => (<Button key={time} variant={selectedTime === time ? 'default' : 'outline'} onClick={() => setSelectedTime(time)} className={cn("h-14 text-base font-black transition-all rounded-2xl", selectedTime === time ? "scale-105 shadow-xl" : "")}>{time}</Button>))}
                                      {availableTimeSlots.length === 0 && (<div className="col-span-full text-center py-10 bg-rose-50 border-2 border-dashed border-rose-200 rounded-3xl text-rose-700 font-bold">Sin horarios disponibles.</div>)}
                                  </div>
                              ) : (
                                  <Select onValueChange={setSelectedTime} value={selectedTime}>
                                      <SelectTrigger className="h-14 text-lg font-black rounded-2xl"><SelectValue placeholder="Selecciona una ficha..." /></SelectTrigger>
                                      <SelectContent>{availableTokens.map(token => <SelectItem key={token} value={token} className="font-bold">{token}</SelectItem>)}</SelectContent>
                                  </Select>
                              )}
                          </div>
                      )}

                      {selectedTime && (
                          <div className="pt-6 border-t border-dashed mt-10">
                              <h3 className="text-2xl font-bold font-headline text-foreground mb-6 flex items-center gap-2">
                                <PlusCircle className="h-6 w-6 text-primary" /> 6. Completa tus datos
                              </h3>
                              <BookingForm 
                                selectedDate={selectedDate} 
                                selectedClinic={selectedClinic} 
                                selectedColoniaName={selectedColonia?.name} 
                                selectedTime={selectedTime} 
                                patientType={patientType} 
                                isDoubleSlot={isDoubleSlot} 
                                onBookingSuccess={() => { setAvailabilityCache({}); setAvailability([]); handleClinicSelect(selectedClinicId!); }} 
                                announcements={announcements} 
                                requireColonia={true} 
                              />
                          </div>
                      )}
                  </div>
              )}

              {!selectedDate && (
                  <div className="h-full flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-[2.5rem] opacity-30 bg-muted/5 min-h-[300px]">
                      <CalendarPlus className="h-16 w-16 mb-4" />
                      <p className="text-xl font-black uppercase tracking-widest text-center leading-tight">Por favor, completa los pasos anteriores</p>
                  </div>
              )}

              {announcements && announcements.length > 0 && (
                <Card className="shadow-lg border-primary/10">
                  <CardHeader className="bg-primary/5 py-4"><CardTitle className="text-lg flex items-center gap-2 font-headline"><Info className="h-5 w-5 text-primary" /> Avisos Importantes</CardTitle></CardHeader>
                  <CardContent className="pt-6"><ul className="space-y-3 text-muted-foreground list-disc pl-5 font-medium">{announcements.map((a, i) => (<li key={i}>{a}</li>))}</ul></CardContent>
                </Card>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

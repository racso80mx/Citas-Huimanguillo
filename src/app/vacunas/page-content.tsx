
'use client';
import React, { useState, useCallback, useMemo, useEffect, useTransition } from 'react';
import Image from 'next/image';
import { logoBase64 } from '@/lib/logo-data';
import { AvailabilityCalendar } from '@/components/availability-calendar';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import type { DailyAvailability, Vaccine, VaccineSettings, Colonia, Clinic, Holiday } from '@/lib/definitions';
import { PatientType } from '@/lib/definitions';
import { getVaccineAppointments, getHolidays, verifyVaccinePassword } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Clock, CalendarDays, ShieldPlus, UserCheck, MapPin, Bell, RefreshCw } from 'lucide-react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSaturday,
  isSunday,
  startOfToday,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { VaccineBookingForm } from '@/components/vacunas/vaccine-booking-form';
import { VaccineSelector } from '@/components/vacunas/vaccine-selector';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { timeSlots10Min } from '@/lib/time-slots';
import { ModuleLoginForm } from '@/components/shared/module-login-form';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type VaccinePageContentProps = {
  initialVaccines: Vaccine[];
  initialSettings: VaccineSettings;
  initialColonias: Colonia[];
  initialClinics: Clinic[];
  initialAnnouncements: string[];
  initialHolidays: Holiday[];
};

export default function VaccinePageContent({
  initialVaccines,
  initialSettings,
  initialColonias,
  initialClinics,
  initialAnnouncements,
  initialHolidays,
}: VaccinePageContentProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = React.useState<string | undefined>();
  const [selectedVaccines, setSelectedVaccines] = React.useState<Vaccine[]>([]);
  const [patientType, setPatientType] = React.useState<PatientType>(PatientType.General);
  const [selectedColoniaId, setSelectedColoniaId] = React.useState<string | undefined>();

  const [availabilityCache, setAvailabilityCache] = useState<Record<string, DailyAvailability[]>>({});
  const [availability, setAvailability] = React.useState<DailyAvailability[]>([]);
  const [settings] = React.useState<VaccineSettings>(initialSettings);
  const [announcements] = React.useState<string[]>(initialAnnouncements);
  const [currentMonth, setCurrentMonth] = React.useState(new Date());
  const [isPending, startTransition] = React.useTransition();
  const { toast } = useToast();

  const isNewborn = patientType === PatientType.RecienNacido;
  
  const availableVaccines = React.useMemo(() => initialVaccines.filter(v => v.available), [initialVaccines]);

  const generateTimeSlots = useCallback((): string[] => {
    if (!settings || !settings.startTime || !settings.endTime) return [];
    
    const startIndex = timeSlots10Min.findIndex(slot => slot.value === settings.startTime);
    const endIndex = timeSlots10Min.findIndex(slot => slot.value === settings.endTime);

    if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) return [];

    const slotsInRange = timeSlots10Min.slice(startIndex, endIndex).map(slot => slot.value);
    const filteredSlots = slotsInRange.filter(slot => slot !== settings.breakTime);
    
    const regularSlots = filteredSlots.slice(0, settings.dailySlots);
    const waitlistSlots = Array.from({ length: settings.waitlistSlots || 0 }, (_, i) => `Espera ${i + 1}`);
    
    return [...regularSlots, ...waitlistSlots];
  }, [settings]);
  
  const allTimeSlots = useMemo(generateTimeSlots, [generateTimeSlots]);

  const fetchAvailability = useCallback(
    async (monthDate: Date) => {
      const monthKey = format(monthDate, 'yyyy-MM');
      if (availabilityCache[monthKey]) {
          setAvailability(availabilityCache[monthKey]);
          return;
      }

      const startDate = startOfMonth(monthDate);
      const endDate = endOfMonth(monthDate);

      const [allAppointments, freshHolidays] = await Promise.all([
        getVaccineAppointments({ startDate: startDate.toISOString(), endDate: endDate.toISOString() }),
        getHolidays()
      ]);

      const availabilityResult: DailyAvailability[] = [];
      const daysInMonth = eachDayOfInterval({ start: startDate, end: endDate });

      for (const day of daysInMonth) {
        const dateString = format(day, 'yyyy-MM-dd');
        const appointmentsOnDate = allAppointments.filter(
          (app) => app.date.split('T')[0] === dateString
        );
        const isWeekend = isSaturday(day) || isSunday(day);
        const isHoliday = freshHolidays.some(h => h.date === dateString);
        const isSpecialDay = isWeekend || isHoliday;
        
        let maxSlotsForDay = 0;
        if (!isSpecialDay || (isSpecialDay && settings.weekendBookingEnabled)) {
            maxSlotsForDay = allTimeSlots.length;
        }

        const available = Math.max(0, maxSlotsForDay - appointmentsOnDate.length);
        const takenTimes = appointmentsOnDate.map((app) => app.time);
        
        availabilityResult.push({
          date: dateString,
          availableSlots: available,
          availabilityByClinic: {},
          takenTimesByClinic: {'vaccine': takenTimes || []},
        });
      }
      setAvailability(availabilityResult);
      setAvailabilityCache(prev => ({ ...prev, [monthKey]: availabilityResult }));
    },
    [settings, allTimeSlots, availabilityCache]
  );

  useEffect(() => {
    if (isAuthenticated) {
        startTransition(() => {
            fetchAvailability(currentMonth);
        });
    }
  }, [currentMonth, isAuthenticated, fetchAvailability]);

  const selectedDayAvailability = useMemo(() => {
    if (!selectedDate) return null;
    const dateString = format(selectedDate, 'yyyy-MM-dd');
    return availability.find((d) => d.date === dateString) || null;
  }, [selectedDate, availability]);

  const availableTimeSlots = useMemo(() => {
    if (!selectedDayAvailability || selectedDayAvailability.availableSlots <= 0) return [];
    const takenTimes = selectedDayAvailability.takenTimesByClinic['vaccine'] || [];
    
    const now = new Date();
    const isToday = selectedDate && format(selectedDate, 'yyyy-MM-dd') === format(now, 'yyyy-MM-dd');
    const currentTimeStr = format(now, 'HH:mm');

    return allTimeSlots.filter(slot => {
        if (takenTimes.includes(slot)) return false;
        if (isToday && !slot.includes('Espera') && slot < currentTimeStr) return false;
        return true;
    });
  }, [selectedDayAvailability, allTimeSlots, selectedDate]);
  
  const coloniaOptions = useMemo(() => {
    const options = initialColonias.map(colonia => {
        const clinic = initialClinics.find(c => c.id === colonia.clinicId);
        return {
            value: colonia.id,
            label: `${colonia.name} (${clinic?.name || 'N/A'})`,
            keywords: `${colonia.name} ${clinic?.name || ''}`,
            clinicName: clinic?.name || 'Z',
            coloniaName: colonia.name
        };
    });

    options.sort((a, b) => {
        const clinicCompare = a.clinicName.localeCompare(b.clinicName);
        if (clinicCompare !== 0) {
            return clinicCompare;
        }
        return a.coloniaName.localeCompare(b.coloniaName);
    });

    return options;
  }, [initialColonias, initialClinics]);

  if (!isAuthenticated) {
    return <ModuleLoginForm title="Vacunación" onVerify={verifyVaccinePassword} onSuccess={() => setIsAuthenticated(true)} />;
  }

  const handleMonthChange = (month: Date) => {
    setCurrentMonth(month);
  };

  const refreshData = () => {
    setAvailabilityCache({});
    startTransition(() => {
        fetchAvailability(currentMonth);
        setSelectedDate(undefined);
        setSelectedTime(undefined);
        setSelectedVaccines([]);
        setPatientType(PatientType.General);
        setSelectedColoniaId(undefined);
    });
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (date && date < startOfToday()) {
        toast({ title: 'Fecha no válida', description: 'No puedes agendar en el pasado.', variant: 'destructive' });
        return;
    }
    setSelectedDate(date);
    setSelectedTime(undefined);
    setSelectedVaccines([]);
    setPatientType(PatientType.General);
  };
  
  const handleVaccineChange = (vaccines: Vaccine[]) => {
    setSelectedVaccines(vaccines);
  }

  const handleTimeSelect = (time: string) => {
    setSelectedTime(time);
  };
  
  const handleColoniaSelect = (coloniaId: string) => {
      setSelectedColoniaId(coloniaId);
  }

  const selectedColonia = initialColonias.find(c => c.id === selectedColoniaId);
  const selectedClinic = initialClinics.find(c => c.id === selectedColonia?.clinicId);

  return (
    <div className="container mx-auto px-4 py-8 md:py-12">
      <div className="text-center mb-8 flex flex-col items-center">
        <div className="text-primary mb-4">
          <Image
            src={logoBase64}
            alt="Logo CitaMedicaFacil"
            width={80}
            height={80}
            className="rounded-md"
          />
        </div>
        <h1 className="text-4xl lg:text-5xl font-bold font-headline text-foreground">
          Agenda tu Cita de Vacunación
        </h1>
        <p className="text-lg text-muted-foreground mt-2 max-w-2xl mx-auto">
          Selecciona un día, la vacuna que necesites, un horario y registra tus datos.
        </p>
      </div>

      <Card className="w-full max-w-6xl mx-auto shadow-xl border-border/60">
        <CardContent className="p-4 md:p-6 lg:p-8">
          <div className="grid md:grid-cols-2 gap-8 items-start">
            <div className="flex flex-col gap-8">
              <div>
                <h3 className="text-2xl font-semibold font-headline text-foreground mb-4 flex items-center justify-between">
                  <span className="flex items-center gap-2"><CalendarDays className="h-6 w-6" /> 1. Selecciona un día</span>
                   <Button variant="ghost" size="icon" onClick={refreshData} disabled={isPending}>
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
                  <>
                    <div>
                         <h3 className="text-2xl font-semibold font-headline text-foreground mb-4">
                            2. Indica tu tipo de paciente
                        </h3>
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-xl flex items-center gap-2">
                                    <UserCheck className="h-5 w-5 text-primary" />
                                    Tipo de Paciente
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Select onValueChange={(value: PatientType) => setPatientType(value)} value={patientType}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecciona un tipo" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="General">General</SelectItem>
                                        <SelectItem value="Crónico">Paciente Crónico</SelectItem>
                                        <SelectItem value="Embarazada">Embarazada</SelectItem>
                                        <SelectItem value="3ra Edad">Tercera Edad</SelectItem>
                                        <SelectItem value="Recién Nacido">Recién Nacido (sin CURP)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </CardContent>
                        </Card>
                    </div>

                    {!isNewborn && (
                        <div>
                            <h3 className="text-2xl font-semibold font-headline text-foreground mb-4">
                                3. Selecciona tu municipio
                            </h3>
                            <Card className="bg-card">
                                <CardHeader>
                                    <CardTitle className="text-xl flex items-center gap-2">
                                        <MapPin className="h-5 w-5 text-primary" />
                                        Municipio de Residencia
                                    </CardTitle>
                                    <CardDescription>Selecciona tu municipio para verificar que perteneces al área de atención.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Combobox
                                        options={coloniaOptions}
                                        value={selectedColoniaId || ''}
                                        onChange={handleColoniaSelect}
                                        placeholder="Busca y selecciona tu municipio..."
                                        searchPlaceholder="Escribe el nombre de tu municipio..."
                                        noResultsText="No se encontró el municipio."
                                    />
                                </CardContent>
                            </Card>
                        </div>
                    )}
                  </>
              )}

              {selectedDate && (isNewborn || selectedColoniaId) && (
                 <div>
                    <h3 className="text-2xl font-semibold font-headline text-foreground mb-4 flex items-center gap-2">
                        <ShieldPlus className="h-6 w-6" />
                        {isNewborn ? '3.' : '4.'} Selecciona la(s) Vacuna(s)
                    </h3>
                    <VaccineSelector
                      allVaccines={availableVaccines}
                      onSelectionChange={handleVaccineChange}
                      selectedVaccines={selectedVaccines}
                    />
                  </div>
              )}
            </div>

            <div className="flex flex-col gap-8">
              {selectedDate && (isNewborn || selectedColoniaId) && selectedVaccines.length > 0 && (
                <div>
                  <h3 className="text-2xl font-semibold font-headline text-foreground mb-4 flex items-center gap-2">
                    <Clock className="h-6 w-6" />
                    {isNewborn ? '4.' : '5.'} Selecciona una hora o lista de espera
                  </h3>
                  <Card className="bg-card">
                    <CardHeader>
                      <CardTitle className="text-xl flex items-center gap-2">
                        <Clock className="h-5 w-5 text-primary" />
                        Horarios Disponibles
                      </CardTitle>
                      <CardDescription>
                        Selecciona un horario para el{' '}
                        {format(selectedDate, 'PPP', { locale: es })}.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-4 gap-2">
                      {availableTimeSlots.length > 0 ? (
                        availableTimeSlots.map((time) => (
                          <button
                            key={time}
                            onClick={() => handleTimeSelect(time)}
                            className={cn(
                              "w-full p-2 border rounded-md text-center transition-colors font-medium text-xs",
                              selectedTime === time 
                                ? "bg-primary text-primary-foreground border-primary" 
                                : "bg-background hover:bg-accent border-border",
                              time.startsWith('Espera') && "border-yellow-500 text-yellow-700"
                            )}
                          >
                            {time}
                          </button>
                        ))
                      ) : (
                        <p className="col-span-4 text-center text-muted-foreground">
                          No hay espacios disponibles.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}

              <div>
                <h3 className="text-2xl font-semibold font-headline text-foreground mb-4 flex items-center gap-2">
                  <ShieldPlus className="h-6 w-6" />
                  {selectedDate && (isNewborn || selectedColoniaId) && selectedVaccines.length > 0 ? (isNewborn ? '5.' : '6.') : (isNewborn ? '4.' : '5.')} Completa los datos
                </h3>
                <VaccineBookingForm
                  selectedDate={selectedDate}
                  selectedTime={selectedTime}
                  selectedVaccines={selectedVaccines}
                  patientType={patientType}
                  clinicId={selectedClinic?.id}
                  coloniaName={selectedColonia?.name}
                  onBookingSuccess={refreshData}
                  announcements={announcements}
                />
              </div>

              {announcements && announcements.length > 0 && (
                <Card className="shadow-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl font-headline">
                      <Bell className="h-5 w-5 text-primary" />
                      Avisos Importantes
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 text-muted-foreground list-disc pl-5">
                      {announcements.map((announcement, index) => (
                        <li key={index}>{announcement}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


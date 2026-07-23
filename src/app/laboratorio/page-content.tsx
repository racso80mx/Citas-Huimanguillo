
'use client';
import React, { useState, useTransition, useCallback, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { logoBase64 } from '@/lib/logo-data';
import { LabBookingForm } from '@/components/laboratorio/lab-booking-form';
import { AvailabilityCalendar } from '@/components/availability-calendar';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import type { DailyAvailability, LabStudy, LabSettings, Holiday } from '@/lib/definitions';
import { PatientType } from '@/lib/definitions';
import { getLabAppointments, getHolidays, verifyLabPassword } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { FlaskConical, CalendarDays, Microscope, UserCheck, Bell, Info, CheckCircle2, AlertCircle, Clock, RefreshCw } from 'lucide-react';
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
import { LabStudiesSelector } from '@/components/laboratorio/lab-studies-selector';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ModuleLoginForm } from '@/components/shared/module-login-form';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type LabPageContentProps = {
  initialStudies: LabStudy[];
  initialSettings: LabSettings;
  initialAnnouncements: string[];
  initialHolidays: Holiday[];
};

export default function LabPageContent({
  initialStudies,
  initialSettings,
  initialAnnouncements,
  initialHolidays,
}: LabPageContentProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>();
  const [selectedStudies, setSelectedStudies] = React.useState<LabStudy[]>([]);
  const [selectedTime, setSelectedTime] = React.useState<string | undefined>();
  const [patientType, setPatientType] = React.useState<PatientType>(PatientType.General);

  const [availabilityCache, setAvailabilityCache] = useState<Record<string, DailyAvailability[]>>({});
  const [availability, setAvailability] = React.useState<DailyAvailability[]>([]);
  const [settings] = React.useState<LabSettings>(initialSettings);
  const [announcements] = React.useState<string[]>(initialAnnouncements);

  const [currentMonth, setCurrentMonth] = React.useState(new Date());
  const [isPending, startTransition] = React.useTransition();
  const { toast } = useToast();

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
        getLabAppointments({ startDate: startDate.toISOString(), endDate: endDate.toISOString() }),
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

        const maxSlots =
          isSpecialDay && settings.weekendBookingEnabled
            ? (settings.dailySlots + (settings.waitlistSlots || 0))
            : isSpecialDay
            ? 0
            : (settings.dailySlots + (settings.waitlistSlots || 0));

        const available = Math.max(0, maxSlots - appointmentsOnDate.length);
        const takenTimes = appointmentsOnDate.map(app => app.time);
        
        availabilityResult.push({
          date: dateString,
          availableSlots: available,
          availabilityByClinic: {},
          takenTimesByClinic: { 'lab': takenTimes },
        });
      }
      setAvailability(availabilityResult);
      setAvailabilityCache(prev => ({ ...prev, [monthKey]: availabilityResult }));
    },
    [settings, availabilityCache]
  );

  React.useEffect(() => {
    if (isAuthenticated) {
        startTransition(() => {
            fetchAvailability(currentMonth);
        });
    }
  }, [currentMonth, isAuthenticated, fetchAvailability]);

  const selectedDayAvailability = React.useMemo(() => {
    if (!selectedDate) return null;
    const dateString = format(selectedDate, 'yyyy-MM-dd');
    return availability.find((d) => d.date === dateString) || null;
  }, [selectedDate, availability]);

  const availableTimeSlots = React.useMemo(() => {
    if (!selectedDayAvailability) return [];
    
    const waitlistOptions = Array.from({ length: settings.waitlistSlots || 0 }, (_, i) => `Espera ${i + 1}`);
    const allOptions = ["Recepción General", ...waitlistOptions];
    const takenTimes = selectedDayAvailability.takenTimesByClinic['lab'] || [];
    
    return allOptions.filter(opt => {
        if (opt === "Recepción General") {
            const bookedCount = takenTimes.filter(t => t === "Recepción General").length;
            return bookedCount < settings.dailySlots;
        }
        return !takenTimes.includes(opt);
    });
  }, [selectedDayAvailability, settings]);

  if (!isAuthenticated) {
    return <ModuleLoginForm title="Laboratorio" onVerify={verifyLabPassword} onSuccess={() => setIsAuthenticated(true)} />;
  }

  const handleMonthChange = (month: Date) => {
    setCurrentMonth(month);
  };

  const refreshData = (reset = true) => {
    setAvailabilityCache({});
    startTransition(() => {
        fetchAvailability(currentMonth);
        if (reset) {
            setSelectedDate(undefined);
            setSelectedStudies([]);
            setSelectedTime(undefined);
            setPatientType(PatientType.General);
        }
    });
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (date && date < startOfToday()) {
        toast({ title: 'Fecha no válida', description: 'No puedes agendar en el pasado.', variant: 'destructive' });
        return;
    }
    setSelectedDate(date);
    setPatientType(PatientType.General);
    setSelectedStudies([]);
    setSelectedTime(undefined);
  };
  
  const handleStudiesChange = (studies: LabStudy[]) => {
      setSelectedStudies(studies);
  }

  const handleTimeSelect = (time: string) => {
    setSelectedTime(time);
  };

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
          Agenda tus Estudios de Laboratorio
        </h1>
        <p className="text-lg text-muted-foreground mt-2 max-w-2xl mx-auto">
          Selecciona un día, los estudios que necesites y registra tus datos.
        </p>
      </div>

      <Card className="w-full max-w-6xl mx-auto shadow-xl border-border/60">
        <CardContent className="p-4 md:p-6 lg:p-8">
          <div className="grid md:grid-cols-2 gap-8 items-start">
            <div className="flex flex-col gap-8">
              <div>
                <h3 className="text-2xl font-semibold font-headline text-foreground mb-4 flex items-center justify-between">
                  <span className="flex items-center gap-2"><CalendarDays className="h-6 w-6" /> 1. Selecciona un día</span>
                  <Button variant="ghost" size="icon" onClick={() => refreshData(false)} disabled={isPending}>
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
                
                {selectedDate && selectedDayAvailability && (
                  <Card className="mt-4 border-primary/20 bg-primary/5">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Info className="h-5 w-5 text-primary" />
                          <span className="font-semibold text-sm">Disponibilidad para el {format(selectedDate, 'dd/MM/yyyy')}:</span>
                        </div>
                        <Badge 
                          variant={selectedDayAvailability.availableSlots > 5 ? "secondary" : "destructive"}
                          className={cn(
                            "text-lg px-3 py-1 font-bold",
                            selectedDayAvailability.availableSlots > 5 ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
                          )}
                        >
                          {selectedDayAvailability.availableSlots === 0 ? (
                            <span className="flex items-center gap-1"><AlertCircle className="h-4 w-4" /> Agotado</span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <CheckCircle2 className="h-4 w-4" />
                              {selectedDayAvailability.availableSlots} citas disponibles
                            </span>
                          )}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

               {selectedDate && (
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
                                    <SelectItem value={PatientType.General}>General</SelectItem>
                                    <SelectItem value={PatientType.Cronico}>Paciente Crónico</SelectItem>
                                    <SelectItem value={PatientType.Embarazada}>Embarazada</SelectItem>
                                    <SelectItem value={PatientType.TerceraEdad}>Tercera Edad</SelectItem>
                                    <SelectItem value={PatientType.RecienNacido}>Recién Nacido (sin CURP)</SelectItem>
                                </SelectContent>
                            </Select>
                        </CardContent>
                    </Card>
                </div>
              )}

              {selectedDate && (
                <div>
                  <h3 className="text-2xl font-semibold font-headline text-foreground mb-4 flex items-center gap-2">
                    <FlaskConical className="h-6 w-6" />
                    3. Selecciona tus estudios
                  </h3>
                  <LabStudiesSelector
                    allStudies={initialStudies}
                    selectedStudies={selectedStudies}
                    onSelectionChange={handleStudiesChange}
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-8">
              {selectedDate && selectedStudies.length > 0 && (
                <div>
                  <h3 className="text-2xl font-semibold font-headline text-foreground mb-4 flex items-center gap-2">
                    <Clock className="h-6 w-6" />
                    4. Selecciona un turno o lista de espera
                  </h3>
                  <Card className="bg-card">
                    <CardHeader>
                      <CardTitle className="text-xl flex items-center gap-2">
                        Turnos Disponibles
                      </CardTitle>
                      <CardDescription>
                        Selecciona tu lugar para el {format(selectedDate, 'PPP', { locale: es })}.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-2">
                      {availableTimeSlots.map((time) => (
                        <button
                          key={time}
                          onClick={() => handleTimeSelect(time)}
                          className={cn(
                            "w-full p-3 border rounded-md text-center transition-colors font-bold",
                            selectedTime === time 
                              ? "bg-primary text-primary-foreground border-primary" 
                              : "bg-background hover:bg-accent border-border",
                            time.startsWith('Espera') && "border-yellow-500 text-yellow-700"
                          )}
                        >
                          {time}
                        </button>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              )}

              <div>
                <h3 className="text-2xl font-semibold font-headline text-foreground mb-4 flex items-center gap-2">
                  <Microscope className="h-6 w-6" />
                  {selectedDate && selectedStudies.length > 0 ? '5.' : '4.'} Completa tus datos
                </h3>
                <LabBookingForm
                  selectedDate={selectedDate}
                  selectedStudies={selectedStudies}
                  selectedTime={selectedTime}
                  patientType={patientType}
                  onBookingSuccess={refreshData}
                  dailySlots={settings.dailySlots}
                  weekendBookingEnabled={settings.weekendBookingEnabled}
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


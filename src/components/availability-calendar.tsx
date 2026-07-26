
'use client';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { DailyAvailability } from '@/lib/definitions';
import { format, parseISO, startOfToday, isValid, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2, CalendarSearch } from 'lucide-react';
import React, { useMemo, useState, useEffect } from 'react';
import { Skeleton } from './ui/skeleton';

type AvailabilityCalendarProps = {
  selectedDate: Date | undefined;
  onDateSelect: (date: Date | undefined) => void;
  availability: DailyAvailability[];
  onMonthChange: (month: Date) => void;
  isLoading: boolean;
};

export function AvailabilityCalendar({
  selectedDate,
  onDateSelect,
  availability,
  onMonthChange,
  isLoading,
}: AvailabilityCalendarProps) {
  const [isClient, setIsClient] = useState(false);
  
  // Manual date input states
  const [dayMonth, setDayMonth] = useState('');
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [monthToDisplay, setMonthToDisplay] = useState<Date | undefined>(undefined);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Sync inputs with selectedDate when it changes (e.g. clicking on calendar)
  useEffect(() => {
    if (selectedDate) {
      setDayMonth(format(selectedDate, 'dd/MM'));
      setYear(selectedDate.getFullYear().toString());
      
      // Update display month if it's different from the one currently shown
      if (!monthToDisplay || format(monthToDisplay, 'MM-yyyy') !== format(selectedDate, 'MM-yyyy')) {
        setMonthToDisplay(selectedDate);
      }
    }
  }, [selectedDate, monthToDisplay]);

  // OPTIMIZACIÓN: Crear un Map de disponibilidad para búsqueda instantánea
  const availabilityMap = useMemo(() => {
      const map = new Map<string, number>();
      availability.forEach(d => {
          map.set(d.date, d.availableSlots);
      });
      return map;
  }, [availability]);

  const handleManualDateChange = (dm: string, y: string) => {
    setDayMonth(dm);
    setYear(y);

    if (dm.length === 5 && y.length === 4) {
      const dateStr = `${dm}/${y}`;
      const parsedDate = parse(dateStr, 'dd/MM/yyyy', new Date());
      
      if (isValid(parsedDate)) {
        setMonthToDisplay(parsedDate);
        onMonthChange(parsedDate);
        onDateSelect(parsedDate);
      }
    }
  };

  const disabledDays = useMemo(() => {
    // Los días sin disponibilidad en el mapa se consideran bloqueados
    // Pero solo si ya tenemos datos para ese mes.
    const disabledByAvailability = availability
      .filter((d) => d.availableSlots === 0)
      .map((d) => parseISO(d.date));

    if (isClient) {
        return [{ before: startOfToday() }, ...disabledByAvailability];
    }
    
    return disabledByAvailability;

  }, [availability, isClient]);

  const modifiers = {
    available: (date: Date) => {
      const dateString = format(date, 'yyyy-MM-dd');
      const slots = availabilityMap.get(dateString);
      return slots !== undefined && slots > 0;
    },
  };

  const modifiersStyles = {
    available: {
      color: 'hsl(var(--accent-foreground))',
      backgroundColor: 'hsl(var(--accent))',
    },
    selected: {
        ring: '2px',
        ringColor: 'hsl(var(--primary))',
        ringOffset: '2px',
        ringOffsetColor: 'hsl(var(--background))',
    }
  };

  if (!isClient) {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="relative border rounded-md p-3 bg-card flex items-center justify-center">
            <Skeleton className="h-[320px] w-[280px]" />
        </div>
         <div className="text-center font-medium text-muted-foreground p-3 rounded-md w-full">
          <p>Selecciona una fecha para ver la disponibilidad.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <div className="grid grid-cols-2 gap-4 w-full bg-muted/30 p-4 rounded-xl border border-dashed border-primary/20 max-w-[300px] shadow-inner">
          <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase flex items-center gap-1 text-primary tracking-widest h-4">
                  <CalendarSearch className="h-3 w-3" /> Día / Mes
              </Label>
              <Input 
                  placeholder="Ej: 11/07" 
                  value={dayMonth}
                  onChange={(e) => {
                      let val = e.target.value.replace(/\D/g, '');
                      if (val.length > 2) {
                          val = val.substring(0, 2) + '/' + val.substring(2, 4);
                      }
                      handleManualDateChange(val.substring(0, 5), year);
                  }}
                  className="h-10 font-bold text-center border-primary/20 bg-background text-primary"
                  maxLength={5}
              />
          </div>
          <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase flex items-center text-primary tracking-widest h-4">
                  Año
              </Label>
              <Input 
                  type="number"
                  placeholder="Año" 
                  value={year}
                  onChange={(e) => handleManualDateChange(dayMonth, e.target.value.substring(0, 4))}
                  className="h-10 font-bold text-center border-primary/20 bg-background text-primary"
                  maxLength={4}
              />
          </div>
      </div>

      <div className="relative border rounded-xl p-3 bg-card shadow-sm w-fit">
        <Calendar
          locale={es}
          mode="single"
          selected={selectedDate}
          onSelect={onDateSelect}
          onMonthChange={(m) => {
              setMonthToDisplay(m);
              onMonthChange(m);
          }}
          month={monthToDisplay}
          disabled={disabledDays}
          modifiers={modifiers}
          modifiersStyles={modifiersStyles}
          className="p-0"
        />
        {isLoading && (
          <div className="absolute inset-0 bg-background/50 flex items-center justify-center backdrop-blur-[1px] z-10 rounded-xl">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
      </div>
       {!selectedDate && (
        <div className="text-center font-bold text-muted-foreground p-3 rounded-lg w-full border border-dashed text-[10px] bg-muted/5 max-w-[280px] uppercase tracking-wider">
          Selecciona un día en el gráfico para continuar
        </div>
      )}
    </div>
  );
}

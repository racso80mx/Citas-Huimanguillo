
'use client';
import { useState, useEffect, useTransition, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useToast } from '@/hooks/use-toast';
import { 
    updateClinics, getClinics, 
    getSpecialties, getServiceTypes,
    deleteClinic, getAppointmentCountOnDate
} from '@/lib/actions';
import { 
    Loader2, 
    PlusCircle, 
    Hospital, 
    Save, 
    Calendar as CalendarIcon, 
    X, 
    Clock,
    CalendarDays,
    Search,
    Fingerprint,
    Timer,
    CalendarPlus,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    Trash2,
    AlertTriangle,
    Settings2,
    RefreshCw
} from 'lucide-react';
import type { Clinic, Specialty, ServiceType } from '@/lib/definitions';
import { BookingMode } from '@/lib/definitions';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Calendar } from '../ui/calendar';
import { format, isValid, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { timeSlots30Min } from '@/lib/time-slots';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '../ui/checkbox';
import { Separator } from '../ui/separator';
import { cn } from '@/lib/utils';

const DAYS_OF_WEEK = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function ClinicEditDialog({ clinic, specialties, serviceTypes, onSave, onDelete, onCancel }: { 
    clinic: Clinic, 
    specialties: Specialty[], 
    serviceTypes: ServiceType[],
    onSave: (clinic: Clinic) => void, 
    onDelete?: (id: string) => void,
    onCancel: () => void 
}) {
    const [editedClinic, setEditedClinic] = useState<Clinic>(clinic);
    const [newScheduleDate, setNewScheduleDate] = useState<Date | undefined>();
    const [newScheduleEndTime, setNewScheduleEndTime] = useState<string>("13:00");
    const { toast } = useToast();

    const [isConfirmingBlock, setIsConfirmingBlock] = useState(false);
    const [pendingDates, setPendingDates] = useState<Date[] | undefined>();
    const [conflictInfo, setConflictInfo] = useState<{ date: string, count: number } | null>(null);

    useEffect(() => {
        setEditedClinic({ 
            ...clinic, 
            unavailableDates: clinic.unavailableDates || [], 
            daysOfAction: clinic.daysOfAction || [],
            customSchedules: clinic.customSchedules || [],
            waitlistSlots: clinic.waitlistSlots || 0
        });
    }, [clinic]);

    const handleFieldChange = (field: keyof Omit<Clinic, 'id'>, value: any) => {
        setEditedClinic(prev => ({...prev, [field]: value}));
    }

    const toggleDay = (day: string) => {
        const current = editedClinic.daysOfAction || [];
        const updated = current.includes(day) ? current.filter(d => d !== day) : [...current, day];
        handleFieldChange('daysOfAction', updated);
    };

    const handleDateSelection = async (dates: Date[] | undefined) => {
        const prevDates = editedClinic.unavailableDates || [];
        if (!dates || dates.length === 0) {
            handleFieldChange('unavailableDates', []);
            return;
        }

        // Si se agregó una fecha nueva, validar conflictos de citas
        if (dates.length > prevDates.length) {
            const newDate = dates.find(d => !prevDates.includes(format(d, 'yyyy-MM-dd')));
            if (newDate) {
                const dateStr = format(newDate, 'yyyy-MM-dd');
                const count = await getAppointmentCountOnDate(editedClinic.id, dateStr);
                if (count > 0) {
                    setConflictInfo({ date: format(newDate, 'dd/MM/yyyy'), count });
                    setPendingDates(dates);
                    setIsConfirmingBlock(true);
                    return;
                }
            }
        }

        const newDateStrings = Array.from(new Set(dates.map(d => format(d, 'yyyy-MM-dd'))));
        handleFieldChange('unavailableDates', newDateStrings);
    };

    const confirmBlockage = () => {
        if (pendingDates) {
            const newDateStrings = Array.from(new Set(pendingDates.map(d => format(d, 'yyyy-MM-dd'))));
            handleFieldChange('unavailableDates', newDateStrings);
        }
        setIsConfirmingBlock(false);
        setConflictInfo(null);
    };

    const handleRemoveUnavailableDate = (dateStr: string) => {
        const updated = editedClinic.unavailableDates?.filter(d => d !== dateStr) || [];
        handleFieldChange('unavailableDates', updated);
    };

    const addCustomSchedule = () => {
        if (!newScheduleDate) return;
        const dateStr = format(newScheduleDate, 'yyyy-MM-dd');
        const existing = editedClinic.customSchedules || [];
        if (existing.some(s => s.date === dateStr)) return;
        handleFieldChange('customSchedules', [...existing, { date: dateStr, endTime: newScheduleEndTime, reason: 'Salida Temprana' }]);
        setNewScheduleDate(undefined);
    };

    const removeCustomSchedule = (dateStr: string) => {
        handleFieldChange('customSchedules', editedClinic.customSchedules?.filter(s => s.date !== dateStr) || []);
    };

    const dynamicBreakSlots = useMemo(() => {
        if (!editedClinic.startTime || !editedClinic.endTime) return [];
        const slots: Set<string> = new Set();
        try {
            const startParts = editedClinic.startTime.split(':').map(Number);
            const endParts = editedClinic.endTime.split(':').map(Number);
            let current = new Date(1970, 0, 1, startParts[0], startParts[1]);
            const end = new Date(1970, 0, 1, endParts[0], endParts[1]);
            while (current < end) {
                slots.add(current.toTimeString().substring(0, 5));
                current = new Date(current.getTime() + (editedClinic.consultationDuration || 30) * 60000);
            }
            if (editedClinic.breakTime) slots.add(editedClinic.breakTime);
        } catch (e) {}
        return Array.from(slots).sort();
    }, [editedClinic.startTime, editedClinic.endTime, editedClinic.consultationDuration, editedClinic.breakTime]);

    return (
        <DialogContent className="sm:max-w-[90vw] h-[95vh] flex flex-col p-0 overflow-hidden text-foreground">
            <DialogHeader className="p-6 shrink-0 border-b bg-muted/10">
                <div className="flex items-center justify-between">
                    <div>
                        <DialogTitle className="text-2xl font-black uppercase">Configuración de Unidad Médica</DialogTitle>
                        <div className="font-bold text-primary">{editedClinic.name || "Nueva Unidad"}</div>
                    </div>
                    {onDelete && clinic.id && !clinic.id.startsWith('new') && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" size="sm" className="font-bold">
                                    <Trash2 className="mr-2 h-4 w-4" /> ELIMINAR UNIDAD
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>¿Eliminar esta unidad médica?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Esta acción es irreversible y eliminará todos los horarios y configuraciones asociados a <strong>{clinic.name}</strong>.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => onDelete(clinic.id)} className="bg-destructive hover:bg-destructive/90">Sí, Eliminar Permanentemente</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                </div>
            </DialogHeader>
            <ScrollArea className="flex-1">
                 <div className="p-8 space-y-12">
                    <div className="space-y-6">
                        <h4 className="text-sm font-black text-primary uppercase tracking-widest flex items-center gap-2"><Fingerprint className="h-5 w-5" /> 1. Datos Generales</h4>
                        <div className='grid sm:grid-cols-3 gap-8'>
                            <div className='space-y-2'><Label className="font-black text-[10px] uppercase opacity-60 tracking-tighter">Nombre de la Unidad</Label><Input value={editedClinic.name} onChange={(e) => handleFieldChange('name', e.target.value.toUpperCase())} className="h-12 font-bold" /></div>
                            <div className='space-y-2'><Label className="font-black text-[10px] uppercase opacity-60 tracking-tighter">Médico Responsable</Label><Input value={editedClinic.doctorName} onChange={(e) => handleFieldChange('doctorName', e.target.value.toUpperCase())} className="h-12 font-bold" /></div>
                            <div className='space-y-2'><Label className="font-black text-[10px] uppercase opacity-60 tracking-tighter">Cédula Profesional</Label><Input value={editedClinic.professionalLicense || ''} onChange={(e) => handleFieldChange('professionalLicense', e.target.value.toUpperCase())} className="h-12 font-mono" /></div>
                        </div>
                        <div className='grid sm:grid-cols-2 gap-8'>
                            <div className='space-y-2'><Label className="font-black text-[10px] uppercase opacity-60 tracking-tighter">Categoría de Atención</Label><Select value={editedClinic.serviceTypeId} onValueChange={(v) => handleFieldChange('serviceTypeId', v)}><SelectTrigger className="h-12 font-bold"><SelectValue /></SelectTrigger><SelectContent>{serviceTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select></div>
                            <div className='space-y-2'><Label className="font-black text-[10px] uppercase opacity-60 tracking-tighter">Especialidad</Label><Select value={editedClinic.specialtyId || 'none'} onValueChange={(v) => handleFieldChange('specialtyId', v === 'none' ? undefined : v)}><SelectTrigger className="h-12 font-bold"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">General / No Especializado</SelectItem>{specialties.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
                        </div>
                    </div>
                    
                    <Separator />
                    
                    <div className="space-y-6">
                        <h4 className="text-sm font-black text-primary uppercase tracking-widest flex items-center gap-2"><Timer className="h-5 w-5" /> 2. Gestión de Horarios y Cupos</h4>
                        <div className='grid grid-cols-2 md:grid-cols-6 gap-6 bg-primary/5 p-6 rounded-3xl border border-primary/10 shadow-inner'>
                            <div className='space-y-2'><Label className="text-[10px] font-black uppercase text-primary">Cupo Diario</Label><Input type="number" value={editedClinic.dailySlots} onChange={(e) => handleFieldChange('dailySlots', parseInt(e.target.value,10) || 0)} className="h-11 font-black text-center" /></div>
                            <div className='space-y-2'><Label className="text-[10px] font-black uppercase text-primary">Lista de Espera</Label><Input type="number" value={editedClinic.waitlistSlots || 0} onChange={(e) => handleFieldChange('waitlistSlots', parseInt(e.target.value,10) || 0)} className="h-11 font-black text-center bg-blue-50 border-blue-200" /></div>
                            <div className='space-y-2'><Label className="text-[10px] font-black uppercase text-primary">Duración (min)</Label><Input type="number" value={editedClinic.consultationDuration || 30} onChange={(e) => handleFieldChange('consultationDuration', parseInt(e.target.value,10) || 30)} className="h-11 font-black text-center" /></div>
                            <div className='space-y-2'><Label className="text-[10px] font-black uppercase text-primary">Entrada</Label><Select value={editedClinic.startTime} onValueChange={(v) => handleFieldChange('startTime', v)}><SelectTrigger className="h-11 font-bold"><SelectValue /></SelectTrigger><SelectContent>{timeSlots30Min.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></div>
                            <div className='space-y-2'><Label className="text-[10px] font-black uppercase text-primary">Salida</Label><Select value={editedClinic.endTime} onValueChange={(v) => handleFieldChange('endTime', v)}><SelectTrigger className="h-11 font-bold"><SelectValue /></SelectTrigger><SelectContent>{timeSlots30Min.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></div>
                            <div className='space-y-2'><Label className="text-[10px] font-black uppercase text-primary">Descanso</Label><Select value={editedClinic.breakTime || 'none'} onValueChange={(v) => handleFieldChange('breakTime', v === 'none' ? undefined : v)}>
                                <SelectTrigger className="h-11 font-bold bg-orange-50 border-orange-200"><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="none">Sin Descanso</SelectItem>{dynamicBreakSlots.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                            </Select></div>
                        </div>
                    </div>

                    <Separator />

                    <div className="grid lg:grid-cols-2 gap-10">
                        <div className="space-y-4">
                            <Label className="text-sm font-black text-primary uppercase flex items-center gap-2"><CalendarDays className="h-5 w-5" /> 3. Días de Atención Semanal</Label>
                            <div className="flex flex-wrap gap-3 p-6 bg-muted/20 border-2 border-dashed rounded-3xl">
                                {DAYS_OF_WEEK.map(day => (<div key={day} className="flex items-center space-x-3 bg-background p-3 px-4 rounded-xl border-2 shadow-sm"><Checkbox id={`day-${day}`} checked={editedClinic.daysOfAction?.includes(day)} onCheckedChange={() => toggleDay(day)} /><Label htmlFor={`day-${day}`} className="text-xs font-black uppercase cursor-pointer">{day}</Label></div>))}
                            </div>
                        </div>
                        <div className="space-y-4">
                            <Label className="text-sm font-black text-primary uppercase flex items-center gap-2"><Clock className="h-5 w-5" /> Parámetros Operativos</Label>
                            <div className="p-6 bg-muted/20 border-2 border-dashed rounded-3xl space-y-6">
                                <div className="flex items-center justify-between p-4 bg-background rounded-2xl border-2 shadow-sm"><Label className="text-sm font-black uppercase">Atención Sábados/Domingos</Label><Switch checked={editedClinic.weekendBookingEnabled} onCheckedChange={(v) => handleFieldChange('weekendBookingEnabled', v)} /></div>
                                <div className="flex items-center justify-between p-4 bg-background rounded-2xl border-2 shadow-sm"><Label className="text-sm font-black uppercase">Método de Asignación</Label><Select value={editedClinic.bookingMode} onValueChange={(v: BookingMode) => handleFieldChange('bookingMode', v)}><SelectTrigger className="w-44 h-10 font-bold"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={BookingMode.Time}>Por Horario (Exacto)</SelectItem><SelectItem value={BookingMode.Token}>Por Ficha (General)</SelectItem></SelectContent></Select></div>
                            </div>
                        </div>
                    </div>

                    <Separator />

                    <div className='space-y-6'>
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-black text-primary uppercase tracking-widest flex items-center gap-2">
                                <CalendarDays className="h-5 w-5" /> 4. Vacaciones y Bloqueos Totales
                            </h4>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className='h-11 font-black bg-destructive/5 text-destructive border-destructive/20 hover:bg-destructive/10'>
                                        <CalendarPlus className="mr-2 h-5 w-5" /> SELECCIONAR DÍAS DE BLOQUEO
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className='w-auto p-0' align="end">
                                    <Calendar 
                                        mode="multiple" 
                                        selected={(editedClinic.unavailableDates || []).map(d => new Date(d + 'T12:00:00'))} 
                                        onSelect={handleDateSelection} 
                                        locale={es} 
                                        disabled={{ before: new Date() }} 
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                        
                        <div className="border rounded-2xl overflow-hidden bg-background shadow-sm">
                            <Table>
                                <TableHeader className="bg-muted/50">
                                    <TableRow>
                                        <TableHead className="font-bold text-[10px] uppercase">Fecha Bloqueada</TableHead>
                                        <TableHead className="font-bold text-[10px] uppercase">Motivo / Concepto</TableHead>
                                        <TableHead className="w-[100px] text-right pr-6">Acción</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {editedClinic.unavailableDates?.length ? editedClinic.unavailableDates.map(dateStr => (
                                        <TableRow key={dateStr} className="hover:bg-muted/30 transition-colors">
                                            <TableCell className="font-black text-sm uppercase">
                                                {format(new Date(dateStr + 'T12:00:00'), "eeee dd 'de' MMMM, yyyy", { locale: es })}
                                            </TableCell>
                                            <TableCell><Badge variant="outline" className="text-[10px] font-black uppercase bg-red-50 text-red-700 border-red-200">Vacaciones / Bloqueo Total</Badge></TableCell>
                                            <TableCell className="text-right pr-6">
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => handleRemoveUnavailableDate(dateStr)}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    )) : (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-center py-20 opacity-30 uppercase font-black text-xs">Sin días bloqueados por vacaciones</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>

                    <Separator />

                    <div className="space-y-6">
                        <h4 className="text-sm font-black text-primary uppercase tracking-widest flex items-center gap-2"><Timer className="h-5 w-5" /> 5. Salidas Tempranas y Horarios Especiales</h4>
                        <div className="grid sm:grid-cols-3 gap-6 items-end bg-blue-50/50 p-6 rounded-3xl border border-blue-100 shadow-sm">
                             <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-blue-700">Fecha del Cambio</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className="w-full h-12 justify-start font-bold bg-background">
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {newScheduleDate ? format(newScheduleDate, 'dd/MM/yyyy') : "Elegir Fecha..."}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={newScheduleDate} onSelect={setNewScheduleDate} locale={es} disabled={{ before: new Date() }} /></PopoverContent>
                                </Popover>
                             </div>
                             <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-blue-700">Hora de Cierre</Label>
                                <Select value={newScheduleEndTime} onValueChange={setNewScheduleEndTime}>
                                    <SelectTrigger className="h-12 font-bold bg-background"><SelectValue /></SelectTrigger>
                                    <SelectContent>{timeSlots30Min.map(t => <SelectItem key={`sched-${t.value}`} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                                </Select>
                             </div>
                             <Button onClick={addCustomSchedule} disabled={!newScheduleDate} className="h-12 font-black bg-blue-600 hover:bg-blue-700 uppercase tracking-widest">ASIGNAR SALIDA</Button>
                        </div>
                        
                        <div className="border rounded-2xl overflow-hidden bg-background shadow-sm">
                            <Table>
                                <TableHeader className="bg-muted/50">
                                    <TableRow>
                                        <TableHead className="font-bold text-[10px] uppercase">Fecha</TableHead>
                                        <TableHead className="font-bold text-[10px] uppercase text-center">Hora Cierre</TableHead>
                                        <TableHead className="w-[100px] text-right pr-6">Acción</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {editedClinic.customSchedules?.length ? editedClinic.customSchedules.map(sched => (
                                        <TableRow key={sched.date} className="hover:bg-muted/30 transition-colors">
                                            <TableCell className="font-black text-sm uppercase">
                                                {format(new Date(sched.date + 'T12:00:00'), "eeee dd 'de' MMMM", { locale: es })}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Badge className="bg-blue-600 text-white font-black h-7 px-4">{sched.endTime} HRS</Badge>
                                            </TableCell>
                                            <TableCell className="text-right pr-6">
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => removeCustomSchedule(sched.date)}>
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    )) : (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-center py-20 opacity-30 uppercase font-black text-xs">No hay cierres especiales programados</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </div>
            </ScrollArea>
            <DialogFooter className="p-6 border-t bg-muted/10 shrink-0">
                <Button onClick={() => onSave(editedClinic)} className="h-14 px-12 text-lg font-black uppercase shadow-2xl bg-primary hover:bg-primary/90 rounded-2xl transition-all hover:scale-[1.02]">
                    <Save className="mr-2 h-6 w-6" /> GUARDAR TODA LA CONFIGURACIÓN
                </Button>
            </DialogFooter>

            <AlertDialog open={isConfirmingBlock} onOpenChange={setIsConfirmingBlock}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                            <AlertTriangle className="h-6 w-6" /> ADVERTENCIA DE SEGURIDAD
                        </AlertDialogTitle>
                        <div className="space-y-4 pt-2 text-sm text-muted-foreground">
                            <div className="font-bold text-foreground">
                                Se han detectado <span className="text-primary text-lg">{conflictInfo?.count}</span> pacientes agendados para el día <span className="text-primary">{conflictInfo?.date}</span>.
                            </div>
                            <div className="text-xs">
                                Si bloqueas este día, las citas actuales permanecerán registradas pero no se permitirán nuevas reservas. ¿Deseas continuar con el bloqueo de vacaciones?
                            </div>
                        </div>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <Button variant="outline" onClick={() => { setIsConfirmingBlock(false); setConflictInfo(null); setPendingDates(undefined); }}>Cancelar y revisar fecha</Button>
                        <Button onClick={confirmBlockage} className="bg-destructive hover:bg-destructive/90 font-bold">SÍ, APLICAR BLOQUEO</Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </DialogContent>
    );
}

export function ClinicsManager() {
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, startSavingTransition] = useTransition();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof Clinic; direction: 'asc' | 'desc' } | null>({ key: 'name', direction: 'asc' });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null);
  const { toast } = useToast();

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [clinicsData, specialtiesData, servicesData] = await Promise.all([
        getClinics(),
        getSpecialties(),
        getServiceTypes()
      ]);
      setClinics(clinicsData);
      setSpecialties(specialtiesData);
      setServiceTypes(servicesData);
    } catch (error) {
      console.error('Failed to fetch clinics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSort = (key: keyof Clinic) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: keyof Clinic) => {
    if (!sortConfig || sortConfig.key !== key) return <ArrowUpDown className="ml-2 h-4 w-4 opacity-30" />;
    return sortConfig.direction === 'asc' ? <ArrowUp className="ml-2 h-4 w-4 text-primary" /> : <ArrowDown className="ml-2 h-4 w-4 text-primary" />;
  };

  const filteredAndSortedClinics = useMemo(() => {
    let result = clinics.filter(c => 
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      c.doctorName.toLowerCase().includes(searchTerm.toLowerCase())
    );
    if (sortConfig) {
      result.sort((a, b) => {
        const valA = String((a as any)[sortConfig.key] || '').toLowerCase();
        const valB = String((b as any)[sortConfig.key] || '').toLowerCase();
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [clinics, searchTerm, sortConfig]);

  const handleEditClick = (clinic: Clinic) => {
    setSelectedClinic(clinic);
    setIsDialogOpen(true);
  };

  const handleAddNew = () => {
    const newClinic: Clinic = {
        id: `new-${uuidv4()}`,
        name: '',
        doctorName: '',
        password: '123',
        dailySlots: 15,
        waitlistSlots: 0,
        startTime: '08:00',
        endTime: '13:00',
        weekendBookingEnabled: false,
        serviceTypeId: serviceTypes[0]?.id || '',
        bookingMode: BookingMode.Time,
        consultationDuration: 30,
        unavailableDates: [],
        daysOfAction: ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]
    };
    setSelectedClinic(newClinic);
    setIsDialogOpen(true);
  };

  const handleDialogSave = (updatedClinic: Clinic) => {
    const isNew = updatedClinic.id.startsWith('new');
    let finalClinics: Clinic[];
    if (isNew) {
        const newId = uuidv4();
        finalClinics = [...clinics, { ...updatedClinic, id: newId }];
    } else {
        finalClinics = clinics.map(c => c.id === updatedClinic.id ? updatedClinic : c);
    }
    startSavingTransition(async () => {
        const result = await updateClinics(finalClinics);
        if (result.success) {
            toast({ title: 'Unidad Actualizada' });
            setIsDialogOpen(false);
            setSelectedClinic(null);
            fetchData();
        }
    });
  };

  const handleBulkSave = () => {
      startSavingTransition(async () => {
          const result = await updateClinics(clinics);
          if (result.success) {
              toast({ title: 'Catálogo Sincronizado Exitosamente' });
              fetchData();
          }
      });
  };

  const handleDeleteClinic = async (id: string) => {
      startSavingTransition(async () => {
          const res = await deleteClinic(id);
          if (res.success) {
              toast({ title: 'Unidad Eliminada' });
              setIsDialogOpen(false);
              setSelectedClinic(null);
              fetchData();
          }
      });
  };

  if (isLoading) return <div className="p-12 flex justify-center"><Loader2 className="animate-spin h-10 w-10 text-primary" /></div>;

  return (
    <div className="space-y-6">
      <Card className="shadow-lg border-primary/10">
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-4">
          <div>
            <CardTitle className="text-2xl font-bold font-headline flex items-center gap-2">
              <Hospital className="h-6 w-6 text-primary" /> Gestión de Consultorios y Núcleos
            </CardTitle>
            <CardDescription>Configura los horarios, vacaciones y disponibilidad de cada unidad médica.</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={fetchData} className="h-10"><RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} /></Button>
            <Button onClick={handleAddNew} className="h-10 bg-primary hover:bg-primary/90 font-bold"><PlusCircle className="mr-2 h-4 w-4" /> Nueva Unidad</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                    placeholder="Buscar por consultorio o médico..." 
                    className="pl-9 h-11 border-primary/20"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
            </div>
            <div className="border rounded-xl overflow-hidden">
                <Table>
                    <TableHeader className="bg-muted/50">
                        <TableRow>
                            <TableHead className="cursor-pointer hover:bg-muted" onClick={() => handleSort('name')}>
                                <div className="flex items-center">Consultorio {getSortIcon('name')}</div>
                            </TableHead>
                            <TableHead className="cursor-pointer hover:bg-muted" onClick={() => handleSort('doctorName')}>
                                <div className="flex items-center">Médico {getSortIcon('doctorName')}</div>
                            </TableHead>
                            <TableHead>Horario / Cupo</TableHead>
                            <TableHead className="w-[100px] text-right pr-6">Config.</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredAndSortedClinics.map(clinic => (
                            <TableRow key={clinic.id} className="hover:bg-muted/30">
                                <TableCell>
                                    <div className="flex flex-col">
                                        <span className="font-bold text-sm uppercase">{clinic.name}</span>
                                        <Badge variant="outline" className="w-fit text-[9px] mt-1 uppercase font-black text-muted-foreground border-muted-foreground/30">
                                            {serviceTypes.find(t => t.id === clinic.serviceTypeId)?.name || 'N/A'}
                                        </Badge>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <span className="text-xs font-bold uppercase text-primary">Dr. {clinic.doctorName}</span>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2 text-xs font-black text-muted-foreground">
                                        <Clock className="h-3 w-3" /> {clinic.startTime} - {clinic.endTime}
                                        <Badge className="bg-primary/5 text-primary text-[10px] h-5 border-primary/20">{clinic.dailySlots} Citas</Badge>
                                        {(clinic.unavailableDates?.length || 0) > 0 && <Badge className="bg-red-50 text-red-600 text-[10px] border-red-200">VACACIONES</Badge>}
                                    </div>
                                </TableCell>
                                <TableCell className="text-right pr-6">
                                    <Button variant="ghost" size="icon" onClick={() => handleEditClick(clinic)} className="hover:bg-primary/10 text-primary">
                                        <Settings2 className="h-5 w-5" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </CardContent>
        <CardFooter className="bg-muted/5 border-t py-4">
             <Button onClick={handleBulkSave} disabled={isSaving || clinics.length === 0} className="w-full h-12 font-black uppercase shadow-lg bg-primary hover:bg-primary/90 text-white">
                <Save className="mr-2 h-5 w-5" /> GUARDAR CATÁLOGO DE UNIDADES
             </Button>
        </CardFooter>
      </Card>

      {selectedClinic && (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <ClinicEditDialog 
            clinic={selectedClinic} 
            specialties={specialties} 
            serviceTypes={serviceTypes}
            onSave={handleDialogSave}
            onDelete={handleDeleteClinic}
            onCancel={() => { setIsDialogOpen(false); setSelectedClinic(null); }}
          />
        </Dialog>
      )}
    </div>
  );
}


'use client';
import { useState, useTransition, useMemo, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableCaption,
} from '@/components/ui/table';
import type { LabAppointment, Patient, AppointmentStatus, ModuleSettings, DailyAvailability } from '@/lib/definitions';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '../ui/button';
import { Trash2, FlaskConical, Pencil, Loader2, ArrowUpDown, ArrowUp, ArrowDown, FileDown, ClipboardCopy, MessageCircle, ChevronDown, RefreshCw } from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { EditPatientForm } from '../admin/edit-patient-form';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { updateAppointmentStatus, rescheduleAppointment, cloneAppointment, getAnnouncements, getModuleSettings, getAvailableSlotsForDate, getLabSettings } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Calendar } from '../ui/calendar';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { generateLabAppointmentPDF } from '@/lib/report-helpers';


type LabAppointmentListProps = {
  appointments: LabAppointment[];
  isAdmin?: boolean;
  onDelete?: (id: string) => void;
  onEditSuccess?: () => void;
};

type SortableKeys = keyof LabAppointment | 'patientName' | 'curp' | 'phoneNumber';

export function LabAppointmentList({ appointments, isAdmin = false, onDelete, onEditSuccess }: LabAppointmentListProps) {
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [isUpdating, startUpdateTransition] = useTransition();
  const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'ascending' | 'descending' } | null>(null);

  const [reschedulingAppointment, setReschedulingAppointment] = useState<LabAppointment | null>(null);
  const [newDate, setNewDate] = useState<Date | undefined>();
  const [newTime, setNewTime] = useState<string | undefined>();
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [isFetchingSlots, startFetchingSlots] = useTransition();
  const [isRescheduling, startRescheduleTransition] = useTransition();
  
  const [cloningAppointment, setCloningAppointment] = useState<LabAppointment | null>(null);
  const [newCloneDate, setNewCloneDate] = useState<Date | undefined>();
  const [isCloning, startCloneTransition] = useTransition();
  
  const [announcements, setAnnouncements] = useState<string[]>([]);
  const [settings, setSettings] = useState<ModuleSettings | null>(null);
  const { toast } = useToast();
  
  useEffect(() => {
    async function fetchData() {
      const [annData, settData] = await Promise.all([
        getAnnouncements(),
        getModuleSettings()
      ]);
      setAnnouncements(annData);
      setSettings(settData);
    }
    fetchData();
  }, []);

  useEffect(() => {
    if (reschedulingAppointment && newDate) {
        startFetchingSlots(async () => {
            const dateStr = format(newDate, 'yyyy-MM-dd');
            const [labSettings, allAppointments] = await Promise.all([getLabSettings(), getLabAppointments()]);
            
            const bookedOnDate = allAppointments.filter(a => a.date.split('T')[0] === dateStr);
            const waitlistOptions = Array.from({ length: labSettings.waitlistSlots || 0 }, (_, i) => `Espera ${i + 1}`);
            const allOptions = ["Recepción General", ...waitlistOptions];
            
            const free = allOptions.filter(opt => {
                if (opt === "Recepción General") {
                    const count = bookedOnDate.filter(t => t.time === "Recepción General").length;
                    return count < labSettings.dailySlots;
                }
                return !bookedOnDate.some(a => a.time === opt);
            });
            setAvailableSlots(free);
            setNewTime(undefined);
        });
    }
  }, [reschedulingAppointment, newDate]);

  const handleCopyCurp = (curp: string) => {
    navigator.clipboard.writeText(curp).then(() => {
      toast({ title: 'CURP Copiada' });
    });
  };

  const handleWhatsApp = (app: LabAppointment) => {
    const phone = app.patient?.phoneNumber;
    if (!phone) return;
    const cleanPhone = phone.replace(/\D/g, '');
    const formattedDate = format(parseISO(app.date), "eeee dd 'de' MMMM", { locale: es });
    const studiesList = app.studies.map(s => s.name).join(', ');
    const message = encodeURIComponent(`Hola ${app.patient.name}, le informamos que su cita de laboratorio ha sido reagendada para el día ${formattedDate} en el turno ${app.time}. Estudios: ${studiesList}.`);
    window.open(`https://wa.me/52${cleanPhone}?text=${message}`, '_blank');
  };

  const sortedAppointments = useMemo(() => {
    let sortableItems = [...appointments];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let aValue, bValue;
        switch (sortConfig.key) {
          case 'patientName':
            aValue = a.patient ? `${a.patient.name} ${a.patient.paternalLastName} ${a.patient.maternalLastName}` : '';
            bValue = b.patient ? `${b.patient.name} ${b.patient.paternalLastName} ${b.patient.maternalLastName}` : '';
            break;
          case 'curp': aValue = a.patient?.curp || ''; bValue = b.patient?.curp || ''; break;
          case 'phoneNumber': aValue = a.patient?.phoneNumber || ''; bValue = b.patient?.phoneNumber || ''; break;
          case 'date': aValue = new Date(a.date).getTime(); bValue = new Date(b.date).getTime(); break;
          default:
            aValue = a[sortConfig.key as keyof LabAppointment];
            bValue = b[sortConfig.key as keyof LabAppointment];
        }
        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;
        if (typeof aValue === 'string' && typeof bValue === 'string') return sortConfig.direction === 'ascending' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        return sortConfig.direction === 'ascending' ? (aValue < bValue ? -1 : 1) : (aValue > bValue ? -1 : 1);
      });
    }
    return sortableItems;
  }, [appointments, sortConfig]);

  const requestSort = (key: SortableKeys) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const handleStatusChange = (appointmentId: string, status: AppointmentStatus) => {
    startUpdateTransition(async () => {
      await updateAppointmentStatus(appointmentId, status, 'lab');
      onEditSuccess?.();
    });
  };
  
  const handleRescheduleConfirm = () => {
    if (!reschedulingAppointment || !newDate || !newTime) return;
    startRescheduleTransition(async () => {
        const result = await rescheduleAppointment(reschedulingAppointment.id, newDate.toISOString(), 'lab', newTime);
        if (result.success) {
            toast({ title: 'Cita Reprogramada' });
            const whatsappEnabled = isAdmin ? settings?.archivoWhatsAppEnabled : settings?.laboratorioWhatsAppEnabled;
            if (whatsappEnabled && reschedulingAppointment.patient?.phoneNumber) {
                const phone = reschedulingAppointment.patient.phoneNumber.replace(/\D/g, '');
                const oldDate = format(parseISO(reschedulingAppointment.date), "dd/MM/yyyy", { locale: es });
                const newDateFormatted = format(newDate, "eeee dd 'de' MMMM", { locale: es });
                const msg = encodeURIComponent(`Hola ${reschedulingAppointment.patient.name}, su cita de laboratorio del dia ${oldDate} ha sido reagendada. Nueva cita: ${newDateFormatted} en el turno ${newTime}.`);
                window.open(`https://wa.me/52${phone}?text=${msg}`, '_blank');
            }
            setReschedulingAppointment(null);
            onEditSuccess?.();
        }
    });
  };

  const handleDownloadPDF = async (appointment: LabAppointment) => {
    const ann = await getAnnouncements();
    await generateLabAppointmentPDF(appointment, ann);
  };

  if (!appointments || appointments.length === 0) return <div className="text-center py-10 opacity-60">No hay citas de laboratorio.</div>;

  return (
    <TooltipProvider>
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead><Button variant="ghost" onClick={() => requestSort('status')}>Estado</Button></TableHead>
            <TableHead>Folio</TableHead>
            <TableHead>Fecha / Hora</TableHead>
            <TableHead>Paciente</TableHead>
            <TableHead>CURP</TableHead>
            <TableHead>Teléfono</TableHead>
            <TableHead>Estudios</TableHead>
            {isAdmin && <TableHead className="text-right">Acciones</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedAppointments.map((app) => (
            <TableRow key={app.id}>
              <TableCell>
                {onEditSuccess ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-28 h-8 text-[10px] font-bold uppercase" disabled={isUpdating}>{app.status || 'Agendada'}</Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onSelect={() => handleStatusChange(app.id, 'Atendido')}>Atendido</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => handleStatusChange(app.id, 'No Atendido')}>No Atendido</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => handleStatusChange(app.id, 'No Asistió')}>No Asistió</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => setReschedulingAppointment(app)}>Cambiar Cita</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : <Badge variant="outline" className="text-[10px] uppercase">{app.status || 'Agendada'}</Badge>}
              </TableCell>
              <TableCell className="font-mono text-xs">{app.appointmentNumber}</TableCell>
              <TableCell className="font-medium text-xs">
                {format(parseISO(app.date), 'dd/MM/yy', { locale: es })}
                <span className='block text-[10px] text-muted-foreground font-bold'>{app.time}</span>
              </TableCell>
              <TableCell className="font-bold text-sm uppercase">{app.patient ? `${app.patient.name} ${app.patient.paternalLastName}` : 'N/A'}</TableCell>
              <TableCell className="font-mono text-xs">{app.patient?.curp || 'N/A'}</TableCell>
              <TableCell className="text-xs">{app.patient?.phoneNumber || 'N/A'}</TableCell>
              <TableCell>
                 <Tooltip>
                    <TooltipTrigger asChild><Button variant="ghost" size="icon"><FlaskConical className="h-4 w-4" /></Button></TooltipTrigger>
                    <TooltipContent><p className='font-bold mb-2'>Estudios:</p><ul className='list-disc pl-4'>{app.studies.map(s => <li key={s.id}>{s.name}</li>)}</ul></TooltipContent>
                </Tooltip>
              </TableCell>
               {isAdmin && (
                <TableCell className="text-right">
                   <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="h-8 border-primary/20"><ChevronDown className="h-3 w-3" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleWhatsApp(app)}><MessageCircle className="mr-2 h-4 w-4 text-green-600" /> WhatsApp</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDownloadPDF(app)}><FileDown className="mr-2 h-4 w-4 text-gray-500" /> PDF</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <AlertDialog>
                        <AlertDialogTrigger asChild><DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Eliminar</DropdownMenuItem></AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>¿Eliminar cita?</AlertDialogTitle></AlertDialogHeader>
                          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => onDelete?.(app.id)} className='bg-destructive'>Eliminar</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

       {reschedulingAppointment && (
        <Dialog open={!!reschedulingAppointment} onOpenChange={(o) => !o && setReschedulingAppointment(null)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Reprogramar Laboratorio</DialogTitle>
                    <DialogDescription>Elige nueva fecha y turno para <span className="font-bold">{reschedulingAppointment.patient.name}</span>.</DialogDescription>
                </DialogHeader>
                <div className="flex justify-center py-4">
                    <Calendar mode="single" selected={newDate} onSelect={setNewDate} locale={es} disabled={{ before: new Date() }} />
                </div>
                {newDate && (
                    <div className="space-y-2 px-4 pb-4">
                        {isFetchingSlots ? <p className="text-xs animate-pulse">Cargando disponibilidad...</p> : (
                            <div className="space-y-2">
                                <Label className="text-xs font-black uppercase text-primary">Turno Disponible</Label>
                                <Select onValueChange={setNewTime} value={newTime}>
                                    <SelectTrigger className="h-11 font-bold"><SelectValue placeholder="Elegir turno..." /></SelectTrigger>
                                    <SelectContent>
                                        {availableSlots.length > 0 ? availableSlots.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>) : <div className="p-4 text-center opacity-50">Sin cupo</div>}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>
                )}
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setReschedulingAppointment(null)}>Cancelar</Button>
                    <Button onClick={handleRescheduleConfirm} disabled={isRescheduling || !newDate || !newTime || isFetchingSlots}>
                        {isRescheduling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Confirmar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      )}
    </div>
    </TooltipProvider>
  );
}

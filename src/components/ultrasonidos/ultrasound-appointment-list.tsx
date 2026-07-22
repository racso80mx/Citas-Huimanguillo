
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
import type { UltrasoundAppointment, Patient, AppointmentStatus, UltrasoundStudy, ModuleSettings } from '@/lib/definitions';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '../ui/button';
import { Trash2, Pencil, Loader2, ArrowUpDown, ArrowUp, ArrowDown, FileDown, ClipboardCopy, MessageCircle, ChevronDown, RefreshCw } from 'lucide-react';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { updateAppointmentStatus, rescheduleAppointment, cloneAppointment, getAnnouncements, getUltrasoundStudies, getModuleSettings, getAvailableSlotsForDate } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Calendar } from '../ui/calendar';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { generateUltrasoundAppointmentPDF } from '@/lib/report-helpers';


type UltrasoundAppointmentListProps = {
  appointments: UltrasoundAppointment[];
  isAdmin?: boolean;
  onDelete?: (id: string) => void;
  onEditSuccess?: () => void;
};

type SortableKeys = keyof UltrasoundAppointment | 'patientName' | 'curp' | 'phoneNumber';

export function UltrasoundAppointmentList({ appointments, isAdmin = false, onDelete, onEditSuccess }: UltrasoundAppointmentListProps) {
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [isUpdating, startUpdateTransition] = useTransition();
  const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'ascending' | 'descending' } | null>(null);
  
  const [reschedulingAppointment, setReschedulingAppointment] = useState<UltrasoundAppointment | null>(null);
  const [newDate, setNewDate] = useState<Date | undefined>();
  const [newTime, setNewTime] = useState<string | undefined>();
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [isFetchingSlots, startFetchingSlots] = useTransition();
  const [isRescheduling, startRescheduleTransition] = useTransition();

  const [announcements, setAnnouncements] = useState<string[]>([]);
  const [allStudies, setAllStudies] = useState<UltrasoundStudy[]>([]);
  const [settings, setSettings] = useState<ModuleSettings | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    async function fetchData() {
      const [annData, studiesData, settData] = await Promise.all([
        getAnnouncements(),
        getUltrasoundStudies(),
        getModuleSettings()
      ]);
      setAnnouncements(annData);
      setAllStudies(studiesData);
      setSettings(settData);
    }
    fetchData();
  }, []);

  useEffect(() => {
    if (reschedulingAppointment && newDate) {
        startFetchingSlots(async () => {
            const data = await getAvailableSlotsForDate('ultrasound', newDate.toISOString());
            setAvailableSlots(data.timeSlots || []);
            setNewTime(undefined);
        });
    }
  }, [reschedulingAppointment, newDate]);

  const handleCopyCurp = (curp: string) => {
    navigator.clipboard.writeText(curp).then(() => {
      toast({ title: 'CURP Copiada' });
    });
  };

  const handleWhatsApp = (app: UltrasoundAppointment) => {
    const phone = app.patient?.phoneNumber;
    if (!phone) return;
    const cleanPhone = phone.replace(/\D/g, '');
    const formattedDate = format(parseISO(app.date), "eeee dd 'de' MMMM", { locale: es });
    const message = encodeURIComponent(`Hola ${app.patient.name}, le informamos que su cita de Ultrasonido ha sido reagendada para el día ${formattedDate} a las ${app.time} hrs. Estudio: ${app.studyName}.`);
    window.open(`https://wa.me/52${cleanPhone}?text=${message}`, '_blank');
  };

  const handleStatusChange = (appointmentId: string, status: AppointmentStatus) => {
    startUpdateTransition(async () => {
      await updateAppointmentStatus(appointmentId, status, 'ultrasound');
      onEditSuccess?.();
    });
  };
  
  const handleRescheduleConfirm = () => {
    if (!reschedulingAppointment || !newDate || !newTime) return;
    startRescheduleTransition(async () => {
        const result = await rescheduleAppointment(reschedulingAppointment.id, newDate.toISOString(), 'ultrasound', newTime);
        if (result.success) {
            toast({ title: 'Cita Reprogramada' });
            const whatsappEnabled = isAdmin ? settings?.archivoWhatsAppEnabled : settings?.ultrasoundWhatsAppEnabled;
            if (whatsappEnabled && reschedulingAppointment.patient?.phoneNumber) {
                const phone = reschedulingAppointment.patient.phoneNumber.replace(/\D/g, '');
                const oldDate = format(parseISO(reschedulingAppointment.date), "dd/MM/yyyy", { locale: es });
                const newDateFormatted = format(newDate, "eeee dd 'de' MMMM", { locale: es });
                const msg = encodeURIComponent(`Hola ${reschedulingAppointment.patient.name}, le informamos que su cita de Ultrasonido del día ${oldDate} ha sido reagendada. Nueva cita: ${newDateFormatted} a las ${newTime} hrs. Estudio: ${reschedulingAppointment.studyName}.`);
                window.open(`https://wa.me/52${phone}?text=${msg}`, '_blank');
            }
            setReschedulingAppointment(null);
            onEditSuccess?.();
        }
    });
  };

  const handleDownloadPDF = async (appointment: UltrasoundAppointment) => {
    const study = allStudies.find(s => s.id === appointment.studyId);
    if (!study) return;
    const ann = await getAnnouncements();
    await generateUltrasoundAppointmentPDF(appointment, study, ann);
  };

  if (!appointments || appointments.length === 0) return <div className="text-center py-10 opacity-60">No hay citas de Ultrasonido.</div>;

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Estado</TableHead>
            <TableHead>Folio</TableHead>
            <TableHead>Fecha / Hora</TableHead>
            <TableHead>Paciente</TableHead>
            <TableHead>CURP</TableHead>
            <TableHead>Estudio</TableHead>
            {isAdmin && <TableHead className="text-right">Acciones</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {appointments.map((app) => (
            <TableRow key={app.id}>
              <TableCell>
                {onEditSuccess ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="outline" className="w-28 h-8 text-[10px] font-bold uppercase" disabled={isUpdating}>{app.status || 'Agendada'}</Button></DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onSelect={() => handleStatusChange(app.id, 'Atendido')}>Atendido</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => handleStatusChange(app.id, 'No Atendido')}>No Atendido</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => handleStatusChange(app.id, 'No Asistió')}>No Asistió</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => setReschedulingAppointment(app)}>Cambiar Cita</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : <Badge variant="outline" className="text-[10px] font-bold uppercase">{app.status || 'Agendada'}</Badge>}
              </TableCell>
              <TableCell className="font-mono text-xs">{app.appointmentNumber}</TableCell>
              <TableCell className="font-medium text-xs">
                {format(parseISO(app.date), 'dd/MM/yy', { locale: es })}
                <span className='block text-[10px] text-muted-foreground font-bold'>{app.time}</span>
              </TableCell>
              <TableCell className="font-bold text-sm uppercase">{app.patient ? `${app.patient.name} ${app.patient.paternalLastName}` : 'N/A'}</TableCell>
              <TableCell className="font-mono text-xs">{app.patient?.curp || 'N/A'}</TableCell>
              <TableCell className="text-xs uppercase font-medium">{app.studyName}</TableCell>
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
                    <DialogTitle>Reprogramar Ultrasonido</DialogTitle>
                    <DialogDescription>Nueva fecha y hora para <span className="font-bold">{reschedulingAppointment.patient.name}</span>.</DialogDescription>
                </DialogHeader>
                <div className="flex justify-center py-4">
                    <Calendar mode="single" selected={newDate} onSelect={setNewDate} locale={es} disabled={{ before: new Date() }} />
                </div>
                {newDate && (
                    <div className="space-y-2 px-4 pb-4">
                        {isFetchingSlots ? <p className="text-xs animate-pulse">Cargando horarios...</p> : (
                            <div className="space-y-2">
                                <Label className="text-xs font-black uppercase text-primary">Horario Disponible</Label>
                                <Select onValueChange={setNewTime} value={newTime}>
                                    <SelectTrigger className="h-11 font-bold"><SelectValue placeholder="Elegir hora..." /></SelectTrigger>
                                    <SelectContent>
                                        {availableSlots.length > 0 ? availableSlots.map(s => <SelectItem key={s} value={s}>{s} HRS</SelectItem>) : <div className="p-4 text-center opacity-50">Sin disponibilidad</div>}
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
  );
}

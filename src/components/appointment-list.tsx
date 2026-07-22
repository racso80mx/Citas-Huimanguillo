
'use client';
import React, { useState, useTransition, useMemo, useCallback, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableCaption,
} from '@/components/ui/table';
import type { Appointment, Clinic, Patient, AppointmentStatus, ModuleSettings, MedicalConsultation } from '@/lib/definitions';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from './ui/button';
import { 
  Trash2, 
  Pencil, 
  Loader2, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  FileDown, 
  ClipboardCopy, 
  MessageCircle, 
  FileText, 
  UserPlus, 
  History,
  ChevronDown,
  ChevronUp,
  Stethoscope,
  Activity,
  UserRound,
  CalendarDays,
  RefreshCw
} from 'lucide-react';
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
import { EditPatientForm } from './admin/edit-patient-form';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  updateAppointmentStatus, 
  rescheduleAppointment, 
  cloneAppointment, 
  getAnnouncements, 
  getAvailableSlotsForDate, 
  getModuleSettings,
  getConsultationsByPatientId,
  deleteMedicalConsultation
} from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Calendar } from './ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from './ui/label';
import { MedicalConsultationDialog } from './reports/medical-consultation-dialog';
import { cn } from '@/lib/utils';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
import { Card, CardContent } from './ui/card';
import { generateAppointmentPDF } from '@/lib/report-helpers';


type AppointmentListProps = {
  appointments: Appointment[];
  isAdmin?: boolean;
  onDelete?: (id: string) => void;
  clinics: Clinic[];
  onEditSuccess?: () => void;
  onPrescribe?: (patient: Patient) => void;
  onConsultation?: (appointment: Appointment) => void;
};

type SortableKeys = keyof Appointment | 'patientName' | 'clinicName' | 'curp' | 'phoneNumber' | 'coloniaName';


export function AppointmentList({ appointments, isAdmin = false, onDelete, clinics, onEditSuccess, onPrescribe, onConsultation }: AppointmentListProps) {
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [isUpdating, startUpdateTransition] = useTransition();
  const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'ascending' | 'descending' } | null>(null);
  
  // Contexto histórico
  const [expandedPatientId, setExpandedPatientId] = useState<string | null>(null);
  const [patientConsultations, setPatientConsultations] = useState<Record<string, MedicalConsultation[]>>({});
  const [isLoadingHistory, setIsLoadingHistory] = useState<Record<string, boolean>>({});

  const [reschedulingAppointment, setReschedulingAppointment] = useState<Appointment | null>(null);
  const [newDate, setNewDate] = useState<Date | undefined>();
  const [isRescheduling, startRescheduleTransition] = useTransition();

  const [cloningAppointment, setCloningAppointment] = useState<Appointment | null>(null);
  const [newCloneDate, setNewCloneDate] = useState<Date | undefined>();
  const [newCloneTime, setNewCloneTime] = useState<string | undefined>();
  const [availableCloneSlots, setAvailableCloneSlots] = useState<{ timeSlots?: string[], tokens?: number[] }>({});
  const [isFetchingSlots, startFetchingSlotsTransition] = useTransition();
  const [isCloning, startCloneTransition] = useTransition();
  
  const [announcements, setAnnouncements] = useState<string[]>([]);
  const [settings, setSettings] = useState<ModuleSettings | null>(null);

  const [consultingAppointment, setConsultingAppointment] = useState<Appointment | null>(null);
  const [viewingConsultation, setViewingConsultation] = useState<{ consultation: MedicalConsultation, appointment: Appointment } | null>(null);

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

  const cloningClinic = useMemo(() => {
      if (!cloningAppointment) return null;
      return clinics.find(c => c.id === cloningAppointment.clinicId);
  }, [cloningAppointment, clinics]);

  useEffect(() => {
    if (cloningAppointment && newCloneDate) {
      startFetchingSlotsTransition(async () => {
        const slots = await getAvailableSlotsForDate(cloningAppointment.clinicId, newCloneDate.toISOString());
        setAvailableCloneSlots(slots);
        setNewCloneTime(undefined); 
      });
    }
  }, [cloningAppointment, newCloneDate]);

  const toggleHistory = async (app: Appointment) => {
    const patientId = app.patientId;
    if (expandedPatientId === patientId) {
      setExpandedPatientId(null);
      return;
    }

    setExpandedPatientId(patientId);
    
    if (!patientConsultations[patientId]) {
      setIsLoadingHistory(prev => ({ ...prev, [patientId]: true }));
      try {
        const consultations = await getConsultationsByPatientId(patientId);
        setPatientConsultations(prev => ({ ...prev, [patientId]: consultations }));
      } catch (e) {
        console.error("Error loading patient history", e);
        toast({ title: "Error", description: "No se pudo cargar el historial clínico.", variant: "destructive" });
      } finally {
        setIsLoadingHistory(prev => ({ ...prev, [patientId]: false }));
      }
    }
  };

  const handleDeleteConsultation = async (consultationId: string, patientId: string) => {
    try {
      const res = await deleteMedicalConsultation(consultationId);
      if (res.success) {
        toast({ title: 'Nota Médica Eliminada' });
        setPatientConsultations(prev => ({
          ...prev,
          [patientId]: prev[patientId].filter(c => c.id !== consultationId)
        }));
      }
    } catch (e) {
      toast({ title: 'Error', description: 'No se pudo eliminar la nota.', variant: 'destructive' });
    }
  };

  const handleCopyCurp = (curp: string) => {
    navigator.clipboard.writeText(curp).then(() => {
      toast({
        title: 'CURP Copiada',
        description: `Se ha copiado la CURP: ${curp}`,
      });
    }).catch(err => {
      console.error('Failed to copy CURP: ', err);
      toast({
        title: 'Error al copiar',
        description: 'No se pudo copiar la CURP al portapapeles.',
        variant: 'destructive',
      });
    });
  };

  const handleWhatsApp = (app: Appointment) => {
    const phone = app.patient?.phoneNumber;
    if (!phone) {
        toast({ title: "Sin teléfono", description: "El paciente no tiene un número registrado.", variant: "destructive" });
        return;
    }
    const clinic = clinics.find(c => c.id === app.clinicId);
    const cleanPhone = phone.replace(/\D/g, '');
    const formattedDate = format(parseISO(app.date), "eeee dd 'de' MMMM", { locale: es });
    
    const obs = announcements.length > 0 ? `\n\nAvisos: ${announcements.join(' - ')}` : '';
    
    const message = encodeURIComponent(`Hola ${app.patient.name}, le contactamos del Hospital General de Huimanguillo para confirmar su cita médica con folio ${app.appointmentNumber} para el día ${formattedDate} a las ${app.time} en el consultorio ${clinic?.name || 'N/A'} con el Dr(a). ${clinic?.doctorName || 'N/A'}.${obs}`);
    
    window.open(`https://wa.me/52${cleanPhone}?text=${message}`, '_blank');
  };

  const getClinicName = useCallback((clinicId: string) => {
    return clinics.find(c => c.id === clinicId)?.name || clinicId;
  }, [clinics]);

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
          case 'clinicName':
            aValue = getClinicName(a.clinicId);
            bValue = getClinicName(b.clinicId);
            break;
          case 'curp':
            aValue = a.patient?.curp || '';
            bValue = b.patient?.curp || '';
            break;
          case 'phoneNumber':
            aValue = a.patient?.phoneNumber || '';
            bValue = b.patient?.phoneNumber || '';
            break;
          case 'coloniaName':
            aValue = a.coloniaName || '';
            bValue = b.coloniaName || '';
            break;
          case 'date':
             aValue = new Date(a.date).getTime();
             bValue = new Date(b.date).getTime();
             break;
          case 'createdAt':
             aValue = a.createdAt ? new Date(a.createdAt).getTime() : 0;
             bValue = b.createdAt ? new Date(b.createdAt).getTime() : 0;
             break;
          default:
            aValue = a[sortConfig.key as keyof Appointment];
            bValue = b[sortConfig.key as keyof Appointment];
        }

        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;
        
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortConfig.direction === 'ascending' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        }

        if (aValue < bValue) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [appointments, sortConfig, getClinicName]);

  const requestSort = (key: SortableKeys) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };
  
  const getSortIcon = (key: SortableKeys) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <ArrowUpDown className="ml-2 h-4 w-4" />;
    }
    if (sortConfig.direction === 'ascending') {
      return <ArrowUp className="ml-2 h-4 w-4 text-primary" />;
    }
    return <ArrowDown className="ml-2 h-4 w-4 text-primary" />;
  };

  const handleStatusChange = (appointmentId: string, status: AppointmentStatus) => {
    startUpdateTransition(async () => {
      const result = await updateAppointmentStatus(appointmentId, status, 'medical');
      if (result.success) {
        toast({ title: 'Estado actualizado' });
        onEditSuccess?.();
      } else {
        toast({ title: 'Error', description: result.message, variant: 'destructive' });
      }
    });
  };

  const handleRescheduleConfirm = () => {
    if (!reschedulingAppointment || !newDate) return;

    startRescheduleTransition(async () => {
        const result = await rescheduleAppointment(reschedulingAppointment.id, newDate.toISOString(), 'medical');
        if (result.success) {
            toast({
                title: 'Fecha Actualizada',
                description: result.message,
            });

            const whatsappEnabled = isAdmin ? settings?.archivoWhatsAppEnabled : settings?.citasMedicasWhatsAppEnabled;
            if (whatsappEnabled && reschedulingAppointment.patient?.phoneNumber) {
                const phone = reschedulingAppointment.patient.phoneNumber.replace(/\D/g, '');
                const oldDateFormatted = format(parseISO(reschedulingAppointment.date), "dd/MM/yyyy", { locale: es });
                const newDateFormatted = format(newDate, "dd/MM/yyyy", { locale: es });
                
                const message = encodeURIComponent(`Su cita del dia ${oldDateFormatted} a las ${reschedulingAppointment.time} a sido reagendada, para el día ${newDateFormatted}.`);
                window.open(`https://wa.me/52${phone}?text=${message}`, '_blank');
            }

            setReschedulingAppointment(null);
            setNewDate(undefined);
            onEditSuccess?.();
        } else {
            toast({
                title: 'Error al Cambiar Fecha',
                description: result.message,
                variant: 'destructive',
            });
        }
    });
  };

  const handleCloneConfirm = () => {
    if (!cloningAppointment || !newCloneDate || !newCloneTime) return;

    startCloneTransition(async () => {
        const result = await cloneAppointment(cloningAppointment.id, newCloneDate.toISOString(), 'medical', newCloneTime);
        if (result.success) {
            toast({
                title: 'Nueva Cita Asignada',
                description: result.message,
            });
            setCloningAppointment(null);
            setNewCloneDate(undefined);
            setNewCloneTime(undefined);
            setAvailableCloneSlots({});
            onEditSuccess?.();
        } else {
            toast({
                title: 'Error al Asignar Cita',
                description: result.message,
                variant: 'destructive',
            });
        }
    });
  };
  
  const handleDownloadPDF = async (appointment: Appointment) => {
    const clinic = clinics.find(c => c.id === appointment.clinicId);
    if (!clinic) {
      toast({ title: 'Error', description: 'No se encontraron datos de la clínica.', variant: 'destructive' });
      return;
    }
    const ann = await getAnnouncements();
    await generateAppointmentPDF(appointment, clinic, ann);
  };

  const renderHistoryGrid = (patientId: string, app: Appointment) => {
    const consultations = patientConsultations[patientId] || [];
    const isLoading = isLoadingHistory[patientId];

    if (isLoading) {
      return (
        <div className="p-6 space-y-3">
          <div className="flex items-center gap-2 mb-4"><Loader2 className="animate-spin h-4 w-4 text-primary" /> <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Cargando Historial Clínico...</span></div>
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      );
    }

    if (consultations.length === 0) {
      return (
        <div className="p-10 text-center text-muted-foreground italic flex flex-col items-center gap-2">
          <History className="h-8 w-8 opacity-20" />
          <p>No se encontraron notas médicas previas para este paciente.</p>
        </div>
      );
    }

    return (
      <div className="p-6 bg-muted/20 animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="flex items-center justify-between mb-6 border-b pb-2">
            <h4 className="text-sm font-black text-primary uppercase tracking-[0.2em] flex items-center gap-2">
                <History className="h-4 w-4" /> Historial de Consultas ({consultations.length})
            </h4>
            <Badge variant="outline" className="font-mono text-[10px] bg-background">EXP: {app.patient.expediente || 'S/E'}</Badge>
        </div>
        <div className="grid gap-4">
          {consultations.map((consultation, idx) => (
            <Card key={consultation.id} className="hover:border-primary/30 transition-all group shadow-sm bg-card">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className={cn(
                        "bg-primary/5 p-3 rounded-full group-hover:bg-primary/10 transition-colors",
                        idx === 0 && "bg-green-50 ring-2 ring-green-100"
                    )}>
                      <Stethoscope className={cn("h-5 w-5 text-primary/60", idx === 0 && "text-green-600")} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-xs uppercase text-muted-foreground">
                            {format(parseISO(consultation.date), "dd 'de' MMMM, yyyy", { locale: es })}
                        </span>
                        {idx === 0 && <Badge className="bg-green-600 h-4 text-[9px] px-1.5 font-bold uppercase animate-pulse">Reciente</Badge>}
                      </div>
                      <p className="font-bold text-sm uppercase mt-1 leading-tight">{consultation.diagnosis1}</p>
                      <div className="flex items-center gap-3 mt-2 text-[10px] font-bold text-muted-foreground">
                          <span className="flex items-center gap-1 uppercase"><UserRound className="h-3 w-3" /> Dr. {consultation.doctorName}</span>
                          <span>|</span>
                          <span className="flex items-center gap-1 uppercase"><Activity className="h-3 w-3" /> IMC: {consultation.imc || 'N/A'}</span>
                          <span>|</span>
                          <span className="text-primary/70 uppercase">SERVICIO: {consultation.service}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-9 font-bold text-[10px] uppercase tracking-wider hover:bg-primary hover:text-white transition-all shadow-sm"
                        onClick={(e) => {
                            e.stopPropagation();
                            setViewingConsultation({ consultation, appointment: app });
                        }}
                    >
                        Ver Nota Completa
                    </Button>
                    {isAdmin && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-9 w-9 text-destructive hover:bg-destructive/10"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>¿Eliminar esta consulta?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Esta acción es irreversible y eliminará permanentemente la nota médica del historial del paciente.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction 
                                        className="bg-destructive hover:bg-destructive/90"
                                        onClick={() => handleDeleteConsultation(consultation.id, patientId)}
                                    >
                                        Sí, Eliminar
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  };

  if (!appointments || appointments.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-muted-foreground">No hay citas agendadas para el filtro seleccionado.</p>
      </div>
    );
  }

  const whatsappEnabled = isAdmin ? settings?.archivoWhatsAppEnabled : settings?.citasMedicasWhatsAppEnabled;

  return (
    <div className="border rounded-lg overflow-hidden bg-background">
      <Table>
        <TableCaption className="py-4 border-t bg-muted/5">
          Un total de {appointments.length} citas registradas en este periodo.
        </TableCaption>
        <TableHeader className="bg-muted/30">
          <TableRow>
            <TableHead className="w-[120px]"><Button variant="ghost" onClick={() => requestSort('status')} className="h-8 text-xs">Estado {getSortIcon('status')}</Button></TableHead>
            <TableHead><Button variant="ghost" onClick={() => requestSort('appointmentNumber')} className="h-8 text-xs">Folio {getSortIcon('appointmentNumber')}</Button></TableHead>
            <TableHead className="w-[120px]"><Button variant="ghost" onClick={() => requestSort('date')} className="h-8 text-xs">Fecha / Hora {getSortIcon('date')}</Button></TableHead>
            {isAdmin && <TableHead><Button variant="ghost" onClick={() => requestSort('createdAt')} className="h-8 text-xs">Registro {getSortIcon('createdAt')}</Button></TableHead>}
            <TableHead className="min-w-[200px]"><Button variant="ghost" onClick={() => requestSort('patientName')} className="h-8 text-xs">Paciente {getSortIcon('patientName')}</Button></TableHead>
            <TableHead><Button variant="ghost" onClick={() => requestSort('curp')} className="h-8 text-xs">CURP {getSortIcon('curp')}</Button></TableHead>
            <TableHead><Button variant="ghost" onClick={() => requestSort('phoneNumber')} className="h-8 text-xs">Teléfono {getSortIcon('phoneNumber')}</Button></TableHead>
            <TableHead><Button variant="ghost" onClick={() => requestSort('clinicName')} className="h-8 text-xs">Núcleo Básico {getSortIcon('clinicName')}</Button></TableHead>
            <TableHead><Button variant="ghost" onClick={() => requestSort('coloniaName')} className="h-8 text-xs">Municipio {getSortIcon('coloniaName')}</Button></TableHead>
            <TableHead><Button variant="ghost" onClick={() => requestSort('patientType')} className="h-8 text-xs">Tipo {getSortIcon('patientType')}</Button></TableHead>
            {isAdmin && <TableHead className="text-right pr-6">Acciones</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedAppointments.map((app) => (
            <React.Fragment key={app.id}>
              <TableRow className={cn(
                  "group transition-colors",
                  expandedPatientId === app.patientId ? "bg-primary/5 hover:bg-primary/5" : "hover:bg-muted/30"
              )}>
                <TableCell>
                  {onEditSuccess ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                            variant="outline" 
                            className={cn(
                                "w-28 h-8 text-[10px] font-bold uppercase tracking-tighter",
                                app.status === 'Atendido' && "border-green-200 bg-green-50 text-green-700",
                                (app.status === 'Agendada' || !app.status) && "border-blue-200 bg-blue-50 text-blue-700"
                            )} 
                            disabled={isUpdating}
                        >
                          {app.status || 'Agendada'}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-56">
                        <DropdownMenuItem onSelect={() => setConsultingAppointment(app)} className="font-bold py-2">
                          <UserPlus className="mr-2 h-4 w-4 text-primary" />
                          Registrar Consulta
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => handleStatusChange(app.id, 'Atendido')}>Atendido</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleStatusChange(app.id, 'No Atendido')}>No Atendido</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleStatusChange(app.id, 'No Asistió')}>No Asistió</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => { setNewCloneDate(undefined); setCloningAppointment(app); }}>Asignar Nueva Cita</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => {
                            setNewDate(new Date(app.date));
                            setReschedulingAppointment(app);
                        }}>Cambiar Cita</DropdownMenuItem>
                        {onPrescribe && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => onPrescribe(app.patient)}>
                              <FileText className="mr-2 h-4 w-4 text-blue-600" />
                              Generar Receta
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <Badge variant="outline" className="text-[10px] font-bold uppercase">{app.status || 'Agendada'}</Badge>
                  )}
                </TableCell>
                <TableCell className="font-mono text-[11px] font-bold">
                  {app.appointmentNumber}
                  {app.time.includes('Ficha') && <span className="block text-[9px] font-black text-blue-600 tracking-tighter mt-0.5">({app.time})</span>}
                </TableCell>
                <TableCell className="font-medium text-xs">
                  {format(parseISO(app.date), 'dd/MM/yy', { locale: es })}
                  <span className='block text-[10px] text-muted-foreground font-bold'>{app.time.includes('Ficha') ? 'Recepción Gral' : app.time}</span>
                </TableCell>
                {isAdmin && (
                  <TableCell className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {app.createdAt ? format(parseISO(app.createdAt), 'dd/MM/yy HH:mm', { locale: es }) : 'N/A'}
                  </TableCell>
                )}
                <TableCell>
                    <button 
                        onClick={() => toggleHistory(app)}
                        className="text-left group/btn hover:text-primary transition-colors focus:outline-none"
                    >
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-sm uppercase leading-tight">
                                {app.patient ? `${app.patient.name} ${app.patient.paternalLastName} ${app.patient.maternalLastName}` : 'N/A'}
                            </span>
                            {expandedPatientId === app.patientId ? <ChevronUp className="h-3 w-3 opacity-40" /> : <ChevronDown className="h-3 w-3 opacity-40 group-hover/btn:opacity-100 animate-bounce" />}
                        </div>
                        {app.patient?.expediente && (
                            <span className="text-[10px] font-mono text-muted-foreground font-medium">EXP: {app.patient.expediente}</span>
                        )}
                    </button>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] font-mono font-bold tracking-tight">{app.patient?.curp || 'N/A'}</span>
                    {app.patient?.curp && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-40 hover:opacity-100"
                        onClick={() => handleCopyCurp(app.patient!.curp)}
                      >
                        <ClipboardCopy className="h-3.5 w-3.5" />
                        <span className="sr-only">Copiar CURP</span>
                      </Button>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-xs font-medium">{app.patient?.phoneNumber || 'N/A'}</TableCell>
                <TableCell className="text-xs font-bold uppercase leading-tight">{getClinicName(app.clinicId)}</TableCell>
                <TableCell className="text-xs uppercase">{app.coloniaName || 'N/A'}</TableCell>
                <TableCell>
                    <Badge variant="secondary" className="text-[9px] font-black uppercase tracking-tighter">
                        {app.patientType}
                    </Badge>
                </TableCell>
                {isAdmin && app.patient && (
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 font-bold gap-1 border-primary/20">
                          Acciones <ChevronDown className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        {(whatsappEnabled ?? true) && (
                          <DropdownMenuItem onClick={() => handleWhatsApp(app)}>
                            <MessageCircle className="mr-2 h-4 w-4 text-green-600" />
                            WhatsApp Recordatorio
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => {
                            setNewDate(new Date(app.date));
                            setReschedulingAppointment(app);
                        }}>
                          <RefreshCw className="mr-2 h-4 w-4 text-blue-600" />
                          Cambiar Cita
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDownloadPDF(app)}>
                          <FileDown className="mr-2 h-4 w-4 text-gray-500" />
                          Descargar Comprobante
                        </DropdownMenuItem>
                        {onPrescribe && (
                          <DropdownMenuItem onClick={() => onPrescribe(app.patient)}>
                            <FileText className="mr-2 h-4 w-4 text-blue-600" />
                            Prescribir Receta
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setEditingPatient(app.patient)}>
                          <Pencil className="mr-2 h-4 w-4 text-blue-600" />
                          Editar Datos Paciente
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:text-destructive">
                              <Trash2 className="mr-2 h-4 w-4" />
                              Eliminar Cita
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta acción no se puede deshacer. Se eliminará permanentemente la cita de
                                <span className='font-bold'>{app.patient ? ` ${app.patient.name} ${app.patient.paternalLastName} ${app.patient.maternalLastName} ` : 'este paciente '}</span>
                                ({app.appointmentNumber}) y el espacio quedará libre.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => onDelete?.(app.id)} className='bg-destructive hover:bg-destructive/90'>
                                Eliminar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                )}
              </TableRow>
              
              {/* COLLAPSIBLE HISTORY ROW */}
              {expandedPatientId === app.patientId && (
                  <TableRow className="bg-primary/5 hover:bg-primary/5 border-b-2 border-primary/20 shadow-inner">
                      <TableCell colSpan={isAdmin ? 11 : 10} className="p-0">
                          {renderHistoryGrid(app.patientId, app)}
                      </TableCell>
                  </TableRow>
              )}
            </React.Fragment>
          ))}
        </TableBody>
      </Table>
      
      {/* DIALOGS */}
      {editingPatient && (
        <Dialog open={!!editingPatient} onOpenChange={(open) => !open && setEditingPatient(null)}>
            <DialogContent className="sm:max-w-5xl h-[90vh] flex flex-col p-0">
                <DialogHeader className="p-6 pb-2 shrink-0">
                    <DialogTitle>Editar Paciente</DialogTitle>
                    <DialogDescription>
                        Modifica los datos del paciente. Los cambios se reflejarán en todas sus citas y notas médicas.
                    </DialogDescription>
                </DialogHeader>
                <EditPatientForm 
                    patient={editingPatient} 
                    onFinished={() => { 
                        setEditingPatient(null); 
                        onEditSuccess?.(); 
                    }} 
                />
            </DialogContent>
        </Dialog>
      )}
      
      {reschedulingAppointment && (
        <Dialog open={!!reschedulingAppointment} onOpenChange={(open) => {
            if (!open) {
                setReschedulingAppointment(null);
                setNewDate(undefined);
            }
        }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Cambiar Fecha de la Cita</DialogTitle>
                    <DialogDescription>
                        Selecciona una nueva fecha para la cita de <span className="font-bold">{reschedulingAppointment.patient.name}</span>.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex justify-center py-4">
                    <Calendar
                        mode="single"
                        selected={newDate}
                        onSelect={setNewDate}
                        initialFocus
                        disabled={{ before: new Date() }}
                    />
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setReschedulingAppointment(null)}>Cancelar</Button>
                    <Button onClick={handleRescheduleConfirm} disabled={isRescheduling || !newDate}>
                        {isRescheduling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Confirmar Nueva Fecha
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      )}

      {cloningAppointment && (
        <Dialog open={!!cloningAppointment} onOpenChange={(open) => {
          if (!open) {
              setCloningAppointment(null);
              setNewCloneDate(undefined);
              setNewCloneTime(undefined);
              setAvailableCloneSlots({});
          }
        }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Asignar Nueva Cita (Clonar)</DialogTitle>
                    <DialogDescription>
                        Selecciona una nueva fecha y disponibilidad para la cita de <span className="font-bold">{cloningAppointment.patient.name}</span>.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex justify-center py-4">
                    <Calendar
                        mode="single"
                        selected={newCloneDate}
                        onSelect={setNewCloneDate}
                        initialFocus
                        disabled={{ before: new Date() }}
                    />
                </div>
                
                {newCloneDate && cloningClinic && (
                  <div className="space-y-4 px-4 pb-4">
                    {isFetchingSlots ? (
                      <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Buscando disponibilidad...</div>
                    ) : (
                      <>
                        {cloningClinic.bookingMode === 'token' && (
                          <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase">Selecciona una Ficha</Label>
                            <Select onValueChange={setNewCloneTime} value={newCloneTime}>
                              <SelectTrigger className="h-11">
                                <SelectValue placeholder="Elegir ficha disponible..." />
                              </SelectTrigger>
                              <SelectContent>
                                {availableCloneSlots.tokens && availableCloneSlots.tokens.length > 0 ? (
                                  availableCloneSlots.tokens.map(token => (
                                    <SelectItem key={token} value={String(token)}>Ficha {token}</SelectItem>
                                  ))
                                ) : (
                                  <div className="p-2 text-sm text-muted-foreground">No hay fichas disponibles.</div>
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        {cloningClinic.bookingMode === 'time' && (
                          <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase">Selecciona una Hora</Label>
                             <Select onValueChange={setNewCloneTime} value={newCloneTime}>
                              <SelectTrigger className="h-11">
                                <SelectValue placeholder="Elegir horario disponible..." />
                              </SelectTrigger>
                              <SelectContent>
                                {availableCloneSlots.timeSlots && availableCloneSlots.timeSlots.length > 0 ? (
                                  availableCloneSlots.timeSlots.map(time => (
                                    <SelectItem key={time} value={time}>{time}</SelectItem>
                                  ))
                                ) : (
                                  <div className="p-2 text-sm text-muted-foreground">No hay horarios disponibles.</div>
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setCloningAppointment(null)}>Cancelar</Button>
                    <Button onClick={handleCloneConfirm} disabled={isCloning || !newCloneDate || !newCloneTime || isFetchingSlots}>
                        {isCloning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Confirmar Nueva Cita
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      )}

      {consultingAppointment && (
        <MedicalConsultationDialog 
            appointment={consultingAppointment}
            clinic={clinics.find(c => c.id === consultingAppointment.clinicId)!}
            isOpen={!!consultingAppointment}
            onClose={() => setConsultingAppointment(null)}
            onSuccess={() => {
                setConsultingAppointment(null);
                onEditSuccess?.();
            }}
        />
      )}

      {viewingConsultation && (
        <MedicalConsultationDialog 
            appointment={viewingConsultation.appointment}
            clinic={clinics.find(c => c.id === viewingConsultation.appointment.clinicId)!}
            isOpen={!!viewingConsultation}
            onClose={() => setViewingConsultation(null)}
            onSuccess={() => setViewingConsultation(null)}
        />
      )}
    </div>
  );
}

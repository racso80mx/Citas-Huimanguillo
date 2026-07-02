
'use client';
import React, { useState, useEffect, useTransition, useCallback, useMemo } from 'react';
import type { Appointment, Clinic, LabAppointment, XRayAppointment, UltrasoundAppointment, VaccineAppointment, Patient, MedicalConsultation, Prescription, Colonia } from '@/lib/definitions';
import {
  getAppointmentsForClinic,
  getLabAppointments,
  getXRayAppointments,
  getUltrasoundAppointments,
  getVaccineAppointments,
  deleteAppointment,
  deleteLabAppointment,
  deleteXRayAppointment,
  deleteUltrasoundAppointment,
  deleteVaccineAppointment,
  getClinics,
  getColonias,
  getAttendedPatientsForClinic,
  getConsultationsByPatientId,
  getPrescriptionsByPatientId,
  getPatients,
  deletePrescription
} from '@/lib/actions';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  LogOut,
  Loader2,
  Calendar as CalendarIcon,
  Download,
  UserCheck,
  Clock,
  UserX,
  PlusCircle,
  RefreshCw,
  Pill,
  CalendarDays,
  Search,
  FileText,
  CheckCircle2,
  Users,
  History,
  ArrowRight,
  UserRound,
  Stethoscope,
  X,
  Trash2,
  Pencil,
  FlaskConical,
  Settings,
  ClipboardList
} from 'lucide-react';
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  parseISO,
  isWithinInterval,
  isValid,
  parse
} from 'date-fns';
import { es } from 'date-fns/locale';
import { DateRange } from 'react-day-picker';
import { Calendar } from '../ui/calendar';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { AppointmentList } from '../appointment-list';
import { LabAppointmentList } from '../laboratorio/lab-appointment-list';
import { XRayAppointmentList } from '../rayos-x/x-ray-appointment-list';
import { UltrasoundAppointmentList } from '../ultrasonidos/ultrasound-appointment-list';
import { VaccineAppointmentList } from '../vacunas/vaccine-appointment-list';
import { MedicationInventoryDialog } from './medication-inventory-dialog';
import { AvailabilityViewerDialog } from './availability-viewer-dialog';
import { ScheduleAppointmentDialog } from '../archivo/schedule-appointment-dialog';
import { CreatePrescriptionDialog } from './create-prescription-dialog';
import { LabSettingsManager } from '../admin/lab-settings-manager';
import { XRaySettingsManager } from '../admin/x-ray-settings-manager';
import { UltrasoundSettingsManager } from '../admin/ultrasound-settings-manager';
import { VaccineSettingsManager } from '../admin/vaccine-settings-manager';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '../ui/scroll-area';
import { Badge } from '../ui/badge';
import { downloadExcel } from '@/lib/report-helpers';

type ReportType = 'clinic' | 'x-ray' | 'ultrasound' | 'laboratorio' | 'vacunas';

type ReportsDashboardProps = {
  entity: any;
  onLogout: () => void;
  reportType: ReportType;
};

type FilterType = 'today' | 'week' | 'month' | 'range';

export function ReportsDashboard({ entity, onLogout, reportType }: ReportsDashboardProps) {
  const [appointments, setAppointments] = useState<any[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [colonias, setColonias] = useState<Colonia[]>([]);
  const [attendedPatients, setAttendedPatients] = useState<Patient[]>([]);
  const [isDataLoading, startDataTransition] = useTransition();
  const [activeFilter, setActiveFilter] = useState<FilterType>('today');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [searchTerm, setSearchTerm] = useState('');
  const [isClient, setIsClient] = useState(false);
  
  // History states
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [patientHistory, setPatientHistory] = useState<MedicalConsultation[]>([]);
  const [patientPrescriptions, setPatientPrescriptions] = useState<Prescription[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [isSearchingArchive, setIsSearchingArchive] = useState(false);

  const [isMedicationDialogOpen, setIsMedicationDialogOpen] = useState(false);
  const [isAvailabilityDialogOpen, setIsAvailabilityDialogOpen] = useState(false);
  const [isNewAppointmentOpen, setIsNewAppointmentOpen] = useState(false);
  const [isPrescriptionOpen, setIsPrescriptionOpen] = useState(false);
  
  const [selectedPatientForPrescription, setSelectedPatientForPrescription] = useState<Patient | null>(null);
  const [editingPrescription, setEditingPrescription] = useState<Prescription | null>(null);
  
  const [manualDayMonth, setManualDayMonth] = useState('');
  const [manualYear, setManualYear] = useState(new Date().getFullYear().toString());

  const { toast } = useToast();

  useEffect(() => {
    setIsClient(true);
  }, []);

  const fetchData = useCallback(() => {
    startDataTransition(async () => {
      try {
        let appointmentsData: any[] = [];
        const [clinicsData, coloniasData] = await Promise.all([
            getClinics(),
            getColonias()
        ]);
        setClinics(clinicsData);
        setColonias(coloniasData);

        if (reportType === 'clinic') {
            appointmentsData = await getAppointmentsForClinic(entity.id);
            const attendedData = await getAttendedPatientsForClinic(entity.id);
            setAttendedPatients(attendedData);
        } else if (reportType === 'laboratorio') {
            appointmentsData = await getLabAppointments();
        } else if (reportType === 'x-ray') {
            appointmentsData = await getXRayAppointments();
        } else if (reportType === 'ultrasound') {
            appointmentsData = await getUltrasoundAppointments();
        } else if (reportType === 'vacunas') {
            appointmentsData = await getVaccineAppointments();
        }
        
        setAppointments(appointmentsData || []);
      } catch (error) {
        console.error('Error fetching data for reports dashboard', error);
        toast({ title: 'Error al sincronizar datos', variant: 'destructive' });
      }
    });
  }, [entity.id, reportType, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSetDateRange = (range: DateRange | undefined) => {
    setDateRange(range);
    setActiveFilter('range');
  };

  const handleManualDateChange = (dm: string, y: string) => {
    setManualDayMonth(dm);
    setManualYear(y);
    if (dm.length === 5 && y.length === 4) {
      const parsedDate = parse(`${dm}/${y}`, 'dd/MM/yyyy', new Date());
      if (isValid(parsedDate)) {
        setActiveFilter('range');
        setDateRange({ from: parsedDate, to: parsedDate });
      }
    }
  };

  const handleDelete = async (id: string) => {
    try {
      if (reportType === 'laboratorio') await deleteLabAppointment(id);
      else if (reportType === 'x-ray') await deleteXRayAppointment(id);
      else if (reportType === 'ultrasound') await deleteUltrasoundAppointment(id);
      else if (reportType === 'vacunas') await deleteVaccineAppointment(id);
      else await deleteAppointment(id);
      toast({ title: 'Cita Eliminada' });
      fetchData(); 
    } catch (error) {
      toast({ title: 'Error al eliminar', variant: 'destructive' });
    }
  };

  const appointmentsToDisplay = useMemo(() => {
    if (!isClient || !appointments || appointments.length === 0) return [];
    const nowStr = format(new Date(), 'yyyy-MM-dd');
    
    let filtered = appointments.filter(app => {
        const appDateStr = app.date.split('T')[0];
        
        switch (activeFilter) {
            case 'week':
                const now = new Date();
                return isWithinInterval(parseISO(app.date), { 
                    start: startOfWeek(now, { weekStartsOn: 1 }), 
                    end: endOfWeek(now, { weekStartsOn: 1 }) 
                });
            case 'month':
                const mNow = new Date();
                return isWithinInterval(parseISO(app.date), { 
                    start: startOfMonth(mNow), 
                    end: endOfMonth(mNow) 
                });
            case 'range':
                if (dateRange?.from) {
                    const start = startOfDay(dateRange.from);
                    const end = endOfDay(dateRange.to || dateRange.from);
                    return isWithinInterval(parseISO(app.date), { start, end });
                }
                return true;
            case 'today':
            default:
                return appDateStr === nowStr;
        }
    });

    if (searchTerm) {
        const t = searchTerm.toUpperCase();
        filtered = filtered.filter(a => {
            const n = `${a.patient?.name || ''} ${a.patient?.paternalLastName || ''} ${a.patient?.maternalLastName || ''}`.toUpperCase();
            return n.includes(t) || (a.patient?.curp || '').toUpperCase().includes(t) || (a.appointmentNumber || '').toUpperCase().includes(t);
        });
    }

    return filtered.sort((a, b) => a.time.localeCompare(b.time));
  }, [isClient, appointments, activeFilter, dateRange, searchTerm]);

  const summaryCounts = useMemo(() => {
    if (!isClient) return { total: 0, attended: 0, pending: 0, notAttended: 0 };
    const nowStr = format(new Date(), 'yyyy-MM-dd');
    const todayApps = appointments.filter(a => a.date.split('T')[0] === nowStr);
    return {
      total: todayApps.length,
      attended: todayApps.filter(a => a.status === 'Atendido').length,
      pending: todayApps.filter(a => a.status === 'Agendada' || !a.status).length,
      notAttended: todayApps.filter(a => a.status === 'No Asistió' || a.status === 'No Atendido').length,
    }
  }, [isClient, appointments]);

  const isClinicReport = reportType === 'clinic';

  const renderAppointmentListContent = () => {
      if (isDataLoading) return <div className="py-20 flex justify-center"><Loader2 className="animate-spin h-10 w-10 text-primary" /></div>;
      
      switch(reportType) {
          case 'laboratorio': return <LabAppointmentList appointments={appointmentsToDisplay} isAdmin onDelete={handleDelete} onEditSuccess={fetchData} />;
          case 'x-ray': return <XRayAppointmentList appointments={appointmentsToDisplay} isAdmin onDelete={handleDelete} onEditSuccess={fetchData} />;
          case 'ultrasound': return <UltrasoundAppointmentList appointments={appointmentsToDisplay} isAdmin onDelete={handleDelete} onEditSuccess={fetchData} />;
          case 'vacunas': return <VaccineAppointmentList appointments={appointmentsToDisplay} isAdmin onDelete={handleDelete} onEditSuccess={fetchData} />;
          default: return <AppointmentList appointments={appointmentsToDisplay} clinics={clinics} isAdmin onDelete={handleDelete} onEditSuccess={fetchData} />;
      }
  };

  const handleDownload = () => {
    if (appointmentsToDisplay.length === 0) {
        toast({ title: 'No hay datos para exportar', variant: 'destructive' });
        return;
    }
    downloadExcel(appointmentsToDisplay, `reporte_${reportType}_${activeFilter}_${format(new Date(), 'dd-MM-yyyy')}`);
  }

  const loadPatientHistory = async (patientId: string) => {
    setSelectedPatientId(patientId);
    setIsLoadingHistory(true);
    try {
        const [history, prescriptions] = await Promise.all([
            getConsultationsByPatientId(patientId),
            getPrescriptionsByPatientId(patientId)
        ]);
        setPatientHistory(history);
        setPatientPrescriptions(prescriptions);
    } catch (e) {
        console.error(e);
    } finally {
        setIsLoadingHistory(false);
    }
  };

  const filteredAttendedPatients = useMemo(() => {
    if (!historySearchTerm) return attendedPatients;
    const t = historySearchTerm.toUpperCase();
    return attendedPatients.filter(p => 
        `${p.name} ${p.paternalLastName} ${p.maternalLastName}`.toUpperCase().includes(t) ||
        p.curp.toUpperCase().includes(t) ||
        (p.expediente || '').includes(t)
    );
  }, [attendedPatients, historySearchTerm]);

  return (
    <div className="space-y-8 container mx-auto px-0 py-8">
      <Card className="shadow-lg border-primary/10 mx-4 sm:mx-0 overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-4 bg-muted/5 border-b">
          <div>
            <CardTitle className="text-3xl font-bold font-headline uppercase">Reportes: {entity.name}</CardTitle>
            <CardDescription>Bienvenido, {entity.doctorName}. Control operativo del servicio.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {isClinicReport && (
                <>
                    <Button variant="outline" className="text-green-700 border-green-200" onClick={() => setIsNewAppointmentOpen(true)}><PlusCircle className="mr-2 h-4 w-4" /> Nueva Cita</Button>
                    <Button variant="outline" className="text-primary border-primary/40" onClick={() => setIsAvailabilityDialogOpen(true)}><CalendarDays className="mr-2 h-4 w-4" /> Disponibilidad</Button>
                    <Button variant="default" className="bg-primary hover:bg-primary/90" onClick={() => setIsMedicationDialogOpen(true)}><Pill className="mr-2 h-4 w-4" /> Farmacia</Button>
                </>
            )}
            <Button variant="outline" onClick={onLogout}><LogOut className="mr-2 h-4 w-4" /> Cerrar Sesión</Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Tabs defaultValue="agenda" className="w-full">
             <div className="px-6 border-b bg-muted/10">
                <TabsList className="bg-transparent h-14 w-full justify-start gap-6">
                    <TabsTrigger value="agenda" className="data-[state=active]:bg-primary data-[state=active]:text-white font-black uppercase h-11 px-8 rounded-t-lg transition-all">
                        <ClipboardList className="mr-2 h-4 w-4" /> Agenda del Día
                    </TabsTrigger>
                    <TabsTrigger value="config" className="data-[state=active]:bg-primary data-[state=active]:text-white font-black uppercase h-11 px-8 rounded-t-lg transition-all">
                        <Settings className="mr-2 h-4 w-4" /> Parámetros del Servicio
                    </TabsTrigger>
                </TabsList>
             </div>

             <TabsContent value="agenda" className="p-6 space-y-8 mt-0 animate-in fade-in duration-300">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                        { label: 'Agenda Hoy', val: summaryCounts.total, icon: UserCheck, color: 'text-primary' },
                        { label: 'Atendidos', val: summaryCounts.attended, icon: CheckCircle2, color: 'text-green-600' },
                        { label: 'Pendientes', val: summaryCounts.pending, icon: Clock, color: 'text-yellow-600' },
                        { label: 'No Asistió', val: summaryCounts.notAttended, icon: UserX, color: 'text-red-600' }
                    ].map(s => (
                        <Card key={s.label} className="shadow-sm border-muted">
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] font-black uppercase text-muted-foreground">{s.label}</span>
                                    <s.icon className={cn("h-4 w-4", s.color)} />
                                </div>
                                <div className={cn("text-2xl font-black", s.color)}>{s.val}</div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                <Card className="border-none shadow-none bg-muted/5 rounded-xl">
                    <CardHeader className="pb-4">
                        <div className="flex flex-wrap items-center gap-4">
                            <div className="flex items-center gap-1 bg-background p-1 border rounded-lg shadow-sm">
                                <Button variant={activeFilter === 'today' ? 'secondary' : 'ghost'} size="sm" onClick={() => setActiveFilter('today')}>Hoy</Button>
                                <Button variant={activeFilter === 'week' ? 'secondary' : 'ghost'} size="sm" onClick={() => setActiveFilter('week')}>Semana</Button>
                                <Button variant={activeFilter === 'month' ? 'secondary' : 'ghost'} size="sm" onClick={() => setActiveFilter('month')}>Mes</Button>
                            </div>
                            <div className="flex items-center gap-2 bg-background p-2 rounded-xl border border-dashed border-primary/20">
                                <div className="flex flex-col gap-1">
                                    <Label className="text-[9px] font-black uppercase text-primary h-3">Día/Mes</Label>
                                    <Input placeholder="11/07" value={manualDayMonth} onChange={e => {
                                        let v = e.target.value.replace(/\D/g, '');
                                        if (v.length > 2) v = v.substring(0,2) + '/' + v.substring(2,4);
                                        handleManualDateChange(v.substring(0,5), manualYear);
                                    }} className="h-8 w-20 text-center font-bold text-xs" maxLength={5} />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <Label className="text-[9px] font-black uppercase text-primary h-3">Año</Label>
                                    <Input type="number" value={manualYear} onChange={e => handleManualDateChange(manualDayMonth, e.target.value.substring(0,4))} className="h-8 w-16 text-center font-bold text-xs" />
                                </div>
                            </div>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-10 min-w-[200px] border-primary/20"><CalendarIcon className="mr-2 h-4 w-4" /> {dateRange?.from ? (dateRange.to ? `${format(dateRange.from, 'dd/MM')} - ${format(dateRange.to, 'dd/MM')}` : format(dateRange.from, 'dd/MM')) : "Selector de Rango"}</Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start"><Calendar mode="range" selected={dateRange} onSelect={handleSetDateRange} numberOfMonths={2} locale={es} /></PopoverContent>
                            </Popover>
                            <div className="relative flex-1 min-w-[250px]">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="Buscar por Nombre, Folio o CURP..." className="pl-9 h-11 border-primary/20 bg-background" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" size="icon" onClick={fetchData} className="h-11 w-11 bg-background"><RefreshCw className={cn("h-4 w-4", isDataLoading && "animate-spin")} /></Button>
                                <Button variant="outline" size="icon" onClick={handleDownload} className="h-11 w-11 bg-background"><Download className="h-4 w-4" /></Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {isClinicReport ? (
                            <Tabs defaultValue="listado" className="w-full">
                                <TabsList className="grid w-full grid-cols-2 max-w-md h-auto p-1 bg-muted/20 mb-6 rounded-lg">
                                    <TabsTrigger value="listado" className="py-2.5 font-bold">Lista de Agenda</TabsTrigger>
                                    <TabsTrigger value="pacientes" className="py-2.5 font-bold">Pacientes Atendidos</TabsTrigger>
                                </TabsList>
                                <TabsContent value="listado" className="mt-0">{renderAppointmentListContent()}</TabsContent>
                                <TabsContent value="pacientes" className="mt-0">
                                    <div className="space-y-6">
                                        <div className="flex flex-col sm:flex-row gap-4 items-end">
                                            <div className="flex-1 space-y-2">
                                                <Label className="text-xs font-bold uppercase opacity-60">Buscar en historial de {entity.name}</Label>
                                                <div className="relative">
                                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                    <Input placeholder="Nombre, CURP o Expediente..." className="pl-9 h-11" value={historySearchTerm} onChange={e => setHistorySearchTerm(e.target.value)} />
                                                </div>
                                            </div>
                                            <Button variant="outline" className="h-11" onClick={() => setIsSearchingArchive(!isSearchingArchive)}>
                                                {isSearchingArchive ? <X className="mr-2 h-4 w-4" /> : <Search className="mr-2 h-4 w-4" />}
                                                {isSearchingArchive ? 'Cerrar Búsqueda Global' : 'Buscar en Padrón General'}
                                            </Button>
                                        </div>

                                        {isSearchingArchive && <GlobalArchiveSearch onSelectPatient={(p) => loadPatientHistory(p.id)} />}

                                        <div className="grid lg:grid-cols-12 gap-8">
                                            <div className="lg:col-span-4 border rounded-xl overflow-hidden bg-card">
                                                <div className="p-4 bg-muted/30 border-b font-black text-[10px] uppercase tracking-widest text-primary flex items-center justify-between">
                                                    Lista de Pacientes Atendidos
                                                    <Badge className="bg-primary/10 text-primary">{filteredAttendedPatients.length}</Badge>
                                                </div>
                                                <ScrollArea className="h-[500px]">
                                                    {filteredAttendedPatients.map(p => (
                                                        <button 
                                                            key={p.id} 
                                                            onClick={() => loadPatientHistory(p.id)}
                                                            className={cn(
                                                                "w-full text-left p-4 border-b hover:bg-primary/5 transition-all flex items-center justify-between group",
                                                                selectedPatientId === p.id ? "bg-primary/10 border-r-4 border-r-primary" : ""
                                                            )}
                                                        >
                                                            <div>
                                                                <p className="font-bold text-xs uppercase leading-tight group-hover:text-primary">{p.name} {p.paternalLastName}</p>
                                                                <p className="text-[10px] text-muted-foreground font-mono mt-1">{p.curp}</p>
                                                            </div>
                                                            <ArrowRight className={cn("h-4 w-4 text-primary opacity-0 transition-opacity", selectedPatientId === p.id ? "opacity-100" : "group-hover:opacity-40")} />
                                                        </button>
                                                    ))}
                                                    {filteredAttendedPatients.length === 0 && <div className="p-10 text-center text-xs text-muted-foreground italic">No hay pacientes que coincidan con la búsqueda.</div>}
                                                </ScrollArea>
                                            </div>

                                            <div className="lg:col-span-8">
                                                {selectedPatientId ? (
                                                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                                                        <div className="flex items-center justify-between bg-primary/5 p-4 rounded-xl border border-primary/10">
                                                            <div className="flex items-center gap-4">
                                                                <div className="bg-primary/10 p-3 rounded-full"><UserRound className="h-6 w-6 text-primary" /></div>
                                                                <div>
                                                                    <h3 className="font-black text-lg uppercase leading-none">
                                                                        {attendedPatients.find(p => p.id === selectedPatientId)?.name || 'PACIENTE'}
                                                                    </h3>
                                                                    <p className="text-xs text-muted-foreground font-bold mt-1 uppercase">Historial Clínico Consolidado</p>
                                                                </div>
                                                            </div>
                                                            <Button className="font-bold bg-primary hover:bg-primary/90 h-11 px-6 shadow-lg" onClick={() => {
                                                                const p = attendedPatients.find(x => x.id === selectedPatientId);
                                                                if (p) {
                                                                    setSelectedPatientForPrescription(p);
                                                                    setEditingPrescription(null);
                                                                    setIsPrescriptionOpen(true);
                                                                }
                                                            }}>
                                                                <FileText className="mr-2 h-4 w-4" /> Nueva Receta Digital
                                                            </Button>
                                                        </div>

                                                        <Tabs defaultValue="notas" className="w-full">
                                                            <TabsList className="bg-muted/40 p-1 rounded-md mb-4 flex gap-2">
                                                                <TabsTrigger value="notas" className="font-bold px-4 py-2 data-[state=active]:bg-background rounded-sm">Notas Médicas ({patientHistory.length})</TabsTrigger>
                                                                <TabsTrigger value="recetas" className="font-bold px-4 py-2 data-[state=active]:bg-background rounded-sm">Recetas Generadas ({patientPrescriptions.length})</TabsTrigger>
                                                            </TabsList>
                                                            
                                                            <TabsContent value="notas" className="mt-0">
                                                                {isLoadingHistory ? (
                                                                    <div className="py-20 flex justify-center"><Loader2 className="animate-spin h-10 w-10 text-primary" /></div>
                                                                ) : patientHistory.length > 0 ? (
                                                                    <div className="grid gap-4">
                                                                        {patientHistory.sort((a,b) => b.date.localeCompare(a.date)).map(note => (
                                                                            <Card key={note.id} className="hover:border-primary/30 transition-colors shadow-sm">
                                                                                <CardContent className="p-5">
                                                                                    <div className="flex justify-between items-start mb-4">
                                                                                        <div className="flex items-center gap-3">
                                                                                            <div className="bg-blue-50 p-2 rounded-lg text-blue-600"><History className="h-4 w-4" /></div>
                                                                                            <div>
                                                                                                <p className="text-[10px] font-black uppercase text-muted-foreground">{format(parseISO(note.date), "eeee dd 'de' MMMM, yyyy", { locale: es })}</p>
                                                                                                <p className="font-bold text-sm text-primary uppercase">{note.diagnosis1}</p>
                                                                                            </div>
                                                                                        </div>
                                                                                        <Badge variant="outline" className="text-[10px] font-mono bg-muted/20">Dr. {note.doctorName}</Badge>
                                                                                    </div>
                                                                                    <div className="grid sm:grid-cols-3 gap-4 text-[10px] font-bold text-muted-foreground uppercase border-t pt-4">
                                                                                        <div className="flex items-center gap-2"><Activity className="h-3 w-3" /> IMC: <span className="text-foreground">{note.imc || 'N/A'}</span></div>
                                                                                        <div className="flex items-center gap-2"><Stethoscope className="h-3 w-3" /> SERVICIO: <span className="text-foreground">{note.service}</span></div>
                                                                                        <div className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3" /> TIPO: <span className="text-foreground">{note.motiveRelation}</span></div>
                                                                                    </div>
                                                                                </CardContent>
                                                                            </Card>
                                                                        ))}
                                                                    </div>
                                                                ) : (
                                                                    <div className="py-20 text-center border-2 border-dashed rounded-2xl opacity-40">Sin notas registradas.</div>
                                                                )}
                              </TabsContent>

                                                            <TabsContent value="recetas" className="mt-0">
                                                                {isLoadingHistory ? (
                                                                    <div className="py-20 flex justify-center"><Loader2 className="animate-spin h-10 w-10 text-primary" /></div>
                                                                ) : patientPrescriptions.length > 0 ? (
                                                                    <div className="grid gap-4">
                                                                        {patientPrescriptions.sort((a,b) => b.date.localeCompare(a.date)).map(rx => (
                                                                            <Card key={rx.id} className="hover:border-green-300 transition-colors shadow-sm">
                                                                                <CardContent className="p-5 flex items-center justify-between">
                                                                                    <div className="flex items-center gap-4">
                                                                                        <div className="bg-green-50 p-3 rounded-xl text-green-600"><FileText className="h-5 w-5" /></div>
                                                                                        <div>
                                                                                            <p className="font-black text-sm text-green-700">{rx.folio}</p>
                                                                                            <p className="text-[10px] font-bold text-muted-foreground uppercase">{format(parseISO(rx.date), 'dd/MM/yyyy HH:mm')} hrs</p>
                                                                                            <div className="flex gap-1 mt-1">
                                                                                                {rx.items.slice(0, 3).map((item, idx) => (
                                                                                                    <Badge key={idx} variant="outline" className="text-[8px] px-1 h-4">{item.name}</Badge>
                                                                                                ))}
                                                                                                {rx.items.length > 3 && <span className="text-[8px] font-bold">+{rx.items.length - 3} más</span>}
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>
                                                                                    <div className="flex gap-2">
                                                                                        <Button variant="outline" size="sm" className="h-9" onClick={() => {
                                                                                            setEditingPrescription(rx);
                                                                                            setSelectedPatientForPrescription(attendedPatients.find(p => p.id === selectedPatientId) || null);
                                                                                            setIsPrescriptionOpen(true);
                                                                                        }}>
                                                                                            <Pencil className="h-3 w-3 mr-1" /> Editar
                                                                                        </Button>
                                                                                        <AlertDialog>
                                                                                            <AlertDialogTrigger asChild>
                                                                                                <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive"><Trash2 className="h-4 w-4" /></Button>
                                                                                            </AlertDialogTrigger>
                                                                                            <AlertDialogContent>
                                                                                                <AlertDialogHeader>
                                                                                                    <AlertDialogTitle>¿Eliminar Receta?</AlertDialogTitle>
                                                                                                    <AlertDialogDescription>Esta acción cancelará el folio {rx.folio} y no podrá ser surtida en farmacia.</AlertDialogDescription>
                                                                                                </AlertDialogHeader>
                                                                                                <AlertDialogFooter>
                                                                                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                                                                    <AlertDialogAction className="bg-destructive" onClick={async () => {
                                                                                                        await deletePrescription(rx.id);
                                                                                                        loadPatientHistory(selectedPatientId!);
                                                                                                    }}>Eliminar Permanentemente</AlertDialogAction>
                                                                                                </AlertDialogFooter>
                                                                                            </AlertDialogContent>
                                                                                        </AlertDialog>
                                                                                    </div>
                                                                                </CardContent>
                                                                            </Card>
                                                                        ))}
                                                                    </div>
                                                                ) : (
                                                                    <div className="py-20 text-center border-2 border-dashed rounded-2xl opacity-40">Sin recetas previas.</div>
                                                                )}
                                                            </TabsContent>
                                                        </Tabs>
                                                    </div>
                                                ) : (
                                                    <div className="h-full flex flex-col items-center justify-center border-2 border-dashed rounded-3xl opacity-30 p-20 text-center">
                                                        <History className="h-16 w-16 mb-4" />
                                                        <p className="font-black text-lg uppercase tracking-widest">Esperando Selección</p>
                                                        <p className="text-sm">Selecciona un paciente del listado izquierdo para ver su historial médico y recetas.</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </TabsContent>
                            </Tabs>
                        ) : (
                            <div className="animate-in fade-in duration-500">
                                {renderAppointmentListContent()}
                            </div>
                        )}
                    </CardContent>
                </Card>
             </TabsContent>

             <TabsContent value="config" className="p-6 mt-0 animate-in slide-in-from-right-4 duration-300">
                 <div className="max-w-5xl mx-auto">
                    {reportType === 'laboratorio' && <LabSettingsManager />}
                    {reportType === 'x-ray' && <XRaySettingsManager />}
                    {reportType === 'ultrasound' && <UltrasoundSettingsManager />}
                    {reportType === 'vacunas' && <VaccineSettingsManager />}
                    {reportType === 'clinic' && (
                        <div className="py-20 text-center text-muted-foreground border-2 border-dashed rounded-2xl bg-muted/5 italic">
                            <Settings className="h-12 w-12 mx-auto mb-4 opacity-20" />
                            Para configurar los parámetros de este consultorio, dirígete al Panel Administrativo Global.
                        </div>
                    )}
                 </div>
             </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <MedicationInventoryDialog isOpen={isMedicationDialogOpen} onClose={() => setIsMedicationDialogOpen(false)} />
      <AvailabilityViewerDialog isOpen={isAvailabilityDialogOpen} onClose={() => setIsAvailabilityDialogOpen(false)} reportType={reportType} entity={entity} />
      {isNewAppointmentOpen && <ScheduleAppointmentDialog isOpen={isNewAppointmentOpen} onClose={() => setIsNewAppointmentOpen(false)} patient={{} as any} clinics={isClinicReport ? [entity] : clinics} colonias={colonias} onBookingSuccess={fetchData} isDoctorBypass={true} />}
      {isPrescriptionOpen && <CreatePrescriptionDialog isOpen={isPrescriptionOpen} onClose={() => setIsPrescriptionOpen(false)} clinic={entity} initialPatient={selectedPatientForPrescription} initialPrescription={editingPrescription} onPrescriptionCreated={fetchData} />}
    </div>
  );
}

function GlobalArchiveSearch({ onSelectPatient }: { onSelectPatient: (p: Patient) => void }) {
    const [q, setQ] = useState('');
    const [results, setResults] = useState<Patient[]>([]);
    const [loading, setLoading] = useState(false);

    const handleSearch = async () => {
        if (q.length < 3) return;
        setLoading(true);
        try {
            const data = await getPatients({ searchName: q, limitNum: 10 });
            setResults(data);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="border-blue-200 bg-blue-50/50 shadow-inner animate-in slide-in-from-top-4 rounded-xl">
            <CardContent className="pt-6 space-y-4">
                <div className="flex gap-2">
                    <Input placeholder="Buscar en todo el hospital..." value={q} onChange={e => setQ(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && handleSearch()} className="bg-background h-11 font-bold" />
                    <Button onClick={handleSearch} disabled={loading} className="h-11 font-bold px-6">{loading ? <Loader2 className="animate-spin" /> : 'Buscar Global'}</Button>
                </div>
                {results.length > 0 && (
                    <div className="grid sm:grid-cols-2 gap-2">
                        {results.map(p => (
                            <button key={p.id} onClick={() => onSelectPatient(p)} className="p-3 bg-background border rounded-lg hover:border-primary transition-all text-left flex flex-col gap-0.5 shadow-sm group">
                                <span className="font-bold text-xs uppercase group-hover:text-primary">{p.name} {p.paternalLastName}</span>
                                <span className="text-[10px] text-muted-foreground font-mono">{p.curp}</span>
                            </button>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

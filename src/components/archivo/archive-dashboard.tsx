'use client';

import { useState, useEffect, useTransition, useCallback, useMemo } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Loader2, 
  LogOut, 
  Search, 
  Users, 
  UserCheck, 
  Clock, 
  UserX, 
  PlusCircle,
  Check,
  RefreshCw,
  X,
  Upload,
  Download,
  XCircle,
  Eye,
  Calendar as CalendarIcon,
  FileText,
  Filter,
  CalendarSearch,
  Plus
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { 
  getPatients, 
  getPatientCounts, 
  deletePatient, 
  updatePatientStatus, 
  savePatient, 
  getAppointments, 
  getClinics, 
  updatePatient, 
  deleteAppointment,
  getServiceTypes,
  getColonias
} from '@/lib/actions';
import type { Patient, Appointment, Clinic, ArchiveCounts, ServiceType, Colonia } from '@/lib/definitions';
import { PatientStatus as PatientStatusEnum } from '@/lib/definitions';
import { PatientList } from './patient-list';
import { MassUploadDialog } from './mass-upload-dialog';
import { EditPatientDialog } from './edit-patient-dialog';
import { ScheduleAppointmentDialog } from './schedule-appointment-dialog';
import { AppointmentList } from '../appointment-list';
import { v4 as uuidv4 } from 'uuid';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  startOfDay, 
  endOfDay, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth, 
  parseISO, 
  isWithinInterval, 
  addDays,
  format,
  isValid,
  parse
} from 'date-fns';
import { es } from 'date-fns/locale';
import { DateRange } from 'react-day-picker';
import { Calendar } from '../ui/calendar';
import { generateArchiveListPDF } from '@/lib/report-helpers';
import { Label } from '../ui/label';

type ArchiveDashboardProps = {
  onLogout: () => void;
  isReadOnly?: boolean;
};

type DateFilterType = 'today' | 'tomorrow' | 'week' | 'month' | 'range';

export function ArchiveDashboard({ onLogout, isReadOnly = false }: ArchiveDashboardProps) {
  const [activeTab, setActiveTab] = useState('patients');

  // Patient states
  const [patients, setPatients] = useState<Patient[]>([]);
  const [counts, setCounts] = useState<ArchiveCounts>({ total: 0, vigente: 0, bajaTemporal: 0, bajaDefinitiva: 0 });
  
  // Search fields for patients (Optimizado)
  const [searchName, setSearchName] = useState('');
  const [searchCurp, setSearchCurp] = useState('');
  const [searchExpediente, setSearchExpediente] = useState('');
  
  const [statusFilter, setStatusFilter] = useState<'Total' | PatientStatusEnum>(PatientStatusEnum.Vigente);
  
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [schedulingPatient, setSchedulingPatient] = useState<Patient | null>(null);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  
  // Appointment states
  const [allAppointments, setAllAppointments] = useState<Appointment[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [colonias, setColonias] = useState<Colonia[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [selectedClinics, setSelectedClinics] = useState<string[]>([]);
  const [selectedClinicType, setSelectedClinicType] = useState<string | 'all'>('Consulta Externa Especializada');
  const [dateFilter, setDateFilter] = useState<DateFilterType>('today');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [searchTerm, setSearchTerm] = useState('');

  // Manual jump to date
  const [manualDayMonth, setManualDayMonth] = useState('');
  const [manualYear, setManualYear] = useState(new Date().getFullYear().toString());

  // Common states
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [isSubmitting, startSubmitTransition] = useTransition();

  const { toast } = useToast();

  const loadData = useCallback(async () => {
    setIsDataLoading(true);
    setCurrentPage(1); 
    
    try {
      // Configuramos las opciones de búsqueda para que el servidor use índices directos
      const searchOptions = { 
          status: statusFilter, 
          searchName: searchName.trim() || undefined,
          searchCurp: searchCurp.trim() || undefined,
          searchExpediente: searchExpediente.trim() || undefined,
          limitNum: (searchName || searchCurp || searchExpediente) ? 200 : 1000 
      };

      const [patientsData, countsData, clinicsData, serviceTypesData, appointmentsData, coloniasData] = await Promise.all([
        getPatients(searchOptions),
        getPatientCounts(),
        getClinics(),
        getServiceTypes(),
        getAppointments(),
        getColonias()
      ]);
      
      setPatients(patientsData || []);
      setCounts(countsData);
      setClinics(clinicsData || []);
      setServiceTypes(serviceTypesData || []);
      setAllAppointments(appointmentsData || []);
      setColonias(coloniasData || []);
    } catch (error: any) {
      console.error("Dashboard error:", error);
      toast({
        title: 'Error de Consulta',
        description: 'No se pudieron recuperar los registros.',
        variant: 'destructive',
      });
    } finally {
      setIsDataLoading(false);
    }
  }, [statusFilter, searchName, searchCurp, searchExpediente, toast]);
  
  useEffect(() => {
    loadData();
  }, [loadData, statusFilter]); 

  const handleClearSearch = () => {
      setSearchName('');
      setSearchCurp('');
      setSearchExpediente('');
      loadData();
  };

  const paginatedPatients = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return patients.slice(startIndex, startIndex + rowsPerPage);
  }, [patients, currentPage, rowsPerPage]);

  const totalPages = Math.ceil(patients.length / rowsPerPage);

  const handleAddNew = () => { setEditingPatient(null); setIsEditOpen(true); };
  const handleEdit = (patient: Patient) => { setEditingPatient(patient); setIsEditOpen(true); };
  const handleSchedule = (patient: Patient) => { setSchedulingPatient(patient); };
  
  const handleDelete = (patientId: string) => {
    if (isReadOnly) return;
    startSubmitTransition(async () => {
      const result = await deletePatient(patientId);
      if(result.success) {
        toast({ title: "Paciente Eliminado"});
        loadData();
      }
    });
  }

  const handleAppointmentDelete = (appointmentId: string) => {
    if (isReadOnly) return;
    startSubmitTransition(async () => {
        const result = await deleteAppointment(appointmentId);
        if (result.success) {
            toast({ title: 'Cita Eliminada' });
            loadData();
        }
    });
  };
  
  const handleStatusChange = (patientId: string, newStatus: PatientStatusEnum) => {
    if (isReadOnly) return;
    startSubmitTransition(async () => {
      const result = await updatePatientStatus(patientId, newStatus);
       if(result.success) {
        toast({ title: "Estado Actualizado" });
        loadData();
      }
    });
  }
  
  const handleSavePatient = (patientData: Omit<Patient, 'id'>, id?: string) => {
    if (isReadOnly) return;
    startSubmitTransition(async () => {
      const result = id 
        ? await updatePatient(id, patientData)
        : await savePatient(patientData, uuidv4());

       if(result.success) {
        toast({ title: "Paciente Guardado" });
        setIsEditOpen(false);
        setEditingPatient(null);
        loadData();
      }
    });
  }

  const handleDownloadExcel = async () => {
    if (patients.length === 0) {
        toast({ title: "No hay datos", variant: "destructive"});
        return;
    }
    const xlsx = await import('xlsx');
    const worksheetData = patients.map(p => ({
        'No.Expediente': p.expediente ?? '', 
        'Nombre': p.name ?? '', 
        'Apaterno': p.paternalLastName ?? '', 
        'Amaterno': p.maternalLastName ?? '', 
        'FNacimiento': p.birthDate ?? '', 
        'Edad': p.age ?? '', 
        'Sexo': p.sex ?? '', 
        'Domicilio': p.address ?? '', 
        'Estatus': p.status ?? 'Vigente', 
        'Telefono': p.phoneNumber ?? '', 
        'CURP': p.curp ?? '',
    }));
    const ws = xlsx.utils.json_to_sheet(worksheetData);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Pacientes');
    xlsx.writeFile(wb, `padron_pacientes_${statusFilter}.xlsx`);
  }

  const handleClinicSelect = (clinicId: string) => {
    setSelectedClinics(prev => 
        prev.includes(clinicId) 
            ? prev.filter(id => id !== clinicId)
            : [...prev, clinicId]
    );
  };

  const handleManualDateChange = (dm: string, y: string) => {
    setManualDayMonth(dm);
    setManualYear(y);
    if (dm.length === 5 && y.length === 4) {
      const dateStr = `${dm}/${y}`;
      const parsedDate = parse(dateStr, 'dd/MM/yyyy', new Date());
      if (isValid(parsedDate)) {
        setDateFilter('range');
        setDateRange({ from: parsedDate, to: parsedDate });
      }
    }
  };

  const appointmentsToDisplay = useMemo(() => {
    let filtered = [...allAppointments];
    
    // 1. Filtrado por tipo de clínica (Especialista por defecto)
    if (selectedClinicType !== 'all') {
        const clinicsOfType = clinics.filter(c => {
            const sType = serviceTypes.find(st => st.id === c.serviceTypeId || st.name === c.serviceTypeId);
            return sType?.name === selectedClinicType || c.serviceTypeId === selectedClinicType;
        }).map(c => c.id);
        filtered = filtered.filter(app => clinicsOfType.includes(app.clinicId));
    }
    
    // 2. Filtrado por clínicas seleccionadas manualmente
    if (selectedClinics.length > 0) {
        filtered = filtered.filter(app => selectedClinics.includes(app.clinicId));
    }
    
    // 3. Filtrado por fecha
    const now = new Date();
    let filterFn: (app: any) => boolean;
    switch (dateFilter) {
      case 'tomorrow':
        const tomorrowStart = startOfDay(addDays(now, 1));
        const tomorrowEnd = endOfDay(addDays(now, 1));
        filterFn = (app) => isWithinInterval(parseISO(app.date), { start: tomorrowStart, end: tomorrowEnd });
        break;
      case 'week':
        const weekStart = startOfWeek(now, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
        filterFn = (app) => isWithinInterval(parseISO(app.date), { start: weekStart, end: weekEnd });
        break;
      case 'month':
        const monthStart = startOfMonth(now);
        const monthEnd = endOfMonth(now);
        filterFn = (app) => isWithinInterval(parseISO(app.date), { start: monthStart, end: monthEnd });
        break;
      case 'range':
        if (dateRange?.from) {
          const rangeStart = startOfDay(dateRange.from);
          const rangeEnd = endOfDay(dateRange.to || dateRange.from);
          filterFn = (app) => {
            const appDate = parseISO(app.date);
            return appDate >= rangeStart && appDate <= rangeEnd;
          };
        } else filterFn = () => true;
        break;
      case 'today':
      default:
        const todayStart = startOfDay(now);
        const todayEnd = endOfDay(now);
        filterFn = (app) => isWithinInterval(parseISO(app.date), { start: todayStart, end: todayEnd });
        break;
    }
    filtered = filtered.filter(filterFn);

    // 4. Filtrado por término de búsqueda (Nombre, CURP, Folio)
    if (searchTerm) {
        const term = searchTerm.toUpperCase();
        filtered = filtered.filter(a => {
            const fullName = `${a.patient?.name || ''} ${a.patient?.paternalLastName || ''} ${a.patient?.maternalLastName || ''}`.toUpperCase();
            const curp = (a.patient?.curp || '').toUpperCase();
            const folio = (a.appointmentNumber || '').toUpperCase();
            return fullName.includes(term) || curp.includes(term) || folio.includes(term);
        });
    }

    return filtered.sort((a, b) => a.time.localeCompare(b.time));
  }, [allAppointments, selectedClinics, selectedClinicType, dateFilter, dateRange, clinics, serviceTypes, searchTerm]);

  const handleDownloadPDF = async () => {
      if (appointmentsToDisplay.length === 0) {
          toast({ title: 'No hay citas para exportar', variant: 'destructive' });
          return;
      }
      const title = `LISTADO DE CITAS - ${selectedClinicType.toUpperCase()}`;
      const subtitle = `Filtro: ${dateFilter.toUpperCase()} | Registros: ${appointmentsToDisplay.length}`;
      await generateArchiveListPDF(appointmentsToDisplay, title, subtitle);
  };

  const onSearchNameChange = (val: string) => {
      setSearchName(val.toUpperCase());
      if (val) { setSearchCurp(''); setSearchExpediente(''); }
  };

  const onSearchCurpChange = (val: string) => {
      setSearchCurp(val.toUpperCase());
      if (val) { setSearchName(''); setSearchExpediente(''); }
  };

  const onSearchExpedienteChange = (val: string) => {
      setSearchExpediente(val);
      if (val) { setSearchName(''); setSearchCurp(''); }
  };

  return (
    <div className="container mx-auto px-4 py-6">
      <Card className="border-none shadow-none bg-transparent mb-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {isReadOnly ? <Eye className="h-8 w-8 text-blue-600" /> : <Users className="h-8 w-8 text-primary" />}
            <div>
                <h1 className="text-3xl font-bold font-headline">
                    {isReadOnly ? 'Consulta de Recursos' : 'Control de Archivo'}
                </h1>
                <p className="text-muted-foreground">
                    {isReadOnly ? 'Revisión de registros de pacientes (Solo Lectura).' : 'Gestión integral del padrón de pacientes y citas.'}
                </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={loadData} disabled={isDataLoading}>
              <RefreshCw className={cn("mr-2 h-4 w-4", isDataLoading && "animate-spin")} />
              Actualizar Datos
            </Button>
            <Button variant="outline" onClick={onLogout} className="flex-1 sm:flex-none">
              <LogOut className="mr-2 h-4 w-4" />
              Cerrar Sesión
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Pacientes Vigentes', count: counts.vigente, status: PatientStatusEnum.Vigente, icon: UserCheck, color: 'text-green-600' },
          { label: 'Baja Temporal', count: counts.bajaTemporal, status: PatientStatusEnum.Baja, icon: Clock, color: 'text-yellow-600' },
          { label: 'Baja Definitiva', count: counts.bajaDefinitiva, status: PatientStatusEnum.BajaDefinitiva, icon: UserX, color: 'text-red-600' },
          { label: 'Total de Pacientes', count: counts.total, status: 'Total' as const, icon: Users, color: 'text-primary' }
        ].map((item) => (
          <button
            key={item.label}
            onClick={() => { setStatusFilter(item.status); }}
            className={cn(
              "group relative flex flex-col items-start p-4 rounded-xl border transition-all duration-200 text-left outline-none",
              statusFilter === item.status 
                ? "bg-card border-primary ring-2 ring-primary/20 shadow-lg scale-[1.02]" 
                : "bg-muted/30 border-transparent hover:bg-muted/50 hover:border-muted-foreground/20"
            )}
          >
            <div className="flex items-center justify-between w-full mb-2">
              <item.icon className={cn("h-5 w-5", item.color)} />
              {statusFilter === item.status && <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />}
            </div>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{item.label}</span>
            <span className={cn("text-2xl font-bold", item.color)}>{item.count.toLocaleString()}</span>
          </button>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="patients">Padrón de Pacientes</TabsTrigger>
          <TabsTrigger value="appointments">Reporte de Citas</TabsTrigger>
        </TabsList>

        <TabsContent value="patients" className="space-y-4 pt-4">
          <Card className="relative overflow-hidden">
            <CardHeader className="pb-4">
              <div className="flex flex-col space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 w-full">
                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Nombres o Apellidos..." 
                            value={searchName} 
                            onChange={e => onSearchNameChange(e.target.value)} 
                            onKeyDown={e => e.key === 'Enter' && loadData()}
                            className="pl-9 pr-9 h-11"
                        />
                        {searchName && (
                            <button onClick={() => setSearchName('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                                <XCircle className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                    <div className="relative group">
                        <Input 
                            placeholder="CURP (Exacto)..." 
                            value={searchCurp} 
                            onChange={e => onSearchCurpChange(e.target.value)} 
                            onKeyDown={e => e.key === 'Enter' && loadData()}
                            className="h-11 pr-9"
                            maxLength={18}
                        />
                        {searchCurp && (
                            <button onClick={() => setSearchCurp('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                                <XCircle className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                    <div className="relative group">
                        <Input 
                            placeholder="No. Expediente..." 
                            value={searchExpediente} 
                            onChange={e => onSearchExpedienteChange(e.target.value)} 
                            onKeyDown={e => e.key === 'Enter' && loadData()}
                            className="h-11 pr-9"
                        />
                        {searchExpediente && (
                            <button onClick={() => setSearchExpediente('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                                <XCircle className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={loadData} className="h-11 flex-1 font-bold" disabled={isDataLoading}>
                            {isDataLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
                            BUSCAR
                        </Button>
                        <Button variant="outline" onClick={handleClearSearch} className="h-11" title="Limpiar Todo">
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t mt-2">
                  {!isReadOnly && (
                    <>
                        <Button onClick={handleAddNew} size="sm" className="bg-primary hover:bg-primary/90">
                            <PlusCircle className="h-4 w-4 mr-2" /> Nuevo Paciente
                        </Button>
                        <MassUploadDialog isOpen={isUploadOpen} onClose={() => setIsUploadOpen(false)} onUploadSuccess={loadData} />
                        <Button onClick={() => setIsUploadOpen(true)} variant="secondary" size="sm">
                            <Upload className="h-4 w-4 mr-2" /> Cargar Excel
                        </Button>
                        <Button onClick={handleDownloadExcel} variant="outline" size="sm">
                            <Download className="mr-2 h-4 w-4" /> Exportar Padrón
                        </Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="relative min-h-[400px]">
              {isDataLoading && (
                <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-[2px] flex flex-col items-center justify-center rounded-lg">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                </div>
              )}

              {patients.length === 0 && !isDataLoading ? (
                <div className="flex flex-col items-center justify-center py-20 text-center gap-4 opacity-60">
                  <Users className="h-16 w-16 text-muted-foreground" />
                  <div>
                    <p className="text-lg font-bold">No se encontraron registros</p>
                    <p className="text-sm text-muted-foreground">Intenta con otros criterios de búsqueda o verifica el estatus seleccionado.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <PatientList 
                    patients={paginatedPatients} 
                    onEdit={handleEdit} 
                    onDelete={handleDelete} 
                    onStatusChange={handleStatusChange} 
                    onSchedule={handleSchedule} 
                    isSubmitting={isSubmitting}
                    isReadOnly={isReadOnly}
                  />
                  
                  <div className="flex flex-col sm:flex-row items-center justify-between border-t pt-4 gap-4">
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground whitespace-nowrap">Registros por página</span>
                      <Select value={String(rowsPerPage)} onValueChange={(v) => { setRowsPerPage(Number(v)); setCurrentPage(1); }}>
                        <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="50">50</SelectItem>
                          <SelectItem value="100">100</SelectItem>
                          <SelectItem value="200">200</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="text-sm text-muted-foreground whitespace-nowrap font-bold">Total: {patients.length}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1}>Anterior</Button>
                      <div className="bg-muted px-3 py-1 rounded-md text-sm font-medium">Página {currentPage} de {totalPages || 1}</div>
                      <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage >= totalPages || totalPages === 0}>Siguiente</Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appointments" className="pt-4 space-y-4">
           <Card className="shadow-md border-primary/10">
                <CardHeader className="pb-4 bg-muted/10">
                    <div className="flex flex-col space-y-6">
                        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                            <CardTitle className="flex items-center gap-2">
                                <Filter className="h-5 w-5 text-primary" /> Filtros de Agenda
                            </CardTitle>
                            <div className="flex flex-wrap items-center gap-4">
                                <div className="flex items-center gap-1 bg-background p-1 border rounded-lg shadow-sm">
                                    <Button variant={dateFilter === 'today' ? 'default' : 'ghost'} onClick={() => setDateFilter('today')} size="sm">Hoy</Button>
                                    <Button variant={dateFilter === 'tomorrow' ? 'default' : 'ghost'} onClick={() => setDateFilter('tomorrow')} size="sm">Mañana</Button>
                                    <Button variant={dateFilter === 'week' ? 'default' : 'ghost'} onClick={() => setDateFilter('week')} size="sm">Semana</Button>
                                    <Button variant={dateFilter === 'month' ? 'default' : 'ghost'} onClick={() => setDateFilter('month')} size="sm">Mes</Button>
                                </div>
                                <div className="flex items-center gap-2 bg-background p-2 rounded-xl border border-dashed border-primary/20 shadow-sm">
                                    <div className="flex flex-col gap-1">
                                        <Label className="text-[10px] font-black uppercase text-primary h-3">Día/Mes</Label>
                                        <Input placeholder="11/07" value={manualDayMonth} onChange={e => {
                                            let v = e.target.value.replace(/\D/g, '');
                                            if (v.length > 2) v = v.substring(0,2) + '/' + v.substring(2,4);
                                            handleManualDateChange(v.substring(0,5), manualYear);
                                        }} className="h-8 w-20 text-center font-bold text-xs" maxLength={5} />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <Label className="text-[10px] font-black uppercase text-primary h-3">Año</Label>
                                        <Input type="number" value={manualYear} onChange={e => handleManualDateChange(manualDayMonth, e.target.value.substring(0,4))} className="h-8 w-16 text-center font-bold text-xs" />
                                    </div>
                                </div>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" size="sm" className="h-10 min-w-[160px] border-primary/20">
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {dateRange?.from ? (dateRange.to ? `${format(dateRange.from, 'dd/MM')} - ${format(dateRange.to, 'dd/MM')}` : format(dateRange.from, 'dd/MM')) : "Selector Rango"}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="end">
                                        <Calendar mode="range" selected={dateRange} onSelect={r => { setDateRange(r); setDateFilter('range'); }} numberOfMonths={2} locale={es} />
                                    </PopoverContent>
                                </Popover>
                                <Button onClick={handleDownloadPDF} variant="secondary" size="sm" className="h-10 px-4 font-bold border-primary/20">
                                    <FileText className="mr-2 h-4 w-4" /> Descargar Listado (PDF)
                                </Button>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 border-t pt-4">
                            <div className="flex items-center gap-2">
                                <Label className="text-xs font-black uppercase text-muted-foreground">Categoría:</Label>
                                <Select value={selectedClinicType} onValueChange={v => { setSelectedClinicType(v); setSelectedClinics([]); }}>
                                    <SelectTrigger className="h-10 w-[220px] bg-background border-primary/40 font-bold uppercase text-xs">
                                        <SelectValue placeholder="Todas" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todas las Categorías</SelectItem>
                                        {serviceTypes.map(s => <SelectItem key={s.id} value={s.name} className="text-xs font-bold uppercase">{s.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="h-10 border-dashed bg-background border-primary/20 font-bold text-xs">
                                        <Plus className="mr-2 h-4 w-4 text-primary" />
                                        Filtrar Consultorio
                                        {selectedClinics.length > 0 && <Badge className="ml-2 px-1 bg-primary text-white">{selectedClinics.length}</Badge>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[300px] p-0" align="start">
                                    <Command>
                                        <CommandInput placeholder="Buscar consultorio..." />
                                        <CommandList>
                                            <CommandEmpty>No hay resultados.</CommandEmpty>
                                            <CommandGroup>
                                                {clinics.filter(c => {
                                                    if (selectedClinicType === 'all') return true;
                                                    const sType = serviceTypes.find(st => st.id === c.serviceTypeId || st.name === c.serviceTypeId);
                                                    return sType?.name === selectedClinicType || c.serviceTypeId === selectedClinicType;
                                                }).map(c => (
                                                    <CommandItem key={c.id} onSelect={() => handleClinicSelect(c.id)} className="cursor-pointer">
                                                        <div className={cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary", selectedClinics.includes(c.id) ? "bg-primary text-white" : "opacity-50 [&_svg]:invisible")}><Check className="h-4 w-4" /></div>
                                                        <span className="text-xs uppercase font-bold">{c.name}</span>
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                            <div className="relative flex-1 min-w-[250px]">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input 
                                    placeholder="Buscar por Nombre, CURP o Folio..." 
                                    className="pl-9 h-11 border-primary/20 bg-background" 
                                    value={searchTerm} 
                                    onChange={e => setSearchTerm(e.target.value)} 
                                />
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-6">
                    {isDataLoading ? (
                        <div className="py-20 flex flex-col items-center gap-4">
                            <Loader2 className="h-12 w-12 animate-spin text-primary" />
                            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground animate-pulse">Sincronizando Agenda...</p>
                        </div>
                    ) : (
                        <AppointmentList 
                          appointments={appointmentsToDisplay} 
                          clinics={clinics} 
                          isAdmin={!isReadOnly} 
                          onDelete={handleAppointmentDelete} 
                          onEditSuccess={loadData} 
                        />
                    )}
                </CardContent>
           </Card>
        </TabsContent>
      </Tabs>

      {isEditOpen && <EditPatientDialog isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} patient={editingPatient} onSave={handleSavePatient} isSaving={isSubmitting} />}
      {schedulingPatient && <ScheduleAppointmentDialog patient={schedulingPatient} isOpen={!!schedulingPatient} onClose={() => setSchedulingPatient(null)} onBookingSuccess={() => { setSchedulingPatient(null); loadData(); }} clinics={clinics} colonias={colonias} isDoctorBypass={true} />}
    </div>
  );
}

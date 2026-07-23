
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
  Search, 
  Users, 
  UserCheck, 
  Clock, 
  UserX, 
  PlusCircle,
  X,
  Upload,
  Download,
  Eye,
  Calendar as CalendarIcon,
  FileText,
  RefreshCw,
  AlertTriangle,
  DatabaseZap
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { 
  getPatients, 
  getPatientCounts, 
  deletePatients,
  updatePatientStatus, 
  savePatient, 
  getAppointments, 
  getClinics, 
  updatePatient, 
  getServiceTypes,
  getColonias,
  getAnnouncements,
  getModuleSettings
} from '@/lib/actions';
import type { Patient, Appointment, Clinic, ArchiveCounts, ServiceType, Colonia } from '@/lib/definitions';
import { PatientStatus as PatientStatusEnum } from '@/lib/definitions';
import { PatientList } from './patient-list';
import { MassUploadDialog } from './mass-upload-dialog';
import { EditPatientDialog } from './edit-patient-dialog';
import { ScheduleAppointmentDialog } from './schedule-appointment-dialog';
import { AppointmentList } from '../appointment-list';
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
  isValid
} from 'date-fns';
import { es } from 'date-fns/locale';
import { DateRange } from 'react-day-picker';
import { Calendar } from '../ui/calendar';
import { downloadExcel, generateArchiveListPDF } from '@/lib/report-helpers';
import { Label } from '../ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type DateFilterType = 'today' | 'tomorrow' | 'week' | 'month' | 'range';

export function ArchiveDashboard({ onLogout, isReadOnly = false }: { onLogout: () => void, isReadOnly?: boolean }) {
  const [activeTab, setActiveTab] = useState('patients');

  const [searchName, setSearchName] = useState('');
  const [searchCurp, setSearchCurp] = useState('');
  const [searchExpediente, setSearchExpediente] = useState('');
  
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientIds, setSelectedPatientIds] = useState<string[]>([]);
  const [counts, setCounts] = useState<ArchiveCounts>({ total: 0, vigente: 0, bajaTemporal: 0, bajaDefinitiva: 0 });
  const [statusFilter, setStatusFilter] = useState<'Total' | PatientStatusEnum>(PatientStatusEnum.Vigente);
  
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [schedulingPatient, setSchedulingPatient] = useState<Patient | null>(null);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  
  const [allAppointments, setAllAppointments] = useState<Appointment[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [colonias, setColonias] = useState<Colonia[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [selectedClinics, setSelectedClinics] = useState<string[]>([]);
  const [selectedClinicType, setSelectedClinicType] = useState<string | 'all'>('all');
  const [dateFilter, setDateFilter] = useState<DateFilterType>('today');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [searchTerm, setSearchTerm] = useState('');

  const [isDataLoading, setIsDataLoading] = useState(false);
  const [isSubmitting, startSubmitTransition] = useTransition();

  const { toast } = useToast();

  const loadData = useCallback(async (manualSearch = false) => {
    setIsDataLoading(true);
    try {
      const [countsData, clinicsData, serviceTypesData, coloniasData] = await Promise.all([
        getPatientCounts(), getClinics(), getServiceTypes(), getColonias()
      ]);
      setCounts(countsData);
      setClinics(clinicsData);
      setServiceTypes(serviceTypesData);
      setColonias(coloniasData);

      if (activeTab === 'appointments') {
          const apps = await getAppointments();
          setAllAppointments(apps);
      }

      const searchOptions: any = { 
          status: statusFilter === 'Total' ? undefined : statusFilter,
          limitNum: 10000 
      };
      
      if (manualSearch) {
          if (searchName) searchOptions.searchName = searchName;
          if (searchCurp) searchOptions.searchCurp = searchCurp;
          if (searchExpediente) searchOptions.searchExpediente = searchExpediente;
      }

      const patientsData = await getPatients(searchOptions);
      
      // PERSISTENCIA DE SELECCIÓN: Mezclamos los nuevos pacientes con los ya seleccionados para no perder el rastro
      setPatients(prev => {
          const selectedInPrev = prev.filter(p => selectedPatientIds.includes(p.id));
          const newBatch = [...patientsData];
          
          // Agregamos a la lista visible cualquier paciente seleccionado que no esté en el nuevo resultado
          selectedInPrev.forEach(sel => {
              if (!newBatch.some(n => n.id === sel.id)) {
                  newBatch.push(sel);
              }
          });
          
          return newBatch;
      });
      
      if (!manualSearch) setCurrentPage(1);
    } catch (e) {
      toast({ title: 'Error al conectar con el servidor', variant: 'destructive' });
    } finally {
      setIsDataLoading(false);
    }
  }, [statusFilter, activeTab, toast, searchName, searchCurp, searchExpediente, selectedPatientIds]);
  
  useEffect(() => {
    loadData(false);
  }, [statusFilter, activeTab, loadData]);

  /**
   * MARCADO AUTOMÁTICO (Smart Mark):
   * En la pestaña de Baja Temporal, al escribir un expediente exacto, se marca automáticamente.
   */
  useEffect(() => {
    if (statusFilter === PatientStatusEnum.Baja && searchExpediente.trim().length >= 1) {
        const term = String(searchExpediente).trim();
        const found = patients.find(p => String(p.expediente || '').trim() === term);
        if (found && !selectedPatientIds.includes(found.id)) {
            setSelectedPatientIds(prev => [...prev, found.id]);
            toast({ 
                title: "Marcado Automático", 
                description: `${found.name} agregado al lote de procesamiento.`, 
                duration: 1000 
            });
            // Limpiamos el campo para el siguiente escaneo sin ocultar la lista
            setSearchExpediente(''); 
        }
    }
  }, [searchExpediente, patients, statusFilter, selectedPatientIds, toast]);

  const visiblePatients = useMemo(() => {
    const sName = searchName.toUpperCase().trim();
    const sCurp = searchCurp.toUpperCase().trim();
    const sExp = searchExpediente.trim();

    return patients.filter(p => {
        // Los pacientes seleccionados SIEMPRE son visibles
        if (selectedPatientIds.includes(p.id)) return true;
        
        const fullName = `${p.name} ${p.paternalLastName} ${p.maternalLastName}`.toUpperCase();
        const nameMatch = !sName || fullName.includes(sName);
        const curpMatch = !sCurp || p.curp.toUpperCase().includes(sCurp);
        
        // Si estamos en Baja Temporal, no filtramos por expediente para permitir el "Smart Mark"
        if (statusFilter === PatientStatusEnum.Baja) return nameMatch && curpMatch;
        
        const expMatch = !sExp || String(p.expediente || '').includes(sExp);
        return nameMatch && curpMatch && expMatch;
    });
  }, [patients, statusFilter, searchName, searchCurp, searchExpediente, selectedPatientIds]);

  const handleClearSearch = () => {
      setSearchName(''); setSearchCurp(''); setSearchExpediente('');
  };

  const handleStatusCardClick = (status: 'Total' | PatientStatusEnum) => {
      if (status !== statusFilter) {
          setStatusFilter(status);
          setCurrentPage(1);
      }
  };

  const paginatedPatients = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return visiblePatients.slice(start, start + rowsPerPage);
  }, [visiblePatients, currentPage, rowsPerPage]);

  const totalPages = Math.ceil(visiblePatients.length / rowsPerPage);

  const handleAddNew = () => { setEditingPatient(null); setIsEditOpen(true); };
  const handleEdit = (patient: Patient) => { setEditingPatient(patient); setIsEditOpen(true); };
  const handleSchedule = (patient: Patient) => { setSchedulingPatient(patient); };
  
  const handleDeleteLogical = (patientId: string) => {
    if (isReadOnly) return;
    startSubmitTransition(async () => {
      await updatePatientStatus(patientId, PatientStatusEnum.BajaDefinitiva);
      toast({ title: "Movido a Baja Definitiva" });
      loadData(true);
    });
  }

  const handleBulkToDefinitive = () => {
      if (selectedPatientIds.length === 0 || isReadOnly) return;
      const ids = [...selectedPatientIds];
      startSubmitTransition(async () => {
          for (const id of ids) {
              await updatePatientStatus(id, PatientStatusEnum.BajaDefinitiva);
          }
          setSelectedPatientIds([]);
          toast({ title: "Lote Procesado", description: `${ids.length} registros movidos a Baja Definitiva.` });
          loadData(true);
      });
  };

  const handlePhysicalDeleteAll = () => {
    if (isReadOnly || statusFilter !== PatientStatusEnum.BajaDefinitiva) return;
    const ids = patients.map(p => p.id);
    if (ids.length === 0) return;
    
    startSubmitTransition(async () => {
        const result = await deletePatients(ids);
        if (result.success) {
            toast({ title: "Depuración Física Completada" });
            loadData(true);
        }
    });
  }

  const handleStatusChange = (patientId: string, newStatus: PatientStatusEnum) => {
    if (isReadOnly) return;
    startSubmitTransition(async () => {
      await updatePatientStatus(patientId, newStatus);
      toast({ title: "Estatus Actualizado" });
      loadData(true);
    });
  }
  
  const handleSavePatient = (patientData: Omit<Patient, 'id'>, id?: string) => {
    if (isReadOnly) return;
    startTransition(async () => {
      const result = id ? await updatePatient(id, patientData) : await savePatient(patientData);
       if(result.success) {
        toast({ title: "Información Guardada" });
        setIsEditOpen(false); setEditingPatient(null); loadData(true);
      } else {
          toast({ title: 'Error al guardar', description: result.message, variant: 'destructive' });
      }
    });
  }

  const appointmentsToDisplay = useMemo(() => {
    if (allAppointments.length === 0) return [];
    const now = new Date();
    let result = allAppointments.filter(app => {
        const appDate = parseISO(app.date);
        switch (dateFilter) {
            case 'tomorrow': return isWithinInterval(appDate, { start: startOfDay(addDays(now, 1)), end: endOfDay(addDays(now, 1)) });
            case 'week': return isWithinInterval(appDate, { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) });
            case 'month': return isWithinInterval(appDate, { start: startOfMonth(now), end: endOfMonth(now) });
            case 'range':
                if (dateRange?.from) return appDate >= startOfDay(dateRange.from) && appDate <= endOfDay(dateRange.to || dateRange.from);
                return true;
            case 'today':
            default: return isWithinInterval(appDate, { start: startOfDay(now), end: endOfDay(now) });
        }
    });

    if (selectedClinicType !== 'all') {
        result = result.filter(a => clinics.find(c => c.id === a.clinicId)?.serviceTypeId === selectedClinicType);
    }
    if (selectedClinics.length > 0) {
        result = result.filter(a => selectedClinics.includes(a.clinicId));
    }
    if (searchTerm) {
        const t = searchTerm.toUpperCase();
        result = result.filter(a => {
            const n = `${a.patient?.name || ''} ${a.patient?.paternalLastName || ''} ${a.patient?.maternalLastName || ''}`.toUpperCase();
            return n.includes(t) || (a.patient?.curp || '').toUpperCase().includes(t) || (a.appointmentNumber || '').toUpperCase().includes(t);
        });
    }
    return result.sort((a,b) => a.time.localeCompare(b.time));
  }, [allAppointments, dateFilter, dateRange, selectedClinicType, selectedClinics, searchTerm, clinics]);

  return (
    <div className="container mx-auto px-4 py-6">
      <Card className="border-none shadow-none bg-transparent mb-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {isReadOnly ? <Eye className="h-8 w-8 text-blue-600" /> : <Users className="h-8 w-8 text-primary" />}
            <div>
                <h1 className="text-3xl font-bold font-headline uppercase">{isReadOnly ? 'Consulta de Padrón' : 'Gestión de Archivo'}</h1>
                <p className="text-muted-foreground">{isReadOnly ? 'Revisión técnica de registros (Lectura).' : 'Mantenimiento preventivo y depuración del padrón.'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => loadData(true)} disabled={isDataLoading}><RefreshCw className={cn("mr-2 h-4 w-4", isDataLoading && "animate-spin")} /> Sincronizar</Button>
            <Button variant="outline" onClick={onLogout}>Salir</Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Vigentes', count: counts.vigente, status: PatientStatusEnum.Vigente, icon: UserCheck, color: 'text-green-600' },
          { label: 'Baja Temporal', count: counts.bajaTemporal, status: PatientStatusEnum.Baja, icon: Clock, color: 'text-yellow-600' },
          { label: 'Baja Definitiva', count: counts.bajaDefinitiva, status: PatientStatusEnum.BajaDefinitiva, icon: UserX, color: 'text-red-600' },
          { label: 'Total Padrón', count: counts.total, status: 'Total' as const, icon: Users, color: 'text-primary' }
        ].map((item) => (
          <button key={item.label} onClick={() => handleStatusCardClick(item.status)} className={cn("flex flex-col items-start p-4 rounded-xl border transition-all text-left", statusFilter === item.status ? "bg-card border-primary ring-2 ring-primary/20 shadow-lg scale-[1.02]" : "bg-muted/30 border-transparent hover:bg-muted/50")}>
            <div className="flex items-center justify-between w-full mb-2"><item.icon className={cn("h-5 w-5", item.color)} />{statusFilter === item.status && <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />}</div>
            <span className="text-[10px] font-black uppercase text-muted-foreground">{item.label}</span>
            <span className={cn("text-2xl font-black", item.color)}>{item.count.toLocaleString()}</span>
          </button>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-muted/20 p-1">
          <TabsTrigger value="patients" className="font-bold">Listado de Pacientes</TabsTrigger>
          <TabsTrigger value="appointments" className="font-bold">Agenda de Citas</TabsTrigger>
        </TabsList>

        <TabsContent value="patients" className="space-y-4 pt-4">
          <Card className="relative overflow-hidden shadow-md border-primary/10">
            <CardHeader className="pb-4 bg-muted/5">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase text-primary tracking-widest">Nombre o Apellidos</Label><Input placeholder="FILTRAR POR NOMBRE..." value={searchName} onChange={e => setSearchName(e.target.value.toUpperCase())} className="h-11 border-primary/20" /></div>
                    <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase text-primary tracking-widest">CURP</Label><Input placeholder="CURP (18 CARAC)..." value={searchCurp} onChange={e => setSearchCurp(e.target.value.toUpperCase())} className="h-11 border-primary/20" maxLength={18} /></div>
                    <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase text-primary tracking-widest">Expediente {statusFilter === PatientStatusEnum.Baja && "(Smart Mark)"}</Label>
                        <Input placeholder={statusFilter === PatientStatusEnum.Baja ? "ESCRIBE EXP PARA MARCAR..." : "FILTRAR POR EXP..."} value={searchExpediente} onChange={e => setSearchExpediente(e.target.value)} className="h-11 border-primary/20" />
                    </div>
                    <div className="flex gap-2 items-end">
                        <Button onClick={() => loadData(true)} className="h-11 flex-1 font-black bg-primary hover:bg-primary/90" disabled={isDataLoading}>{isDataLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />} FILTRAR</Button>
                        <Button variant="outline" onClick={handleClearSearch} className="h-11"><X className="h-4 w-4" /></Button>
                    </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-dashed mt-2">
                    <div className="flex flex-wrap items-center gap-2">
                        {!isReadOnly && <><Button onClick={handleAddNew} size="sm" className="font-bold"><PlusCircle className="mr-2 h-4 w-4" /> Nuevo</Button><Button onClick={() => setIsUploadOpen(true)} variant="secondary" size="sm" className="font-bold"><Upload className="mr-2 h-4 w-4" /> Carga Masiva</Button></>}
                        <Button onClick={() => downloadExcel(visiblePatients, `padron_${statusFilter}`)} variant="outline" size="sm" className="font-bold"><Download className="mr-2 h-4 w-4" /> Excel ({visiblePatients.length})</Button>
                    </div>
                    <div className="flex items-center gap-2">
                        {statusFilter === PatientStatusEnum.BajaDefinitiva && !isReadOnly && patients.length > 0 && (
                             <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive" size="sm" className="font-black bg-red-700"><DatabaseZap className="mr-2 h-4 w-4" /> VACIAR BAJA DEFINITIVA</Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader><AlertDialogTitle className="text-red-700 flex items-center gap-2"><AlertTriangle /> ACCIÓN IRREVERSIBLE</AlertDialogTitle><AlertDialogDescription>Se eliminarán <span className="font-bold">{patients.length}</span> registros físicos del sistema. ¿Deseas continuar?</AlertDialogDescription></AlertDialogHeader>
                                    <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handlePhysicalDeleteAll} className="bg-red-700 hover:bg-red-800 font-bold">SÍ, BORRAR DEFINITIVAMENTE</AlertDialogAction></AlertDialogFooter>
                                </AlertDialogContent>
                             </AlertDialog>
                        )}
                        {selectedPatientIds.length > 0 && !isReadOnly && (
                            <Button variant="destructive" size="sm" className="font-black animate-in fade-in zoom-in" onClick={handleBulkToDefinitive}>
                                <UserX className="mr-2 h-4 w-4" /> MOVER A DEFINITIVA ({selectedPatientIds.length})
                            </Button>
                        )}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="relative min-h-[400px] pt-4">
              {isDataLoading && <div className="absolute inset-0 z-50 bg-background/70 backdrop-blur-[1px] flex flex-col items-center justify-center rounded-lg"><Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="text-xs font-black uppercase tracking-widest mt-4 animate-pulse">Sincronizando Base de Datos...</p></div>}
              {visiblePatients.length === 0 && !isDataLoading ? (
                  <div className="text-center py-32 opacity-40"><UserX className="h-20 w-20 mx-auto mb-4" /><p className="text-xl font-bold uppercase">Sin registros coincidentes</p></div>
              ) : (
                <div className={cn(isDataLoading && "opacity-40 blur-[1px]")}>
                  <PatientList patients={paginatedPatients} onEdit={handleEdit} onDelete={handleDeleteLogical} onStatusChange={handleStatusChange} onSchedule={handleSchedule} isSubmitting={isSubmitting} isReadOnly={isReadOnly} selectedIds={selectedPatientIds} onSelectionChange={setSelectedPatientIds} />
                  <div className="flex items-center justify-between border-t mt-6 pt-4">
                      <div className="flex items-center gap-2"><span className="text-xs font-bold text-muted-foreground">Mostrando {paginatedPatients.length} de {visiblePatients.length} resultados</span></div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1}>Anterior</Button>
                        <Badge className="h-8 px-4 font-black">Pág {currentPage} de {totalPages || 1}</Badge>
                        <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage >= totalPages || totalPages === 0}>Siguiente</Button>
                      </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appointments" className="space-y-4 pt-4">
           <Card className="shadow-md border-primary/10">
                <CardHeader className="pb-4 bg-muted/5">
                    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                        <CardTitle className="flex items-center gap-2 font-bold"><CalendarIcon className="h-5 w-5 text-primary" /> Agenda del Hospital</CardTitle>
                        <div className="flex flex-wrap items-center gap-4">
                            <div className="flex items-center gap-1 bg-background p-1 border rounded-lg shadow-sm">
                                {['today', 'tomorrow', 'week', 'month'].map((f) => (
                                    <Button key={f} variant={dateFilter === f ? 'default' : 'ghost'} onClick={() => setDateFilter(f as any)} size="sm" className="capitalize">{f === 'today' ? 'Hoy' : f === 'tomorrow' ? 'Mañana' : f === 'week' ? 'Semana' : 'Mes'}</Button>
                                ))}
                            </div>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-9 min-w-[160px] border-primary/20"><CalendarIcon className="mr-2 h-4 w-4" /> {dateRange?.from ? (dateRange.to ? `${format(dateRange.from, 'dd/MM')} - ${format(dateRange.to, 'dd/MM')}` : format(dateRange.from, 'dd/MM')) : "Selector de Rango"}</Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="end"><Calendar mode="range" selected={dateRange} onSelect={r => { setDateRange(r); setDateFilter('range'); }} numberOfMonths={2} locale={es} /></PopoverContent>
                            </Popover>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 mt-6 border-t pt-4">
                        <Select value={selectedClinicType} onValueChange={v => { setSelectedClinicType(v); setSelectedClinics([]); }}>
                            <SelectTrigger className="h-10 w-[200px] bg-background"><SelectValue placeholder="Categoría" /></SelectTrigger>
                            <SelectContent><SelectItem value="all">Todas las Categorías</SelectItem>{serviceTypes.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                        </Select>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="h-10 border-dashed bg-background">
                                    <PlusCircle className="mr-2 h-4 w-4 text-primary" /> Filtrar Consultorio {selectedClinics.length > 0 && <Badge className="ml-2 px-1">{selectedClinics.length}</Badge>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[250px] p-0" align="start">
                                <Command>
                                    <CommandInput placeholder="Buscar consultorio..." />
                                    <CommandList>
                                        <CommandEmpty>No hay resultados.</CommandEmpty>
                                        <CommandGroup>
                                            {clinics.filter(c => selectedClinicType === 'all' || c.serviceTypeId === selectedClinicType).map(c => (
                                                <CommandItem key={c.id} onSelect={() => setSelectedClinics(prev => prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id])}>
                                                    <div className={cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary", selectedClinics.includes(c.id) ? "bg-primary text-white" : "opacity-50 [&_svg]:invisible")}><Users className="h-4 w-4" /></div>
                                                    <span className="text-xs font-bold uppercase">{c.name}</span>
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                        <div className="relative flex-1 min-w-[250px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Buscar por Nombre, Folio o CURP..." className="pl-9 h-10 border-primary/20 bg-background" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        </div>
                        <div className="flex gap-2">
                             <Button variant="outline" size="icon" onClick={() => loadData(true)} className="h-10 w-10 bg-background"><RefreshCw className={cn("h-4 w-4", isDataLoading && "animate-spin")} /></Button>
                             <Button variant="outline" size="sm" onClick={() => generateArchiveListPDF(appointmentsToDisplay, 'Agenda de Citas', `Filtro: ${dateFilter}`)} className="font-bold h-10 px-4 text-red-700 border-red-200"><FileText className="mr-2 h-4 w-4" /> PDF</Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-6">
                    <AppointmentList appointments={appointmentsToDisplay} clinics={clinics} isAdmin={!isReadOnly} onDelete={(appId) => {
                        const app = allAppointments.find(a => a.id === appId);
                        if (app) handleDeleteLogical(app.patientId);
                    }} onEditSuccess={() => loadData(true)} />
                </CardContent>
           </Card>
        </TabsContent>
      </Tabs>

      {isEditOpen && <EditPatientDialog isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} patient={editingPatient} onSave={handleSavePatient} isSaving={isSubmitting} />}
      {schedulingPatient && <ScheduleAppointmentDialog patient={schedulingPatient} isOpen={!!schedulingPatient} onClose={() => setSchedulingPatient(null)} onBookingSuccess={() => { setSchedulingPatient(null); loadData(true); }} clinics={clinics} colonias={colonias} isDoctorBypass={true} />}
      <MassUploadDialog isOpen={isUploadOpen} onClose={() => setIsUploadOpen(false)} onUploadSuccess={() => loadData(true)} />
    </div>
  );
}

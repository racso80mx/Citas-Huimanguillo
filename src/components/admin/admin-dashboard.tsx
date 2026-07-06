
'use client';
import { useState, useTransition, useEffect, useCallback } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
  CardFooter
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  LogOut,
  RefreshCw,
  Settings,
  UserRound,
  ClipboardList,
  LayoutList,
  Plus,
  Trash2,
  Loader2,
  Search,
  Filter,
  Check,
  Calendar as CalendarIcon,
  Hospital,
  LayoutGrid,
  ShieldAlert
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ClinicsManager } from './clinics-manager';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ModuleManager } from './module-manager';
import { ActivityLogViewer } from './activity-log-viewer';
import { HolidaysManager } from './holidays-manager';
import { SpecialActionDaysManager } from './special-action-days-manager';
import { ModuleSecurityManager } from './module-security-manager';
import { AdminPasswordManager } from './admin-password-manager';
import { AnnouncementsManager } from './announcements-manager';
import { BackupManager } from './backup-manager';
import { DoctorsCatalog } from './doctors-catalog';
import { SpecialtiesManager } from './specialties-manager';
import { ColoniasManager } from './colonias-manager';
import { Input } from '../ui/input';
import { v4 as uuidv4 } from 'uuid';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '../ui/switch';
import { 
    getServiceTypes, updateServiceTypes, getAppointments, getLabAppointments, 
    getXRayAppointments, getUltrasoundAppointments, getVaccineAppointments, 
    getClinics, deleteAppointment, deleteLabAppointment, deleteXRayAppointment, 
    deleteUltrasoundAppointment, deleteVaccineAppointment 
} from '@/lib/actions';
import React from 'react';
import { AppointmentList } from '../appointment-list';
import { LabAppointmentList } from '../laboratorio/lab-appointment-list';
import { XRayAppointmentList } from '../rayos-x/x-ray-appointment-list';
import { UltrasoundAppointmentList } from '../ultrasonidos/ultrasound-appointment-list';
import { VaccineAppointmentList } from '../vacunas/vaccine-appointment-list';
import { format, parseISO, startOfDay, endOfDay, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, parse, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { DateRange } from 'react-day-picker';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar } from '../ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../ui/command';
import { cn } from '@/lib/utils';
import Link from 'next/link';

function ServiceTypesManager() {
  const [types, setTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, startSaving] = useTransition();
  const { toast } = useToast();

  useEffect(() => {
    getServiceTypes().then(data => {
      setTypes(data);
      setLoading(false);
    });
  }, []);

  const handleAdd = () => setTypes([...types, { id: uuidv4(), name: '', available: true }]);
  const handleRemove = (id: string) => setTypes(types.filter(t => t.id !== id));
  const handleUpdate = (id: string, field: string, val: any) => {
    setTypes(types.map(t => t.id === id ? { ...t, [field]: val } : t));
  };

  const handleSave = () => {
    startSaving(async () => {
      const res = await updateServiceTypes(types);
      if (res.success) toast({ title: 'Tipos de Consulta guardados' });
    });
  };

  if (loading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;

  return (
    <Card className="shadow-lg border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-primary font-black uppercase"><LayoutList /> Catálogo de Servicios</CardTitle>
          <CardDescription>Define las categorías generales de atención.</CardDescription>
        </div>
        <Button onClick={handleAdd} variant="outline" className="font-bold border-primary/20"><Plus className="mr-2 h-4 w-4" /> Agregar Servicio</Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Categoría de Atención</TableHead>
              <TableHead className="w-[100px]">Estado</TableHead>
              <TableHead className="w-[80px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {types.map(t => (
              <TableRow key={t.id}>
                <TableCell><Input value={t.name} onChange={e => handleUpdate(t.id, 'name', e.target.value.toUpperCase())} placeholder="Nombre del servicio..." className="font-bold" /></TableCell>
                <TableCell><Switch checked={t.available} onCheckedChange={v => handleUpdate(t.id, 'available', v)} /></TableCell>
                <TableCell><Button variant="ghost" size="icon" onClick={() => handleRemove(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <CardFooter><Button onClick={handleSave} disabled={saving} className="w-full h-14 text-lg font-black shadow-xl uppercase">Sincronizar Catálogo de Servicios</Button></CardFooter>
    </Card>
  );
}

function AppointmentsViewer() {
    const [searchTerm, setSearchTerm] = useState('');
    const [data, setData] = useState<any>({ apps: [], lab: [], xr: [], us: [], vac: [], clinics: [], services: [] });
    const [loading, setLoading] = useState(true);
    
    const [dateFilter, setDateFilter] = useState<'today' | 'tomorrow' | 'week' | 'month' | 'range'>('today');
    const [dateRange, setDateRange] = useState<DateRange | undefined>();
    const [selectedServiceType, setSelectedServiceType] = useState<string | 'all'>('all');
    const [selectedClinics, setSelectedClinics] = useState<string[]>([]);
    
    const [manualDayMonth, setManualDayMonth] = useState('');
    const [manualYear, setManualYear] = useState(new Date().getFullYear().toString());

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [apps, lab, xr, us, vac, clinics, services] = await Promise.all([
                getAppointments(), getLabAppointments(), getXRayAppointments(), getUltrasoundAppointments(), getVaccineAppointments(), getClinics(), getServiceTypes()
            ]);
            setData({ apps, lab, xr, us, vac, clinics, services });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handlePatientDelete = async (id: string, type: string) => {
        let res;
        if (type === 'medical') res = await deleteAppointment(id);
        if (type === 'lab') res = await deleteLabAppointment(id);
        if (type === 'xr') res = await deleteXRayAppointment(id);
        if (type === 'us') res = await deleteUltrasoundAppointment(id);
        if (type === 'vac') res = await deleteVaccineAppointment(id);
        if (res?.success) fetchData();
    };

    const handleManualDateChange = (dm: string, y: string) => {
        setManualDayMonth(dm);
        setManualYear(y);
        if (dm.length === 5 && y.length === 4) {
            const parsed = parse(`${dm}/${y}`, 'dd/MM/yyyy', new Date());
            if (isValid(parsed)) {
                setDateFilter('range');
                setDateRange({ from: parsed, to: parsed });
            }
        }
    };

    const filterList = (list: any[], isMedicalTab: boolean = false) => {
        let results = [...list];
        const now = new Date();

        let dateFilterFn: (app: any) => boolean;
        switch (dateFilter) {
            case 'tomorrow':
                dateFilterFn = (a) => isWithinInterval(parseISO(a.date), { start: startOfDay(addDays(now, 1)), end: endOfDay(addDays(now, 1)) });
                break;
            case 'week':
                dateFilterFn = (a) => isWithinInterval(parseISO(a.date), { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) });
                break;
            case 'month':
                dateFilterFn = (a) => isWithinInterval(parseISO(a.date), { start: startOfMonth(now), end: endOfMonth(now) });
                break;
            case 'range':
                if (dateRange?.from) {
                    dateFilterFn = (a) => {
                        const d = parseISO(a.date);
                        return d >= startOfDay(dateRange.from!) && d <= endOfDay(dateRange.to || dateRange.from!);
                    };
                } else dateFilterFn = () => true;
                break;
            case 'today':
            default:
                dateFilterFn = (a) => isWithinInterval(parseISO(a.date), { start: startOfDay(now), end: endOfDay(now) });
                break;
        }
        results = list.filter(dateFilterFn);

        if (isMedicalTab) {
            if (selectedServiceType !== 'all') {
                results = results.filter(a => a.clinicId && data.clinics.find((c: any) => c.id === a.clinicId)?.serviceTypeId === selectedServiceType);
            }
            if (selectedClinics.length > 0) {
                results = results.filter(a => a.clinicId && selectedClinics.includes(a.clinicId));
            }
        }

        if (searchTerm) {
            const t = searchTerm.toUpperCase();
            results = results.filter(a => {
                const name = `${a.patient?.name || ''} ${a.patient?.paternalLastName || ''} ${a.patient?.maternalLastName || ''}`.toUpperCase();
                const curp = (a.patient?.curp || '').toUpperCase();
                const folio = (a.appointmentNumber || '').toUpperCase();
                return name.includes(t) || curp.includes(t) || folio.includes(t);
            });
        }

        return results.sort((a,b) => a.time.localeCompare(b.time));
    };

    if (loading) return <div className="p-20 flex flex-col items-center gap-4"><Loader2 className="animate-spin h-10 w-10 text-primary" /><p className='text-xs font-bold uppercase animate-pulse'>Sincronizando Agenda...</p></div>;

    return (
        <div className="space-y-6">
            <Card className="shadow-md border-primary/10">
                <CardHeader className="pb-4 bg-muted/10">
                    <div className="flex flex-col space-y-6">
                        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                            <CardTitle className="flex items-center gap-2">
                                <Filter className="h-5 w-5 text-primary" /> Filtros de Agenda
                            </CardTitle>
                            <div className="flex flex-wrap items-center gap-4">
                                <div className="flex items-center gap-1 bg-background p-1 border rounded-lg">
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
                                        <Button variant="outline" size="sm" className="h-9 min-w-[160px]">
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {dateRange?.from ? (dateRange.to ? `${format(dateRange.from, 'dd/MM')} - ${format(dateRange.to, 'dd/MM')}` : format(dateRange.from, 'dd/MM')) : "Rango"}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="end">
                                        <Calendar mode="range" selected={dateRange} onSelect={r => { setDateRange(r); setDateFilter('range'); }} numberOfMonths={2} locale={es} />
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-4">
                            <div className="flex items-center gap-2">
                                <Label className="text-xs font-bold uppercase text-muted-foreground">Categoría:</Label>
                                <Select value={selectedServiceType} onValueChange={v => { setSelectedServiceType(v); setSelectedClinics([]); }}>
                                    <SelectTrigger className="h-9 w-[180px] bg-background">
                                        <SelectValue placeholder="Todas" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todas las Categorías</SelectItem>
                                        {data.services.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="h-9 border-dashed bg-background">
                                        <Plus className="mr-2 h-4 w-4" />
                                        Filtrar Consultorio
                                        {selectedClinics.length > 0 && <Badge className="ml-2 px-1">{selectedClinics.length}</Badge>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[250px] p-0" align="start">
                                    <Command>
                                        <CommandInput placeholder="Buscar consultorio..." />
                                        <CommandList>
                                            <CommandEmpty>No hay resultados.</CommandEmpty>
                                            <CommandGroup>
                                                {data.clinics.filter((c: any) => selectedServiceType === 'all' || c.serviceTypeId === selectedServiceType).map((c: any) => (
                                                    <CommandItem key={c.id} onSelect={() => setSelectedClinics(prev => prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id])}>
                                                        <div className={cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary", selectedClinics.includes(c.id) ? "bg-primary text-white" : "opacity-50 [&_svg]:invisible")}><Check className="h-4 w-4" /></div>
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
                                <Input placeholder="Buscar por Nombre, CURP o Folio..." className="pl-9 h-11 bg-background" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                            </div>
                            <Button variant="outline" size="icon" onClick={fetchData} className="h-11 w-11"><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /></Button>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            <Tabs defaultValue="medical" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <TabsList className="bg-muted/40 p-1 mb-4 h-auto">
                  <TabsTrigger value="medical" className="py-2.5 px-6 font-bold">Cita Médica</TabsTrigger>
                  <TabsTrigger value="lab" className="py-2.5 px-6 font-bold">Laboratorio</TabsTrigger>
                  <TabsTrigger value="xr" className="py-2.5 px-6 font-bold">Rayos X</TabsTrigger>
                  <TabsTrigger value="us" className="py-2.5 px-6 font-bold">Ultrasonidos</TabsTrigger>
                  <TabsTrigger value="vac" className="py-2.5 px-6 font-bold">Vacunación</TabsTrigger>
                </TabsList>
                <TabsContent value="medical"><AppointmentList appointments={filterList(data.apps, true)} clinics={data.clinics} isAdmin onDelete={(id) => handlePatientDelete(id, 'medical')} onEditSuccess={fetchData} /></TabsContent>
                <TabsContent value="lab"><LabAppointmentList appointments={filterList(data.lab, false)} isAdmin onDelete={(id) => handlePatientDelete(id, 'lab')} onEditSuccess={fetchData} /></TabsContent>
                <TabsContent value="xr"><XRayAppointmentList appointments={filterList(data.xr, false)} isAdmin onDelete={(id) => handlePatientDelete(id, 'xr')} onEditSuccess={fetchData} /></TabsContent>
                <TabsContent value="us"><UltrasoundAppointmentList appointments={filterList(data.us, false)} isAdmin onDelete={(id) => handlePatientDelete(id, 'us')} onEditSuccess={fetchData} /></TabsContent>
                <TabsContent value="vac"><VaccineAppointmentList appointments={filterList(data.vac, false)} isAdmin onDelete={(id) => handlePatientDelete(id, 'vac')} onEditSuccess={fetchData} /></TabsContent>
            </Tabs>
        </div>
    );
}

export function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [mainTab, setMainTab] = useState("configuracion");

  return (
    <div className="space-y-8">
      <Card className="shadow-lg border-primary/10">
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-4">
          <div>
            <CardTitle className="text-3xl font-bold font-headline">Panel Administrativo</CardTitle>
            <CardDescription>Control global del hospital y sus servicios.</CardDescription>
          </div>
          <Button variant="outline" onClick={onLogout}><LogOut className="mr-2 h-4 w-4" /> Salir</Button>
        </CardHeader>
      </Card>
      
      <Tabs value={mainTab} onValueChange={setMainTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 h-auto mb-8 bg-muted/20 p-1">
          <TabsTrigger value="configuracion" className="py-3 font-bold flex items-center gap-2"><Settings className="h-4 w-4" /> 1. Configuración</TabsTrigger>
          <TabsTrigger value="catalogos" className="py-3 font-bold flex items-center gap-2"><UserRound className="h-4 w-4" /> 2. Catálogos</TabsTrigger>
          <TabsTrigger value="citas" className="py-3 font-bold flex items-center gap-2"><ClipboardList className="h-4 w-4" /> 3. Registro de Citas</TabsTrigger>
          <TabsTrigger value="modulos" className="py-3 font-bold flex items-center gap-2 text-primary"><LayoutGrid className="h-4 w-4" /> 4. Módulos</TabsTrigger>
        </TabsList>
        <TabsContent value="configuracion" className="space-y-8 animate-in fade-in">
            <div className="grid lg:grid-cols-2 gap-8">
                <ClinicsManager />
                <div className="space-y-8">
                    <Card className="bg-destructive/5 border-destructive/20 shadow-lg">
                        <CardHeader>
                            <CardTitle className="text-sm font-black uppercase text-destructive flex items-center gap-2">
                                <ShieldAlert className="h-5 w-5" /> Herramientas Especiales
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Button asChild variant="destructive" className="w-full font-black uppercase">
                                <Link href="/admin/duplicates">
                                    Mantenimiento y Duplicados
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>
                    <AnnouncementsManager />
                    <BackupManager onRestoreSuccess={() => window.location.reload()} />
                    <HolidaysManager />
                    <SpecialActionDaysManager />
                </div>
            </div>
            <ActivityLogViewer />
        </TabsContent>
        <TabsContent value="catalogos" className="animate-in fade-in space-y-8">
            <Tabs defaultValue="service-types" className="w-full">
                <TabsList className="flex flex-wrap w-fit gap-2 bg-transparent mb-6 border-b rounded-none pb-px h-auto">
                    <TabsTrigger value="service-types" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-6 py-3 font-bold">Servicios</TabsTrigger>
                    <TabsTrigger value="specialties" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-6 py-3 font-bold">Especialidades</TabsTrigger>
                    <TabsTrigger value="colonias" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-6 py-3 font-bold">Localidades</TabsTrigger>
                    <TabsTrigger value="medicos" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-6 py-3 font-bold">Médicos</TabsTrigger>
                </TabsList>
                <TabsContent value="service-types"><ServiceTypesManager /></TabsContent>
                <TabsContent value="specialties"><SpecialtiesManager /></TabsContent>
                <TabsContent value="colonias"><ColoniasManager /></TabsContent>
                <TabsContent value="medicos"><DoctorsCatalog /></TabsContent>
            </Tabs>
        </TabsContent>
        <TabsContent value="citas" className="animate-in fade-in">
            <AppointmentsViewer />
        </TabsContent>
        <TabsContent value="modulos" className="animate-in fade-in space-y-8">
            <div className="grid lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 space-y-8">
                    <ModuleSecurityManager />
                </div>
                <div className="lg:col-span-4 space-y-8">
                    <AdminPasswordManager />
                    <ModuleManager />
                </div>
            </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

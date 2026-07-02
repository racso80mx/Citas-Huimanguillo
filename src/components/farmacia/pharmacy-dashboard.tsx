'use client';

import { useState, useEffect, useTransition, useMemo } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Upload, 
  Loader2, 
  Search, 
  Trash2, 
  ArrowUp, 
  ArrowDown, 
  Pill,
  LogOut,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  CalendarClock,
  X
} from 'lucide-react';
import { getMedications, bulkInsertMedications, deleteAllMedications } from '@/lib/actions';
import type { Medication } from '@/lib/definitions';
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
import { Badge } from '@/components/ui/badge';
import { differenceInMonths, parse, isValid, isDate } from 'date-fns';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PrescriptionDispenser } from './prescription-dispenser';

type ExpirationStatus = 'red' | 'yellow' | 'green' | 'unknown';

export function PharmacyDashboard({ onLogout }: { onLogout?: () => void }) {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, startUploadTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [progress, setProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState({ processed: 0, total: 0, message: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ExpirationStatus | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: keyof Medication; direction: 'asc' | 'desc' } | null>(null);

  const { toast } = useToast();

  const loadMedications = async () => {
    setIsLoading(true);
    try {
      const data = await getMedications();
      setMedications(data);
    } catch (e) {
      toast({ title: 'Error al cargar inventario', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMedications();
  }, []);

  const getExpirationStatus = (dateStr: string): ExpirationStatus => {
    if (!dateStr || dateStr.toUpperCase() === 'SIN FECHA' || dateStr.trim() === '') return 'unknown';
    
    let expiryDate: Date | null = null;
    if (dateStr.includes('/')) {
        expiryDate = parse(dateStr, 'dd/MM/yyyy', new Date());
    } else if (dateStr.includes('-')) {
        expiryDate = new Date(dateStr);
    } else {
        expiryDate = new Date(dateStr);
    }

    if (!expiryDate || !isValid(expiryDate)) return 'unknown';

    const now = new Date();
    const monthsUntilExpiry = differenceInMonths(expiryDate, now);

    if (monthsUntilExpiry < 6) return 'red';
    if (monthsUntilExpiry < 12) return 'yellow';
    return 'green';
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    startUploadTransition(async () => {
      setProgress(0);
      setUploadStatus({ processed: 0, total: 0, message: 'Procesando archivo...' });

      try {
        const xlsx = await import('xlsx');
        const buffer = await file.arrayBuffer();
        const workbook = xlsx.read(buffer, { cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = xlsx.utils.sheet_to_json(sheet);

        if (json.length === 0) {
          toast({ title: 'El archivo está vacío', variant: 'destructive' });
          return;
        }

        const totalRecords = json.length;
        setUploadStatus({ processed: 0, total: totalRecords, message: 'Sincronizando con BD...' });

        const result = await bulkInsertMedications(JSON.parse(JSON.stringify(json)));

        if (result.success) {
            toast({ title: 'Carga Completada', description: `${result.processedCount} registros actualizados.` });
            loadMedications();
        } else {
            throw new Error(result.message);
        }
      } catch (error: any) {
        toast({ title: 'Error al procesar Excel', description: error.message, variant: 'destructive' });
      } finally {
        setUploadStatus({ processed: 0, total: 0, message: '' });
        setProgress(0);
        if (event.target) event.target.value = '';
      }
    });
  };

  const handleDeleteAll = () => {
    startDeleteTransition(async () => {
      const res = await deleteAllMedications();
      if (res.success) {
        toast({ title: 'Inventario vaciado' });
        setMedications([]);
        loadMedications();
      }
    });
  };

  const stats = useMemo(() => {
    const counts = { red: 0, yellow: 0, green: 0, total: medications.length };
    medications.forEach(m => {
        const status = getExpirationStatus(m.fechaCaducidad);
        if (status === 'red') counts.red++;
        else if (status === 'yellow') counts.yellow++;
        else if (status === 'green') counts.green++;
    });
    return counts;
  }, [medications]);

  const filtered = useMemo(() => {
    let result = [...medications];

    if (statusFilter) {
      result = result.filter(m => getExpirationStatus(m.fechaCaducidad) === statusFilter);
    }

    if (searchTerm) {
      const term = searchTerm.toUpperCase();
      result = result.filter(m => 
        m.descripcion.includes(term) || 
        m.claveCuadroBasico.includes(term) ||
        m.lote.includes(term)
      );
    }

    if (sortConfig) {
      result.sort((a, b) => {
        const valA = a[sortConfig.key];
        const valB = b[sortConfig.key];
        if (valA === valB) return 0;
        if (valA === undefined) return 1;
        if (valB === undefined) return -1;
        return sortConfig.direction === 'asc' ? (valA < valB ? -1 : 1) : (valA > valB ? -1 : 1);
      });
    }

    return result;
  }, [medications, searchTerm, statusFilter, sortConfig]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <div>
            <h1 className="text-3xl font-bold font-headline flex items-center gap-2">
                <Pill className="h-8 w-8 text-primary" /> Gestión de Farmacia
            </h1>
            <p className="text-muted-foreground">Inventario hospitalario con semaforización de caducidad.</p>
        </div>
        <div className="flex items-center gap-2">
            <Button variant="outline" onClick={loadMedications} disabled={isLoading}>
                <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
            </Button>
            {onLogout && (
                <Button variant="outline" onClick={onLogout}>
                    <LogOut className="mr-2 h-4 w-4" /> Salir
                </Button>
            )}
        </div>
      </div>

      <Tabs defaultValue="inventario" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md h-auto p-1 bg-muted/20">
            <TabsTrigger value="inventario" className="py-2.5 font-bold">Control de Inventario</TabsTrigger>
            <TabsTrigger value="recetas" className="py-2.5 font-bold">Surtir Recetas</TabsTrigger>
        </TabsList>

        <TabsContent value="inventario" className="space-y-6 mt-6 animate-in fade-in duration-300">
            <div className="grid md:grid-cols-3 gap-6">
                <Card className="md:col-span-1 shadow-sm border-primary/10">
                    <CardHeader>
                        <CardTitle className="text-lg">Cargar Medicamentos</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>Archivo Excel (.xlsx)</Label>
                            <Input type="file" accept=".xlsx" onChange={handleFileUpload} disabled={isUploading} />
                        </div>
                        {isUploading && <Progress value={100} className="h-2 animate-pulse" />}
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm" className="w-full h-11 font-bold" disabled={isDeleting || medications.length === 0}>
                                <Trash2 className="h-4 w-4 mr-2" /> Vaciar Farmacia
                            </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>¿Confirmar acción?</AlertDialogTitle>
                                <AlertDialogDescription>Se eliminarán permanentemente todos los registros actuales de Farmacia.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={handleDeleteAll} className="bg-destructive hover:bg-destructive/90">SÍ, VACIAR TODO</AlertDialogAction>
                            </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </CardContent>
                </Card>

                <Card className="md:col-span-2 shadow-sm border-primary/10">
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2"><CalendarClock className="h-5 w-5 text-primary" /> Semáforo de Caducidades</CardTitle>
                    <CardDescription>Haz clic en las categorías para filtrar la tabla inferior.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <button 
                        onClick={() => setStatusFilter(statusFilter === 'red' ? null : 'red')}
                        className={cn(
                            "bg-red-50 border p-4 rounded-xl text-center transition-all",
                            statusFilter === 'red' ? "border-red-500 ring-2 ring-red-200 shadow-md scale-105" : "border-red-100 opacity-70 hover:opacity-100"
                        )}
                    >
                        <div className="text-[10px] text-red-600 uppercase font-black mb-1">Crítico (&lt; 6m)</div>
                        <div className="text-3xl font-black text-red-700">{stats.red}</div>
                        <div className="text-[10px] text-red-500 mt-1 flex items-center justify-center gap-1"><AlertTriangle className="h-3 w-3"/> Ver lista</div>
                    </button>
                    <button 
                        onClick={() => setStatusFilter(statusFilter === 'yellow' ? null : 'yellow')}
                        className={cn(
                            "bg-yellow-50 border p-4 rounded-xl text-center transition-all",
                            statusFilter === 'yellow' ? "border-yellow-500 ring-2 ring-yellow-200 shadow-md scale-105" : "border-yellow-100 opacity-70 hover:opacity-100"
                        )}
                    >
                        <div className="text-[10px] text-yellow-600 uppercase font-black mb-1">Preventivo (6m-1a)</div>
                        <div className="text-3xl font-black text-yellow-700">{stats.yellow}</div>
                        <div className="text-[10px] text-yellow-500 mt-1 flex items-center justify-center gap-1"><CalendarClock className="h-3 w-3"/> Ver lista</div>
                    </button>
                    <button 
                        onClick={() => setStatusFilter(statusFilter === 'green' ? null : 'green')}
                        className={cn(
                            "bg-green-50 border p-4 rounded-xl text-center transition-all",
                            statusFilter === 'green' ? "border-green-500 ring-2 ring-green-200 shadow-md scale-105" : "border-green-100 opacity-70 hover:opacity-100"
                        )}
                    >
                        <div className="text-[10px] text-green-600 uppercase font-black mb-1">Óptimo (&gt; 1a)</div>
                        <div className="text-3xl font-black text-green-700">{stats.green}</div>
                        <div className="text-[10px] text-green-500 mt-1 flex items-center justify-center gap-1"><CheckCircle2 className="h-3 w-3"/> Ver lista</div>
                    </button>
                    <button 
                        onClick={() => setStatusFilter(null)}
                        className={cn(
                            "bg-muted/30 border p-4 rounded-xl text-center transition-all",
                            !statusFilter ? "border-primary ring-2 ring-primary/10 shadow-md scale-105" : "border-transparent opacity-70 hover:opacity-100"
                        )}
                    >
                        <div className="text-[10px] text-muted-foreground uppercase font-black mb-1">Total Registros</div>
                        <div className="text-3xl font-black">{stats.total}</div>
                        <div className="text-[10px] text-muted-foreground mt-1">Ver todos</div>
                    </button>
                    </div>
                </CardContent>
                </Card>
            </div>

            <Card className="shadow-md border-primary/10">
                <CardHeader className="pb-3 border-b bg-muted/10">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <CardTitle>Listado de Medicamentos</CardTitle>
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                        <div className="relative w-full sm:w-96">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Escribe para buscar..." className="pl-9 h-11" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        </div>
                        {statusFilter && (
                            <Badge variant="secondary" className="h-11 px-4 gap-2 text-sm font-bold border-primary/20 bg-primary/5 text-primary">
                                Filtro Activo <X className="h-4 w-4 cursor-pointer" onClick={() => setStatusFilter(null)} />
                            </Badge>
                        )}
                    </div>
                </div>
                </CardHeader>
                <CardContent className="p-0">
                {isLoading ? (
                    <div className="flex justify-center py-40"><Loader2 className="animate-spin h-10 w-10 text-primary" /></div>
                ) : (
                    <div className="overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-muted/50">
                        <TableRow>
                            <TableHead className="font-black text-[10px] uppercase">Clave</TableHead>
                            <TableHead className="font-black text-[10px] uppercase">Descripción</TableHead>
                            <TableHead className="text-right font-black text-[10px] uppercase">Existencia</TableHead>
                            <TableHead className="font-black text-[10px] uppercase">Caducidad</TableHead>
                            <TableHead className="font-black text-[10px] uppercase">Lote</TableHead>
                        </TableRow>
                        </TableHeader>
                        <TableBody>
                        {filtered.length > 0 ? (
                            filtered.slice(0, 500).map((item) => {
                            const expiryStatus = getExpirationStatus(item.fechaCaducidad);
                            return (
                                <TableRow key={item.id} className="hover:bg-muted/50">
                                <TableCell className="font-mono text-[11px] font-bold">{item.claveCuadroBasico}</TableCell>
                                <TableCell className="text-[11px] font-medium uppercase leading-tight">{item.descripcion}</TableCell>
                                <TableCell className="text-right">
                                    <Badge variant={item.existencia > 0 ? 'secondary' : 'destructive'} className="font-black">{item.existencia}</Badge>
                                </TableCell>
                                <TableCell>
                                    <Badge 
                                        variant="outline"
                                        className={cn(
                                            "font-black text-[10px] px-3 uppercase tracking-tighter border-2",
                                            expiryStatus === 'red' && "bg-red-50 text-red-700 border-red-200",
                                            expiryStatus === 'yellow' && "bg-yellow-50 text-yellow-700 border-yellow-200",
                                            expiryStatus === 'green' && "bg-green-50 text-green-700 border-green-200",
                                            expiryStatus === 'unknown' && "bg-gray-100 text-gray-500"
                                        )}
                                    >
                                    {item.fechaCaducidad || 'SIN FECHA'}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-[10px] font-mono font-bold text-primary">{item.lote}</TableCell>
                                </TableRow>
                            );
                            })
                        ) : (
                            <TableRow><TableCell colSpan={5} className="text-center py-20 italic">No se encontraron registros coincidentes.</TableCell></TableRow>
                        )}
                        </TableBody>
                    </Table>
                    {filtered.length > 500 && (
                        <div className="p-4 text-center text-xs text-muted-foreground border-t italic">
                            Mostrando primeros 500 de {filtered.length} registros. Usa el buscador para filtrar más resultados.
                        </div>
                    )}
                    </div>
                )}
                </CardContent>
            </Card>
        </TabsContent>

        <TabsContent value="recetas" className="mt-6 animate-in fade-in duration-300">
            <PrescriptionDispenser />
        </TabsContent>
      </Tabs>
    </div>
  );
}

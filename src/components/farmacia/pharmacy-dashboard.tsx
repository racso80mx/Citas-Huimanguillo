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
  X,
  Filter
} from 'lucide-react';
import { getMedications, bulkInsertMedications, deleteMedicationsBySource } from '@/lib/actions';
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
import { differenceInMonths, isValid, parse, isDate } from 'date-fns';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PrescriptionDispenser } from './prescription-dispenser';
import { VoucherForm } from './voucher-form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type ExpirationStatus = 'red' | 'yellow' | 'green' | 'unknown';

export function PharmacyDashboard({ onLogout }: { onLogout?: () => void }) {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, startUploadTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [progress, setProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState({ processed: 0, total: 0, message: '' });
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filtros
  const [statusFilter, setStatusFilter] = useState<ExpirationStatus | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  
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
    
    try {
        if (dateStr.includes('/')) expiryDate = parse(dateStr, 'dd/MM/yyyy', new Date());
        else if (dateStr.includes('-')) expiryDate = new Date(dateStr);
        else expiryDate = new Date(dateStr);
    } catch (e) {
        return 'unknown';
    }

    if (!expiryDate || !isValid(expiryDate)) return 'unknown';
    const now = new Date();
    const months = differenceInMonths(expiryDate, now);
    if (months < 6) return 'red';
    if (months < 12) return 'yellow';
    return 'green';
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>, source: 'IMSS-BIENESTAR' | 'EXTERNO') => {
    const file = event.target.files?.[0];
    if (!file) return;

    startUploadTransition(async () => {
      setProgress(0);
      setUploadStatus({ processed: 0, total: 0, message: 'Analizando archivo...' });

      try {
        const xlsx = await import('xlsx');
        const buffer = await file.arrayBuffer();
        const workbook = xlsx.read(buffer, { cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = xlsx.utils.sheet_to_json(sheet);

        if (json.length === 0) {
          toast({ title: 'Archivo vacío', variant: 'destructive' });
          return;
        }

        const totalRecords = json.length;
        setUploadStatus({ processed: 0, total: totalRecords, message: `Cargando fuente: ${source}...` });

        const CHUNK_SIZE = 400;
        let processedCount = 0;

        for (let i = 0; i < totalRecords; i += CHUNK_SIZE) {
          const chunk = json.slice(i, i + CHUNK_SIZE);
          const result = await bulkInsertMedications(JSON.parse(JSON.stringify(chunk)), source);
          if (result.success) {
            processedCount += result.processedCount || 0;
            setProgress(Math.round((processedCount / totalRecords) * 100));
            setUploadStatus({ processed: processedCount, total: totalRecords, message: `Procesando: ${processedCount} de ${totalRecords}...` });
          } else {
            throw new Error(result.message);
          }
        }

        toast({ title: `Inventario ${source} actualizado con éxito` });
        loadMedications();
      } catch (error: any) {
        toast({ title: 'Error en la carga', description: error.message, variant: 'destructive' });
      } finally {
        setUploadStatus({ processed: 0, total: 0, message: '' });
        setProgress(0);
        if (event.target) event.target.value = '';
      }
    });
  };

  const handleDeleteBySource = (source: 'IMSS-BIENESTAR' | 'EXTERNO') => {
      startDeleteTransition(async () => {
          const res = await deleteMedicationsBySource(source);
          if (res.success) {
              toast({ title: `Inventario ${source} eliminado` });
              setMedications([]); // Clear locally first
              await loadMedications(); // Then refetch
          } else {
              toast({ title: 'Error al eliminar', variant: 'destructive' });
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
    
    // Filtro por Fuente
    if (sourceFilter !== 'all') {
        result = result.filter(m => {
            const f = String(m.fuenteFinanciamiento || '').toUpperCase();
            return f === sourceFilter.toUpperCase();
        });
    }

    // Filtro por Caducidad
    if (statusFilter) {
        result = result.filter(m => getExpirationStatus(m.fechaCaducidad) === statusFilter);
    }
    
    // Filtro por Búsqueda
    if (searchTerm) {
      const term = searchTerm.toUpperCase();
      result = result.filter(m => 
        (m.descripcion || '').includes(term) || 
        (m.claveCuadroBasico || '').includes(term) || 
        (m.lote || '').includes(term)
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
  }, [medications, searchTerm, sourceFilter, statusFilter, sortConfig]);

  const handleSort = (key: keyof Medication) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <div>
            <h1 className="text-3xl font-bold font-headline flex items-center gap-2 text-primary">
                <Pill className="h-8 w-8" /> Gestión de Farmacia
            </h1>
            <p className="text-muted-foreground font-medium">Control unificado de fuentes: IMSS-BIENESTAR y EXTERNO.</p>
        </div>
        <div className="flex items-center gap-2">
            <Button variant="outline" onClick={loadMedications} disabled={isLoading}>
                <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
            </Button>
            {onLogout && (
                <Button variant="outline" onClick={onLogout}><LogOut className="mr-2 h-4 w-4" /> Salir</Button>
            )}
        </div>
      </div>

      <Tabs defaultValue="inventario" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-xl h-auto p-1 bg-muted/20">
            <TabsTrigger value="inventario" className="py-2.5 font-bold">Inventario</TabsTrigger>
            <TabsTrigger value="recetas" className="py-2.5 font-bold">Surtir Recetas</TabsTrigger>
            <TabsTrigger value="vales" className="py-2.5 font-bold">Vales de Salida</TabsTrigger>
        </TabsList>

        <TabsContent value="inventario" className="space-y-6 mt-6 animate-in fade-in duration-300">
            <div className="grid md:grid-cols-12 gap-6">
                <Card className="md:col-span-4 shadow-md border-primary/10">
                    <CardHeader className="pb-3"><CardTitle className="text-lg">Entrada de Medicamentos</CardTitle></CardHeader>
                    <CardContent className="space-y-6">
                        <div className="p-4 border rounded-xl bg-green-50/50 space-y-3">
                            <Label className="text-[10px] font-black uppercase text-green-700">Fuente: IMSS-BIENESTAR</Label>
                            <Input type="file" accept=".xlsx" onChange={(e) => handleFileUpload(e, 'IMSS-BIENESTAR')} disabled={isUploading} className="h-10 bg-white" />
                        </div>
                        <div className="p-4 border rounded-xl bg-blue-50/50 space-y-3">
                            <Label className="text-[10px] font-black uppercase text-blue-700">Fuente: EXTERNA</Label>
                            <Input type="file" accept=".xlsx" onChange={(e) => handleFileUpload(e, 'EXTERNO')} disabled={isUploading} className="h-10 bg-white" />
                        </div>
                        {isUploading && (
                            <div className="space-y-2 pt-2">
                                <div className="flex justify-between text-[10px] font-black uppercase text-primary">
                                    <span>{uploadStatus.message}</span>
                                    <span>{progress}%</span>
                                </div>
                                <Progress value={progress} className="h-2" />
                            </div>
                        )}
                        
                        <div className="grid grid-cols-2 gap-4">
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="w-full text-red-700 hover:bg-red-50 font-black text-[9px] uppercase border" disabled={isDeleting}>
                                    <Trash2 className="h-3 w-3 mr-1" /> Borrar IMSS
                                </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                <AlertDialogHeader><AlertDialogTitle>¿Borrar fuente IMSS-BIENESTAR?</AlertDialogTitle><AlertDialogDescription>Se eliminarán permanentemente los registros de esta fuente de la base de datos.</AlertDialogDescription></AlertDialogHeader>
                                <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteBySource('IMSS-BIENESTAR')} className="bg-destructive hover:bg-destructive/90">SÍ, BORRAR FUENTE</AlertDialogAction></AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>

                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="w-full text-red-700 hover:bg-red-50 font-black text-[9px] uppercase border" disabled={isDeleting}>
                                    <Trash2 className="h-3 w-3 mr-1" /> Borrar Externos
                                </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                <AlertDialogHeader><AlertDialogTitle>¿Borrar fuente EXTERNA?</AlertDialogTitle><AlertDialogDescription>Se eliminarán permanentemente los registros de esta fuente de la base de datos.</AlertDialogDescription></AlertDialogHeader>
                                <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteBySource('EXTERNO')} className="bg-destructive hover:bg-destructive/90">SÍ, BORRAR FUENTE</AlertDialogAction></AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </CardContent>
                </Card>

                <Card className="md:col-span-8 shadow-md border-primary/10">
                <CardHeader className="pb-3"><CardTitle className="text-lg flex items-center gap-2 uppercase font-black"><CalendarClock className="h-5 w-5 text-primary" /> Semáforo de Almacén</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <button onClick={() => setStatusFilter(statusFilter === 'red' ? null : 'red')} className={cn("bg-red-50 border p-4 rounded-xl text-center transition-all", statusFilter === 'red' ? "border-red-500 ring-4 ring-red-200 shadow-md scale-105" : "border-red-100 opacity-70")}>
                            <div className="text-[10px] text-red-600 uppercase font-black mb-1">CRÍTICO (&lt; 6M)</div>
                            <div className="text-3xl font-black text-red-700">{stats.red}</div>
                        </button>
                        <button onClick={() => setStatusFilter(statusFilter === 'yellow' ? null : 'yellow')} className={cn("bg-yellow-50 border p-4 rounded-xl text-center transition-all", statusFilter === 'yellow' ? "border-yellow-500 ring-4 ring-yellow-200 shadow-md scale-105" : "border-yellow-100 opacity-70")}>
                            <div className="text-[10px] text-yellow-600 uppercase font-black mb-1">PRÓXIMO (1 AÑO)</div>
                            <div className="text-3xl font-black text-yellow-700">{stats.yellow}</div>
                        </button>
                        <button onClick={() => setStatusFilter(statusFilter === 'green' ? null : 'green')} className={cn("bg-green-50 border p-4 rounded-xl text-center transition-all", statusFilter === 'green' ? "border-green-500 ring-4 ring-green-200 shadow-md scale-105" : "border-green-100 opacity-70")}>
                            <div className="text-[10px] text-green-600 uppercase font-black mb-1">ÓPTIMO (&gt; 1 AÑO)</div>
                            <div className="text-3xl font-black text-green-700">{stats.green}</div>
                        </button>
                        <button onClick={() => setStatusFilter(null)} className={cn("bg-muted/30 border p-4 rounded-xl text-center transition-all", !statusFilter ? "border-primary ring-4 ring-primary/10 shadow-md scale-105" : "border-transparent opacity-70")}>
                            <div className="text-[10px] text-muted-foreground uppercase font-black mb-1">TOTAL REGISTROS</div>
                            <div className="text-3xl font-black">{stats.total}</div>
                        </button>
                    </div>
                </CardContent>
                </Card>
            </div>

            <Card className="shadow-lg border-primary/10">
                <CardHeader className="pb-3 border-b bg-muted/10">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                    <CardTitle className="uppercase font-black text-sm">Inventario de Medicamentos</CardTitle>
                    <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
                        <div className="space-y-1.5 min-w-[180px]">
                            <Label className="text-[9px] font-black uppercase opacity-60">Filtrar por Fuente</Label>
                            <Select value={sourceFilter} onValueChange={setSourceFilter}>
                                <SelectTrigger className="h-10 bg-background border-primary/20">
                                    <SelectValue placeholder="Todas las fuentes" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">TODAS LAS FUENTES</SelectItem>
                                    <SelectItem value="IMSS-BIENESTAR">IMSS-BIENESTAR</SelectItem>
                                    <SelectItem value="EXTERNO">EXTERNO</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5 flex-1 min-w-[250px]">
                            <Label className="text-[9px] font-black uppercase opacity-60">Búsqueda Rápida</Label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="Clave, Descripción o Lote..." className="pl-9 h-10 border-primary/20 bg-background" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                                {searchTerm && <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
                            </div>
                        </div>
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
                            <TableHead className="font-black text-[10px] uppercase cursor-pointer hover:bg-muted" onClick={() => handleSort('claveCuadroBasico')}>
                                Clave {sortConfig?.key === 'claveCuadroBasico' && (sortConfig.direction === 'asc' ? <ArrowUp className="inline h-3 w-3" /> : <ArrowDown className="inline h-3 w-3" />)}
                            </TableHead>
                            <TableHead className="font-black text-[10px] uppercase cursor-pointer hover:bg-muted" onClick={() => handleSort('descripcion')}>
                                Descripción {sortConfig?.key === 'descripcion' && (sortConfig.direction === 'asc' ? <ArrowUp className="inline h-3 w-3" /> : <ArrowDown className="inline h-3 w-3" />)}
                            </TableHead>
                            <TableHead className="font-black text-[10px] uppercase">Fuente</TableHead>
                            <TableHead className="text-right font-black text-[10px] uppercase cursor-pointer hover:bg-muted" onClick={() => handleSort('existencia')}>
                                Existencia {sortConfig?.key === 'existencia' && (sortConfig.direction === 'asc' ? <ArrowUp className="inline h-3 w-3" /> : <ArrowDown className="inline h-3 w-3" />)}
                            </TableHead>
                            <TableHead className="font-black text-[10px] uppercase cursor-pointer hover:bg-muted" onClick={() => handleSort('fechaCaducidad')}>
                                Caducidad {sortConfig?.key === 'fechaCaducidad' && (sortConfig.direction === 'asc' ? <ArrowUp className="inline h-3 w-3" /> : <ArrowDown className="inline h-3 w-3" />)}
                            </TableHead>
                            <TableHead className="font-black text-[10px] uppercase">Lote</TableHead>
                        </TableRow>
                        </TableHeader>
                        <TableBody>
                        {filtered.length > 0 ? (
                            filtered.slice(0, 500).map((item) => {
                            const status = getExpirationStatus(item.fechaCaducidad);
                            return (
                                <TableRow key={item.id} className="hover:bg-muted/50 transition-colors">
                                <TableCell className="font-mono text-[11px] font-bold text-primary">{item.claveCuadroBasico}</TableCell>
                                <TableCell className="text-[11px] font-black uppercase leading-tight">{item.descripcion}</TableCell>
                                <TableCell>
                                    <Badge variant="outline" className={cn("text-[9px] font-black uppercase", item.fuenteFinanciamiento === 'EXTERNO' ? "border-blue-200 text-blue-700 bg-blue-50" : "border-green-200 text-green-700 bg-green-50")}>
                                        {item.fuenteFinanciamiento || 'IMSS-BIENESTAR'}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                    <Badge variant={item.existencia > 0 ? 'secondary' : 'destructive'} className="font-black text-sm">{item.existencia}</Badge>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="outline" className={cn(
                                        "font-black text-[10px] px-3 uppercase border-2",
                                        status === 'red' && "bg-red-50 text-red-700 border-red-200",
                                        status === 'yellow' && "bg-yellow-50 text-yellow-700 border-yellow-200",
                                        status === 'green' && "bg-green-50 text-green-700 border-green-200"
                                    )}>
                                    {item.fechaCaducidad || 'SIN FECHA'}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-[10px] font-mono font-bold text-muted-foreground">{item.lote}</TableCell>
                                </TableRow>
                            );
                            })
                        ) : (
                            <TableRow><TableCell colSpan={6} className="text-center py-20 italic font-bold text-muted-foreground uppercase">Sin registros coincidentes con los filtros.</TableCell></TableRow>
                        )}
                        </TableBody>
                    </Table>
                    </div>
                )}
                </CardContent>
            </Card>
        </TabsContent>

        <TabsContent value="recetas" className="mt-6 animate-in fade-in duration-300">
            <PrescriptionDispenser />
        </TabsContent>

        <TabsContent value="vales" className="mt-6 animate-in fade-in duration-300">
            <VoucherForm onVoucherCreated={loadMedications} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

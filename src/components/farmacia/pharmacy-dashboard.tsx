
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
  Filter,
  X,
  FileText
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
import { differenceInMonths, parse, isValid } from 'date-fns';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
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
  const [searchFields, setSearchFields] = useState<string[]>(['descripcion', 'claveCuadroBasico']);
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
    if (!dateStr || dateStr.toUpperCase() === 'SIN FECHA' || dateStr.toUpperCase() === 'N/A' || dateStr.trim() === '') return 'unknown';
    
    let expiryDate: Date | null = null;
    
    if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            expiryDate = parse(dateStr, 'dd/MM/yyyy', new Date());
        } else if (parts.length === 2) {
            expiryDate = parse(dateStr, 'MM/yyyy', new Date());
        } else {
            expiryDate = new Date(dateStr);
        }
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
      setUploadStatus({ processed: 0, total: 0, message: 'Leyendo archivo...' });

      try {
        const xlsx = await import('xlsx');
        const buffer = await file.arrayBuffer();
        const workbook = xlsx.read(buffer);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = xlsx.utils.sheet_to_json(sheet);

        if (json.length === 0) {
          toast({ title: 'El archivo está vacío', variant: 'destructive' });
          return;
        }

        const totalRecords = json.length;
        setUploadStatus({ processed: 0, total: totalRecords, message: 'Iniciando carga...' });

        const CHUNK_SIZE = 300;
        let processedCount = 0;

        for (let i = 0; i < totalRecords; i += CHUNK_SIZE) {
          const chunk = json.slice(i, i + CHUNK_SIZE);
          const plainChunk = JSON.parse(JSON.stringify(chunk));
          const result = await bulkInsertMedications(plainChunk);

          if (result.success) {
            processedCount += result.processedCount || 0;
            const currentProgress = Math.round((processedCount / totalRecords) * 100);
            setProgress(currentProgress);
            setUploadStatus({ 
              processed: processedCount, 
              total: totalRecords, 
              message: `Cargando: ${processedCount} de ${totalRecords} registros...` 
            });
          } else {
            toast({ title: 'Error durante la carga', description: result.message, variant: 'destructive' });
            return;
          }
        }

        toast({ title: 'Inventario actualizado con éxito', description: `Se procesaron ${processedCount} registros.` });
        loadMedications();
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

  const handleSort = (key: keyof Medication) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const toggleSearchField = (field: string) => {
    setSearchFields(prev => 
        prev.includes(field) 
            ? (prev.length > 1 ? prev.filter(f => f !== field) : prev) 
            : [...prev, field]
    );
  };

  const stats = useMemo(() => {
    const counts = { red: 0, yellow: 0, green: 0, unknown: 0 };
    medications.forEach(m => {
        const status = getExpirationStatus(m.fechaCaducidad);
        counts[status]++;
    });
    return counts;
  }, [medications]);

  const filteredAndSortedMedications = useMemo(() => {
    let result = [...medications];

    // Status filter (Semáforo)
    if (statusFilter) {
      result = result.filter(m => getExpirationStatus(m.fechaCaducidad) === statusFilter);
    }

    // Text search
    if (searchTerm) {
      const term = searchTerm.toUpperCase();
      result = result.filter(m => {
        return searchFields.some(field => {
            const val = String((m as any)[field] || '').toUpperCase();
            return val.includes(term);
        });
      });
    }

    if (sortConfig) {
      result.sort((a, b) => {
        const valA = a[sortConfig.key];
        const valB = b[sortConfig.key];
        if (valA === valB) return 0;
        if (valA === undefined) return 1;
        if (valB === undefined) return -1;
        return sortConfig.direction === 'asc' 
          ? (valA < valB ? -1 : 1) 
          : (valA > valB ? -1 : 1);
      });
    }

    return result;
  }, [medications, searchTerm, searchFields, statusFilter, sortConfig]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <div>
            <h1 className="text-3xl font-bold font-headline flex items-center gap-2">
                <Pill className="h-8 w-8 text-primary" /> Gestión de Farmacia
            </h1>
            <p className="text-muted-foreground">Control de inventario, alertas de caducidad y surtido de recetas.</p>
        </div>
        <div className="flex items-center gap-2">
            <Button variant="outline" onClick={loadMedications} disabled={isLoading}>
                <RefreshCw className={isLoading ? "animate-spin" : ""} />
            </Button>
            {onLogout && (
                <Button variant="outline" onClick={onLogout}>
                    <LogOut className="mr-2 h-4 w-4" /> Cerrar Sesión
                </Button>
            )}
        </div>
      </div>

      <Tabs defaultValue="inventario" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="inventario">Inventario</TabsTrigger>
            <TabsTrigger value="recetas" className="flex items-center gap-2">
                <FileText className="h-4 w-4" /> Surtir Recetas
            </TabsTrigger>
        </TabsList>

        <TabsContent value="inventario" className="space-y-6 pt-6">
            <div className="grid md:grid-cols-3 gap-6">
                <Card className="md:col-span-1">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg"><Upload className="h-5 w-5" /> Cargar Inventario</CardTitle>
                    <CardDescription>
                    Actualiza el stock mediante archivo Excel.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center gap-2">
                    <Input 
                        type="file" 
                        accept=".xlsx, .xls" 
                        onChange={handleFileUpload} 
                        disabled={isUploading}
                    />
                    </div>
                    {isUploading && (
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs font-medium">
                        <span>{uploadStatus.message}</span>
                        <span>{progress}%</span>
                        </div>
                        <Progress value={progress} className="h-2" />
                    </div>
                    )}
                    <div className="flex gap-2 pt-2">
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm" className="w-full" disabled={isDeleting || medications.length === 0}>
                            <Trash2 className="h-4 w-4 mr-2" /> Vaciar Inventario
                        </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>¿Vaciar todo el inventario?</AlertDialogTitle>
                            <AlertDialogDescription>
                            Esta acción eliminará todos los registros actuales. No se puede deshacer.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDeleteAll} className="bg-destructive hover:bg-destructive/90">
                            Sí, vaciar todo
                            </AlertDialogAction>
                        </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                    </div>
                </CardContent>
                </Card>

                <Card className="md:col-span-2">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg"><CalendarClock className="h-5 w-5" /> Semáforo de Caducidades</CardTitle>
                    <CardDescription>Haz clic en una alerta para filtrar la lista automáticamente.</CardDescription>
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
                        <div className="text-[10px] text-red-600 uppercase font-black mb-1">CRÍTICO (&lt; 6 meses)</div>
                        <div className="text-3xl font-black text-red-700">{stats.red}</div>
                        <div className="text-[10px] text-red-500 mt-1 flex items-center justify-center gap-1"><AlertTriangle className="h-3 w-3"/> Ver Lista</div>
                    </button>
                    <button 
                        onClick={() => setStatusFilter(statusFilter === 'yellow' ? null : 'yellow')}
                        className={cn(
                            "bg-yellow-50 border p-4 rounded-xl text-center transition-all",
                            statusFilter === 'yellow' ? "border-yellow-500 ring-2 ring-yellow-200 shadow-md scale-105" : "border-yellow-100 opacity-70 hover:opacity-100"
                        )}
                    >
                        <div className="text-[10px] text-yellow-600 uppercase font-black mb-1">PREVENTIVO (6m - 1a)</div>
                        <div className="text-3xl font-black text-yellow-700">{stats.yellow}</div>
                        <div className="text-[10px] text-yellow-500 mt-1 flex items-center justify-center gap-1"><CalendarClock className="h-3 w-3"/> Ver Lista</div>
                    </button>
                    <button 
                        onClick={() => setStatusFilter(statusFilter === 'green' ? null : 'green')}
                        className={cn(
                            "bg-green-50 border p-4 rounded-xl text-center transition-all",
                            statusFilter === 'green' ? "border-green-500 ring-2 ring-green-200 shadow-md scale-105" : "border-green-100 opacity-70 hover:opacity-100"
                        )}
                    >
                        <div className="text-[10px] text-green-600 uppercase font-black mb-1">SEGURO (&gt; 1 año)</div>
                        <div className="text-3xl font-black text-green-700">{stats.green}</div>
                        <div className="text-[10px] text-green-500 mt-1 flex items-center justify-center gap-1"><CheckCircle2 className="h-3 w-3"/> Ver Lista</div>
                    </button>
                    <button 
                        onClick={() => setStatusFilter(null)}
                        className={cn(
                            "bg-muted/30 border p-4 rounded-xl text-center transition-all",
                            !statusFilter ? "border-primary ring-2 ring-primary/10 shadow-md scale-105" : "border-transparent opacity-70 hover:opacity-100"
                        )}
                    >
                        <div className="text-[10px] text-muted-foreground uppercase font-black mb-1">Total Registros</div>
                        <div className="text-3xl font-black">{medications.length}</div>
                        <div className="text-[10px] text-muted-foreground mt-1">Ver Todos</div>
                    </button>
                    </div>
                </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="pb-3 border-b bg-muted/10">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <CardTitle>Inventario de Medicamentos</CardTitle>
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                        <div className="relative w-full sm:w-96">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input 
                                placeholder="Escribe para buscar..." 
                                className="pl-9 h-11"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="h-11 gap-2">
                                    <Filter className="h-4 w-4" /> 
                                    Campos: {searchFields.length === 3 ? 'Todos' : searchFields.length}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuLabel>Buscar en:</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuCheckboxItem checked={searchFields.includes('claveCuadroBasico')} onCheckedChange={() => toggleSearchField('claveCuadroBasico')}>
                                    Clave de Cuadro Básico
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem checked={searchFields.includes('descripcion')} onCheckedChange={() => toggleSearchField('descripcion')}>
                                    Descripción
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem checked={searchFields.includes('lote')} onCheckedChange={() => toggleSearchField('lote')}>
                                    Lote
                                </DropdownMenuCheckboxItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        {statusFilter && (
                            <Badge variant="secondary" className="h-11 px-4 gap-2 text-sm font-bold animate-in zoom-in">
                                Filtro Activo
                                <X className="h-4 w-4 cursor-pointer hover:text-destructive" onClick={() => setStatusFilter(null)} />
                            </Badge>
                        )}
                    </div>
                </div>
                </CardHeader>
                <CardContent className="p-0">
                {isLoading ? (
                    <div className="flex justify-center py-20">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                        <TableRow>
                            <TableHead onClick={() => handleSort('claveCuadroBasico')} className="cursor-pointer hover:bg-accent whitespace-nowrap">
                            Clave {sortConfig?.key === 'claveCuadroBasico' && (sortConfig.direction === 'asc' ? <ArrowUp className="inline h-3 w-3" /> : <ArrowDown className="inline h-3 w-3" />)}
                            </TableHead>
                            <TableHead onClick={() => handleSort('descripcion')} className="cursor-pointer hover:bg-accent">
                            Descripción {sortConfig?.key === 'descripcion' && (sortConfig.direction === 'asc' ? <ArrowUp className="inline h-3 w-3" /> : <ArrowDown className="inline h-3 w-3" />)}
                            </TableHead>
                            <TableHead onClick={() => handleSort('existencia')} className="cursor-pointer hover:bg-accent text-right">
                            Stock {sortConfig?.key === 'existencia' && (sortConfig.direction === 'asc' ? <ArrowUp className="inline h-3 w-3" /> : <ArrowDown className="inline h-3 w-3" />)}
                            </TableHead>
                            <TableHead onClick={() => handleSort('fechaCaducidad')} className="cursor-pointer hover:bg-accent">
                            Caducidad {sortConfig?.key === 'fechaCaducidad' && (sortConfig.direction === 'asc' ? <ArrowUp className="inline h-3 w-3" /> : <ArrowDown className="inline h-3 w-3" />)}
                            </TableHead>
                            <TableHead>Lote</TableHead>
                        </TableRow>
                        </TableHeader>
                        <TableBody>
                        {filteredAndSortedMedications.length > 0 ? (
                            filteredAndSortedMedications.slice(0, 300).map((med) => {
                            const expiryStatus = getExpirationStatus(med.fechaCaducidad);
                            return (
                                <TableRow key={med.id} className="hover:bg-muted/50">
                                <TableCell className="font-mono text-[11px] font-bold">{med.claveCuadroBasico}</TableCell>
                                <TableCell className="text-[11px] max-w-xs">{med.descripcion}</TableCell>
                                <TableCell className={`text-right font-black text-sm ${med.existencia <= 0 ? 'text-red-600' : 'text-foreground'}`}>
                                    {med.existencia}
                                </TableCell>
                                <TableCell>
                                    <Badge 
                                        variant="outline"
                                        className={cn(
                                            "font-bold text-[10px] px-2 py-0",
                                            expiryStatus === 'red' && "bg-red-100 text-red-700 border-red-200",
                                            expiryStatus === 'yellow' && "bg-yellow-100 text-yellow-700 border-yellow-200",
                                            expiryStatus === 'green' && "bg-green-100 text-green-700 border-green-200",
                                            expiryStatus === 'unknown' && "bg-gray-100 text-gray-600"
                                        )}
                                    >
                                    {med.fechaCaducidad || 'SIN FECHA'}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-[10px] font-mono">{med.lote}</TableCell>
                                </TableRow>
                            );
                            })
                        ) : (
                            <TableRow>
                            <TableCell colSpan={5} className="text-center py-20 text-muted-foreground">
                                No se encontraron registros que coincidan con los filtros.
                            </TableCell>
                            </TableRow>
                        )}
                        </TableBody>
                    </Table>
                    {filteredAndSortedMedications.length > 300 && (
                        <div className="p-4 text-center text-xs text-muted-foreground bg-muted/20 border-t font-medium italic">
                        Mostrando los primeros 300 resultados de {filteredAndSortedMedications.length}.
                        </div>
                    )}
                    </div>
                )}
                </CardContent>
            </Card>
        </TabsContent>

        <TabsContent value="recetas" className="pt-6">
            <PrescriptionDispenser />
        </TabsContent>
      </Tabs>
    </div>
  );
}

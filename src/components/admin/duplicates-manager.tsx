
'use client';
import React, { useState, useTransition, useMemo } from 'react';
import type { Patient } from '@/lib/definitions';
import { PatientStatus } from '@/lib/definitions';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Trash2, Loader2, Info, RefreshCcw, UserMinus, Search, CheckCircle2, XCircle, FileDigit, Wrench, UserRound } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { deletePatients, applyStatusUpdateChunk, scanDuplicates, normalizeExpedientesAction, rebuildNombreCompletoAction } from '@/lib/actions';
import { cn } from '@/lib/utils';
import { Progress } from '../ui/progress';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

type DuplicateGroupProps = {
    group: Patient[];
    onSelectionChange: (id: string, isSelected: boolean) => void;
    selectedIds: string[];
};

const DuplicateGroup = ({ group, onSelectionChange, selectedIds }: DuplicateGroupProps) => {
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="w-[50px]">Sel.</TableHead>
                    <TableHead>Nombre Completo</TableHead>
                    <TableHead>No. Expediente</TableHead>
                    <TableHead>CURP</TableHead>
                    <TableHead>Teléfono</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {group.map(patient => (
                    <TableRow key={patient.id} className={cn(selectedIds.includes(patient.id) && 'bg-muted/50')}>
                        <TableCell>
                            <Checkbox 
                                onCheckedChange={(checked) => onSelectionChange(patient.id, !!checked)}
                                checked={selectedIds.includes(patient.id)}
                            />
                        </TableCell>
                        <TableCell className="font-medium">{`${patient.name} ${patient.paternalLastName} ${patient.maternalLastName}`}</TableCell>
                        <TableCell>{patient.expediente || 'N/A'}</TableCell>
                        <TableCell>{patient.curp || 'N/A'}</TableCell>
                        <TableCell>{patient.phoneNumber || 'N/A'}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
};

export function DuplicatesManager() {
    const [activeTab, setActiveTab] = useState('expediente');
    const [duplicates, setDuplicates] = useState<Patient[][]>([]);
    const [selectedPatientIds, setSelectedPatientIds] = useState<string[]>([]);
    const [isScanning, startScanTransition] = useTransition();
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [statusLog, setStatusLog] = useState("");
    
    const { toast } = useToast();
    
    // Lista de expedientes para baja masiva
    const statusUpdateExpedientes = useMemo(() => [
        "25115", "25858", "22", "197", "217", "634", "690", "873", "910", "1043", "1089", "1395", "1699", "1913", "1985", "2328"
    ], []);

    const handleSelectionChange = (id: string, isSelected: boolean) => {
        setSelectedPatientIds(prev => {
            const newSet = new Set(prev);
            if (isSelected) newSet.add(id); else newSet.delete(id);
            return Array.from(newSet);
        });
    };

    const handleScan = (criteria: 'expediente' | 'curp' | 'name') => {
        startScanTransition(async () => {
            try {
                const res = await scanDuplicates(criteria);
                setDuplicates(res);
                setSelectedPatientIds([]);
                if (res.length === 0) toast({ title: "Sin duplicados", description: "No se encontraron duplicados con este criterio." });
            } catch (e) {
                toast({ title: "Error", description: "Fallo al escanear duplicados.", variant: "destructive" });
            }
        });
    };

    const handleNormalizeExpedientes = () => {
        setIsProcessing(true);
        startScanTransition(async () => {
            try {
                const res = await normalizeExpedientesAction();
                if (res.success) {
                    toast({ 
                        title: "Normalización Completada", 
                        description: `Se actualizaron ${res.count} registros con el formato correcto.` 
                    });
                }
            } catch (e) {
                toast({ title: "Error", description: "Hubo un problema al procesar los expedientes.", variant: "destructive" });
            } finally {
                setIsProcessing(false);
            }
        });
    };

    const handleRebuildNombres = () => {
        setIsProcessing(true);
        startScanTransition(async () => {
            try {
                const res = await rebuildNombreCompletoAction();
                if (res.success) {
                    toast({ 
                        title: "Reconstrucción Finalizada", 
                        description: `Se han actualizado ${res.count} pacientes con su campo de nombre completo normalizado.` 
                    });
                }
            } catch (e) {
                toast({ title: "Error", description: "No se pudo completar la reconstrucción.", variant: "destructive" });
            } finally {
                setIsProcessing(false);
            }
        });
    };

    const handleDeleteSelected = () => {
        if (selectedPatientIds.length === 0) return;
        setIsProcessing(true);
        startScanTransition(async () => {
            const res = await deletePatients(selectedPatientIds);
            if(res.success) {
                toast({ title: "Limpieza Completada" });
                setDuplicates([]);
                setSelectedPatientIds([]);
            }
            setIsProcessing(false);
        });
    };

    const handleApplyBulkStatusUpdate = async () => {
        setIsProcessing(true);
        setProgress(0);
        
        const total = statusUpdateExpedientes.length;
        // Ajuste senior: Reducimos el chunkSize a 30 para respetar el límite estricto de Firestore 'IN'
        const chunkSize = 30; 
        let accumulatedFound = 0;

        try {
            for (let i = 0; i < total; i += chunkSize) {
                const chunk = statusUpdateExpedientes.slice(i, i + chunkSize);
                setStatusLog(`Procesando lote ${Math.floor(i / chunkSize) + 1}...`);
                
                const res = await applyStatusUpdateChunk(chunk, PatientStatus.Baja);
                
                accumulatedFound += res.count || 0;
                const currentProcessed = Math.min(i + chunkSize, total);
                setProgress(Math.round((currentProcessed / total) * 100));
            }
            toast({ 
                title: "Actualización Finalizada", 
                description: `Se actualizaron ${accumulatedFound} registros.` 
            });
        } catch (e) {
            toast({ title: "Error", description: "El proceso se detuvo por un error de base de datos.", variant: "destructive" });
        } finally {
            setIsProcessing(false);
            setStatusLog("");
        }
    }
    
    return (
        <div className="space-y-6">
             <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Modo de Mantenimiento</AlertTitle>
                <AlertDescription>
                    Herramientas masivas para la optimización de la base de datos y corrección de formatos.
                </AlertDescription>
            </Alert>

            {isProcessing && (
                <Card className="border-primary shadow-lg animate-in fade-in slide-in-from-top-4">
                    <CardContent className="pt-6 space-y-4">
                        <div className="flex justify-between items-center text-sm font-medium">
                            <span className="flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                {statusLog || "Ejecutando proceso masivo..."}
                            </span>
                            <span className="text-primary font-bold">{progress}%</span>
                        </div>
                        <Progress value={progress} className="h-3" />
                    </CardContent>
                </Card>
            )}
            
            <Tabs defaultValue="expediente" value={activeTab} onValueChange={setActiveTab}>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                    <TabsList className="grid grid-cols-5 w-full sm:w-auto">
                        <TabsTrigger value="expediente">Expediente</TabsTrigger>
                        <TabsTrigger value="curp">CURP</TabsTrigger>
                        <TabsTrigger value="name">Nombre</TabsTrigger>
                        <TabsTrigger value="status">Estatus</TabsTrigger>
                        <TabsTrigger value="tools">Herramientas</TabsTrigger>
                    </TabsList>

                    {activeTab !== 'status' && activeTab !== 'tools' && (
                        <div className="flex flex-wrap items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => handleScan(activeTab as any)} disabled={isScanning || isProcessing}>
                                {isScanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                                Escanear {activeTab}
                            </Button>
                            <Button variant="destructive" size="sm" onClick={handleDeleteSelected} disabled={isProcessing || selectedPatientIds.length === 0}>
                                <Trash2 className="mr-2 h-4 w-4" /> Borrar Seleccionados ({selectedPatientIds.length})
                            </Button>
                        </div>
                    )}
                </div>

                <TabsContent value="tools" className="mt-0 space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Wrench className="h-5 w-5 text-primary" />
                                Herramientas de Datos
                            </CardTitle>
                            <CardDescription>
                                Acciones masivas para estandarizar el formato de los datos históricos.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="grid sm:grid-cols-2 gap-6">
                            <div className="p-5 border rounded-2xl bg-muted/30 space-y-4">
                                <h4 className="font-bold flex items-center gap-2 text-blue-700">
                                    <FileDigit className="h-5 w-5" />
                                    Normalizar Expedientes
                                </h4>
                                <p className="text-xs text-muted-foreground italic">
                                    Agrega un "0" inicial a los expedientes antiguos para estandarizar el padrón.
                                </p>
                                <Button 
                                    onClick={handleNormalizeExpedientes} 
                                    disabled={isProcessing}
                                    variant="outline"
                                    className="w-full border-blue-200 hover:bg-blue-50 h-11 font-bold"
                                >
                                    {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                                    Ejecutar Normalización
                                </Button>
                            </div>

                            <div className="p-5 border rounded-2xl bg-primary/5 space-y-4">
                                <h4 className="font-bold flex items-center gap-2 text-primary">
                                    <UserRound className="h-5 w-5" />
                                    Reconstruir Nombres Completos
                                </h4>
                                <p className="text-xs text-muted-foreground italic">
                                    Genera el campo de búsqueda optimizada "NOMBRE APELLIDO_P APELLIDO_M" para todos los registros.
                                </p>
                                <Button 
                                    onClick={handleRebuildNombres} 
                                    disabled={isProcessing}
                                    className="w-full bg-primary h-11 font-black uppercase tracking-wider"
                                >
                                    {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                                    Generar Nombre Completo (Masivo)
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="status" className="mt-0 space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-yellow-600">
                                <UserMinus className="h-5 w-5" />
                                Baja Temporal Masiva
                            </CardTitle>
                            <CardDescription>
                                Se buscarán y actualizarán expedientes al estatus de "Baja Temporal".
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <Button 
                                className="w-full bg-yellow-600 hover:bg-yellow-700 h-12 text-lg font-bold" 
                                onClick={handleApplyBulkStatusUpdate}
                                disabled={isProcessing}
                            >
                                {isProcessing ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <RefreshCcw className="mr-2 h-5 w-5" />}
                                Iniciar Actualización Masiva
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="expediente" className="mt-0">
                    {duplicates.length > 0 ? (
                        <div className="space-y-4">
                            {duplicates.map((group, i) => (
                                <Accordion key={i} type="single" collapsible className="border rounded-lg bg-card">
                                    <AccordionItem value="item-1">
                                        <AccordionTrigger className="px-4">Duplicados: {group[0].expediente}</AccordionTrigger>
                                        <AccordionContent>
                                            <DuplicateGroup group={group} onSelectionChange={handleSelectionChange} selectedIds={selectedPatientIds} />
                                        </AccordionContent>
                                    </AccordionItem>
                                </Accordion>
                            ))}
                        </div>
                    ) : <div className="text-center py-12 text-muted-foreground border-dashed border-2 rounded-lg">
                            <UserMinus className="h-12 w-12 mx-auto mb-4 opacity-20" />
                            Haz clic en "Escanear expediente" para comenzar.
                        </div>}
                </TabsContent>
            </Tabs>
        </div>
    );
}


'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getMedications, createPharmacyVoucher, getPharmacyVouchers } from '@/lib/actions';
import type { Medication, PharmacyVoucher } from '@/lib/definitions';
import { Combobox } from '../ui/combobox';
import { useToast } from '@/hooks/use-toast';
import { 
    Loader2, 
    ClipboardCheck, 
    Hospital, 
    Pill, 
    History, 
    Trash2, 
    CheckCircle2,
    Search,
    RefreshCw,
    Download
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

const DEPARTMENTS = [
    'URGENCIAS', 'PEDIATRÍA', 'GINECOLOGÍA', 'CONSULTA EXTERNA', 
    'QUIRÓFANO', 'HOSPITALIZACIÓN', 'LABORATORIO', 'RAYOS X', 'DENTAL',
    'CENTRO DE SALUD RURAL', 'ADMINISTRACIÓN', 'AMBULANCIA'
];

export function VoucherForm({ onVoucherCreated }: { onVoucherCreated: () => void }) {
    const [medications, setMedications] = useState<Medication[]>([]);
    const [history, setHistory] = useState<PharmacyVoucher[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [selectedMedId, setSelectedMedId] = useState('');
    const [quantity, setQuantity] = useState<number>(1);
    const [department, setDepartment] = useState('');
    const [responsible, setResponsible] = useState('');
    
    const { toast } = useToast();

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [meds, hist] = await Promise.all([getMedications(), getPharmacyVouchers()]);
            setMedications(meds);
            setHistory(hist);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const selectedMed = useMemo(() => medications.find(m => m.id === selectedMedId), [medications, selectedMedId]);

    const medOptions = useMemo(() => medications.map(m => ({
        value: m.id,
        label: `${m.descripcion} [Stock: ${m.existencia}]`,
        keywords: `${m.claveCuadroBasico} ${m.descripcion} ${m.lote}`,
        disabled: m.existencia <= 0,
        content: (
            <div className="flex flex-col gap-0.5 py-1">
                <div className="flex justify-between items-center gap-4">
                    <span className="font-bold text-xs uppercase">{m.descripcion}</span>
                    <Badge variant={m.existencia > 0 ? "secondary" : "destructive"} className="text-[10px] font-black h-5">STOCK: {m.existencia}</Badge>
                </div>
                <div className="flex items-center gap-3 text-[9px] font-mono font-bold text-muted-foreground uppercase">
                    <span>LOTE: {m.lote}</span>
                    <span>|</span>
                    <span className={cn(m.fuenteFinanciamiento === 'EXTERNO' ? 'text-blue-600' : 'text-green-600')}>FUENTE: {m.fuenteFinanciamiento || 'IMSS-BIENESTAR'}</span>
                </div>
            </div>
        )
    })), [medications]);

    const handleCreateVoucher = async () => {
        if (!selectedMed || !department || !responsible || quantity <= 0) {
            toast({ title: "Faltan datos", description: "Verifica medicamento, destino, responsable y cantidad.", variant: "destructive" });
            return;
        }

        if (quantity > selectedMed.existencia) {
            toast({ title: "Stock insuficiente", description: "No puedes retirar más de lo que hay en existencia.", variant: "destructive" });
            return;
        }

        setIsSaving(true);
        try {
            const res = await createPharmacyVoucher({
                date: new Date().toISOString(),
                department: department.toUpperCase(),
                source: (selectedMed.fuenteFinanciamiento as any) || 'IMSS-BIENESTAR',
                medicationId: selectedMed.id,
                medicationName: selectedMed.descripcion,
                lote: selectedMed.lote,
                quantity: quantity,
                responsible: responsible.toUpperCase()
            });

            if (res.success) {
                toast({ title: "Vale Generado", description: `Folio: ${res.folio}. Inventario actualizado.` });
                setSelectedMedId('');
                setQuantity(1);
                setDepartment('');
                setResponsible('');
                loadData();
                onVoucherCreated();
            }
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="grid lg:grid-cols-12 gap-8 items-start">
            <Card className="lg:col-span-4 shadow-xl border-primary/10 bg-primary/5">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-primary font-black uppercase text-lg">
                        <Plus className="h-6 w-6" /> Nuevo Vale de Salida
                    </CardTitle>
                    <CardDescription>Retiro manual de medicamento para áreas internas.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase opacity-60">1. Buscar Medicamento</Label>
                        <Combobox 
                            options={medOptions}
                            value={selectedMedId}
                            onChange={setSelectedMedId}
                            placeholder="Buscar en inventario..."
                            searchPlaceholder="Escribe nombre o lote..."
                            disabled={isLoading || isSaving}
                        />
                    </div>

                    {selectedMed && (
                        <div className="p-4 rounded-xl bg-white border border-primary/20 shadow-inner animate-in fade-in zoom-in duration-300">
                             <div className="flex justify-between items-start gap-4 mb-4">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-primary uppercase">Existencia Real</p>
                                    <p className="text-2xl font-black">{selectedMed.existencia}</p>
                                </div>
                                <Badge variant="outline" className={cn("text-[9px] font-black uppercase", selectedMed.fuenteFinanciamiento === 'EXTERNO' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-green-50 text-green-700 border-green-200')}>
                                    {selectedMed.fuenteFinanciamiento || 'IMSS-BIENESTAR'}
                                </Badge>
                             </div>
                             <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-bold">CANTIDAD A RETIRAR</Label>
                                    <Input type="number" min={1} max={selectedMed.existencia} value={quantity} onChange={e => setQuantity(parseInt(e.target.value) || 1)} className="h-11 font-black text-center text-lg" />
                                </div>
                             </div>
                        </div>
                    )}

                    <Separator />

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase opacity-60">2. Destino y Responsable</Label>
                            <Select value={department} onValueChange={setDepartment}>
                                <SelectTrigger className="h-11 font-bold bg-white"><SelectValue placeholder="Seleccionar Departamento..." /></SelectTrigger>
                                <SelectContent>
                                    {DEPARTMENTS.map(d => <SelectItem key={d} value={d} className="font-bold">{d}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Input placeholder="Nombre de quien recibe..." value={responsible} onChange={e => setResponsible(e.target.value.toUpperCase())} className="h-11 bg-white font-bold" />
                        </div>
                    </div>
                </CardContent>
                <CardFooter>
                    <Button onClick={handleCreateVoucher} disabled={isSaving || !selectedMed} className="w-full h-14 text-lg font-black uppercase shadow-lg bg-primary hover:bg-primary/90">
                        {isSaving ? <Loader2 className="animate-spin mr-2 h-5 w-5" /> : <ClipboardCheck className="mr-2 h-5 w-5" />}
                        GENERAR VALE Y DESCONTAR
                    </Button>
                </CardFooter>
            </Card>

            <Card className="lg:col-span-8 shadow-md border-primary/10">
                <CardHeader className="bg-muted/10 border-b">
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle className="text-lg flex items-center gap-2"><History className="h-5 w-5 text-primary" /> Historial Reciente de Vales</CardTitle>
                            <CardDescription>Últimos 500 movimientos registrados.</CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}><RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} /></Button>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <ScrollArea className="h-[600px]">
                        <Table>
                            <TableHeader className="bg-muted/30 sticky top-0 z-10 shadow-sm">
                                <TableRow>
                                    <TableHead className="font-black text-[10px] uppercase">Folio / Fecha</TableHead>
                                    <TableHead className="font-black text-[10px] uppercase">Medicamento</TableHead>
                                    <TableHead className="text-center font-black text-[10px] uppercase">Cant.</TableHead>
                                    <TableHead className="font-black text-[10px] uppercase">Destino / Fuente</TableHead>
                                    <TableHead className="font-black text-[10px] uppercase">Responsable</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {history.length > 0 ? history.map(v => (
                                    <TableRow key={v.id} className="hover:bg-muted/50 transition-colors">
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-black text-xs text-primary">{v.folio}</span>
                                                <span className="text-[10px] text-muted-foreground">{format(parseISO(v.createdAt), 'dd/MM/yy HH:mm')}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-bold text-[11px] uppercase leading-tight">{v.medicationName}</span>
                                                <span className="text-[9px] font-mono text-muted-foreground uppercase mt-0.5">LOTE: {v.lote}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant="secondary" className="font-black text-sm">{v.quantity}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[10px] font-black uppercase text-muted-foreground flex items-center gap-1"><Hospital className="h-3 w-3" /> {v.department}</span>
                                                <Badge variant="outline" className={cn("w-fit text-[8px] font-black uppercase py-0", v.source === 'EXTERNO' ? "border-blue-200 text-blue-700 bg-blue-50" : "border-green-200 text-green-700 bg-green-50")}>
                                                    {v.source}
                                                </Badge>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-[10px] font-bold uppercase">{v.responsible}</TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow><TableCell colSpan={5} className="text-center py-40 opacity-40 italic">No hay vales registrados aún.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                </CardContent>
            </Card>
        </div>
    );
}

function cn(...inputs: any[]) {
    return inputs.filter(Boolean).join(' ');
}

function useCallback(arg0: () => Promise<void>, arg1: any[]): () => void {
    return React.useCallback(arg0, arg1);
}

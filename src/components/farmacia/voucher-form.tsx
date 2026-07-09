
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getMedications, createPharmacyVoucher, getPharmacyVouchers, getDepartments } from '@/lib/actions';
import type { Medication, PharmacyVoucher, Department, VoucherItem } from '@/lib/definitions';
import { Combobox } from '../ui/combobox';
import { useToast } from '@/hooks/use-toast';
import { 
    Loader2, 
    Hospital, 
    Pill, 
    History, 
    Trash2, 
    RefreshCw,
    Plus,
    PackageCheck,
    X,
    ClipboardCheck
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';

export function VoucherForm({ onVoucherCreated }: { onVoucherCreated: () => void }) {
    const [medications, setMedications] = useState<Medication[]>([]);
    const [history, setHistory] = useState<PharmacyVoucher[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    
    // Multi-item state
    const [voucherItems, setVoucherItems] = useState<VoucherItem[]>([]);
    const [department, setDepartment] = useState('');
    const [responsible, setResponsible] = useState('');
    
    const { toast } = useToast();

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [meds, hist, depts] = await Promise.all([
                getMedications(), 
                getPharmacyVouchers(),
                getDepartments()
            ]);
            setMedications(meds);
            setHistory(hist);
            setDepartments(depts.filter(d => d.available));
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const medOptions = useMemo(() => medications.map(m => ({
        value: m.id,
        label: `${m.descripcion} [LOTE: ${m.lote}]`,
        keywords: `${m.claveCuadroBasico} ${m.descripcion} ${m.lote}`,
        disabled: m.existencia <= 0,
        content: (
            <div className="flex flex-col gap-0.5 py-1">
                <div className="flex justify-between items-center gap-4">
                    <span className="font-bold text-sm uppercase">{m.descripcion}</span>
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

    const handleAddItem = (medId: string) => {
        if (!medId) return;
        const med = medications.find(m => m.id === medId);
        if (!med) return;

        if (voucherItems.some(i => i.medicationId === medId)) {
            toast({ title: "Ya agregado", description: "Este medicamento ya está en el vale." });
            return;
        }

        setVoucherItems([...voucherItems, {
            medicationId: med.id,
            medicationName: med.descripcion,
            lote: med.lote,
            quantity: 1,
            source: (med.fuenteFinanciamiento as any) || 'IMSS-BIENESTAR'
        }]);
    };

    const updateItemQuantity = (id: string, qty: number) => {
        setVoucherItems(prev => prev.map(i => i.medicationId === id ? { ...i, quantity: qty } : i));
    };

    const removeItem = (id: string) => {
        setVoucherItems(prev => prev.filter(i => i.medicationId !== id));
    };

    const handleCreateVoucher = async () => {
        if (voucherItems.length === 0 || !department || !responsible) {
            toast({ title: "Faltan datos", description: "Verifica departamento, responsable e insumos.", variant: "destructive" });
            return;
        }

        // Validate stock before sending
        for (const item of voucherItems) {
            const currentMed = medications.find(m => m.id === item.medicationId);
            if (currentMed && item.quantity > currentMed.existencia) {
                toast({ 
                    title: "Stock insuficiente", 
                    description: `No puedes retirar ${item.quantity} de ${item.medicationName}. Solo hay ${currentMed.existencia}.`, 
                    variant: "destructive" 
                });
                return;
            }
        }

        setIsSaving(true);
        try {
            const res = await createPharmacyVoucher({
                date: new Date().toISOString(),
                department: department,
                items: voucherItems,
                responsible: responsible.toUpperCase()
            });

            if (res.success) {
                toast({ title: "Vale Generado", description: `Folio: ${res.folio}.` });
                setVoucherItems([]);
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
            <Card className="lg:col-span-5 shadow-xl border-primary/10 bg-primary/5">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-primary font-black uppercase text-lg">
                        <Plus className="h-6 w-6" /> Nuevo Vale de Salida
                    </CardTitle>
                    <CardDescription>Retiro de insumos para departamentos internos.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Destination Info */}
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase opacity-60">1. Destino (Departamento)</Label>
                            <Select value={department} onValueChange={setDepartment}>
                                <SelectTrigger className="h-11 font-bold bg-white">
                                    <SelectValue placeholder="Elegir área..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {departments.map(d => <SelectItem key={d.id} value={d.name} className="font-bold">{d.name}</SelectItem>)}
                                    {departments.length === 0 && <div className="p-4 text-center text-xs opacity-50 italic">Carga el catálogo en el panel admin.</div>}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase opacity-60">2. Responsable / Recibe</Label>
                            <Input placeholder="Nombre de quien recibe..." value={responsible} onChange={e => setResponsible(e.target.value.toUpperCase())} className="h-11 bg-white font-bold" />
                        </div>
                    </div>

                    <Separator className="my-2" />

                    {/* Multi-Item Selector */}
                    <div className="space-y-4">
                        <Label className="text-[10px] font-black uppercase opacity-60">3. Agregar Medicamentos</Label>
                        <Combobox 
                            options={medOptions}
                            value=""
                            onChange={handleAddItem}
                            placeholder="Buscar por nombre o lote..."
                            searchPlaceholder="Filtrar catálogo..."
                            disabled={isLoading || isSaving}
                        />

                        <div className="border rounded-xl bg-background shadow-inner overflow-hidden">
                            <Table>
                                <TableHeader className="bg-muted/50">
                                    <TableRow>
                                        <TableHead className="text-[10px] font-black uppercase">Insumo / Fuente</TableHead>
                                        <TableHead className="w-[80px] text-center text-[10px] font-black uppercase">Cant.</TableHead>
                                        <TableHead className="w-[50px]"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {voucherItems.map((item) => (
                                        <TableRow key={item.medicationId} className="hover:bg-muted/10">
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="text-[11px] font-bold uppercase leading-tight">{item.medicationName}</span>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <Badge variant="outline" className={cn("text-[8px] font-black py-0 h-4 uppercase", item.source === 'EXTERNO' ? 'border-blue-200 text-blue-700 bg-blue-50' : 'border-green-200 text-green-700 bg-green-50')}>
                                                            {item.source}
                                                        </Badge>
                                                        <span className="text-[9px] font-mono font-bold opacity-60">LOTE: {item.lote}</span>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Input 
                                                    type="number" 
                                                    min={1} 
                                                    className="h-8 text-center font-black text-xs" 
                                                    value={item.quantity}
                                                    onChange={e => updateItemQuantity(item.medicationId, parseInt(e.target.value) || 1)}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeItem(item.medicationId)}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {voucherItems.length === 0 && <TableRow><TableCell colSpan={3} className="text-center py-12 text-muted-foreground text-xs italic">Agrega productos al vale usando el buscador superior.</TableCell></TableRow>}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </CardContent>
                <CardFooter>
                    <Button onClick={handleCreateVoucher} disabled={isSaving || voucherItems.length === 0 || !department || !responsible} className="w-full h-14 text-lg font-black uppercase shadow-lg bg-primary hover:bg-primary/90 text-white">
                        {isSaving ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <PackageCheck className="mr-2 h-5 w-5" />}
                        GENERAR VALE Y DESCONTAR ({voucherItems.length})
                    </Button>
                </CardFooter>
            </Card>

            <Card className="lg:col-span-7 shadow-md border-primary/10">
                <CardHeader className="bg-muted/10 border-b">
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle className="text-lg flex items-center gap-2"><History className="h-5 w-5 text-primary" /> Historial Reciente de Vales</CardTitle>
                            <CardDescription>Movimientos de salida registrados en el sistema.</CardDescription>
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
                                    <TableHead className="font-black text-[10px] uppercase">Detalle de Productos</TableHead>
                                    <TableHead className="font-black text-[10px] uppercase">Destino / Responsable</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {history.length > 0 ? history.map(v => (
                                    <TableRow key={v.id} className="hover:bg-muted/50 transition-colors">
                                        <TableCell className="align-top pt-4">
                                            <div className="flex flex-col">
                                                <span className="font-black text-xs text-primary">{v.folio}</span>
                                                <span className="text-[10px] text-muted-foreground">{format(parseISO(v.createdAt), 'dd/MM/yy HH:mm')}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="align-top pt-4">
                                            <div className="flex flex-col gap-2">
                                                {v.items.map((item, idx) => (
                                                    <div key={idx} className="flex items-start gap-2 border-b border-dashed last:border-0 pb-1 mb-1">
                                                        <Badge variant="secondary" className="font-black text-[10px] h-5 px-1.5 shrink-0">{item.quantity}</Badge>
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-[10px] uppercase leading-tight">{item.medicationName}</span>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[9px] font-mono text-muted-foreground uppercase">LOTE: {item.lote}</span>
                                                                <span className={cn("text-[8px] font-black uppercase", item.source === 'EXTERNO' ? 'text-blue-600' : 'text-green-600')}>({item.source})</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </TableCell>
                                        <TableCell className="align-top pt-4">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[11px] font-black uppercase text-primary flex items-center gap-1"><Hospital className="h-3 w-3" /> {v.department}</span>
                                                <span className="text-[10px] font-bold text-muted-foreground uppercase pl-4">{v.responsible}</span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow><TableCell colSpan={3} className="text-center py-40 opacity-40 italic font-black uppercase">No hay vales registrados aún.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                </CardContent>
            </Card>
        </div>
    );
}

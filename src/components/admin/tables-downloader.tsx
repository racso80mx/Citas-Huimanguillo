
'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
    Download, 
    Loader2, 
    Table as TableIcon, 
    Database, 
    Users, 
    ClipboardList, 
    Stethoscope, 
    Pill, 
    Hospital,
    Search,
    BookText,
    History,
    ShieldCheck,
    FlaskConical,
    Activity,
    FileText,
    LayoutList,
    Calendar as CalendarIcon,
    ShieldAlert,
    Settings,
    Package
} from 'lucide-react';
import { adminDb } from '@/firebase/server-config';
import { collection, getDocs } from 'firebase/firestore';
import { serializeData } from '@/lib/data';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

type TableConfig = {
    id: string;
    label: string;
    icon: React.ElementType;
    description: string;
    color: string;
};

export function TablesDownloader() {
    const [downloading, setDownloading] = useState<string | null>(null);
    const { toast } = useToast();

    const tables: TableConfig[] = [
        { id: 'appointments', label: 'appointments', icon: ClipboardList, description: 'Citas médicas generales', color: 'text-primary' },
        { id: 'labAppointments', label: 'labAppointments', icon: FlaskConical, description: 'Citas de Laboratorio', color: 'text-emerald-600' },
        { id: 'xrayAppointments', label: 'xrayAppointments', icon: Stethoscope, description: 'Citas de Rayos X', color: 'text-blue-600' },
        { id: 'ultrasoundAppointments', label: 'ultrasoundAppointments', icon: Activity, description: 'Citas de Ultrasonido', color: 'text-indigo-600' },
        { id: 'vaccineAppointments', label: 'vaccineAppointments', icon: ShieldCheck, description: 'Citas de Vacunación', color: 'text-teal-600' },
        { id: 'patients', label: 'patients', icon: Users, description: 'Padrón maestro de pacientes', color: 'text-primary' },
        { id: 'medicalConsultations', label: 'medicalConsultations', icon: History, description: 'Historial de notas médicas', color: 'text-rose-600' },
        { id: 'prescriptions', label: 'prescriptions', icon: FileText, description: 'Recetas digitales generadas', color: 'text-orange-600' },
        { id: 'medications', label: 'medications', icon: Pill, description: 'Inventario de medicamentos', color: 'text-primary' },
        { id: 'supplies', label: 'supplies', icon: Package, description: 'Insumos de Almacén', color: 'text-slate-600' },
        { id: 'pharmacyVouchers', label: 'pharmacyVouchers', icon: ClipboardList, description: 'Vales de salida de farmacia', color: 'text-amber-600' },
        { id: 'clinics', label: 'clinics', icon: Hospital, description: 'Consultorios y médicos', color: 'text-primary' },
        { id: 'colonias', label: 'colonias', icon: Hospital, description: 'Localidades y municipios', color: 'text-slate-600' },
        { id: 'departments', label: 'departments', icon: Hospital, description: 'Destinos para vales', color: 'text-slate-600' },
        { id: 'serviceTypes', label: 'serviceTypes', icon: LayoutList, description: 'Tipos de servicio', color: 'text-slate-600' },
        { id: 'specialties', label: 'specialties', icon: LayoutList, description: 'Especialidades médicas', color: 'text-slate-600' },
        { id: 'labStudies', label: 'labStudies', icon: FlaskConical, description: 'Catálogo estudios laboratorio', color: 'text-slate-500' },
        { id: 'xrayStudies', label: 'xrayStudies', icon: Stethoscope, description: 'Catálogo estudios Rayos X', color: 'text-slate-500' },
        { id: 'ultrasoundStudies', label: 'ultrasoundStudies', icon: Activity, description: 'Catálogo estudios Ultrasonido', color: 'text-slate-500' },
        { id: 'vaccines', label: 'vaccines', icon: ShieldCheck, description: 'Catálogo de biológicos', color: 'text-slate-500' },
        { id: 'holidays', label: 'holidays', icon: CalendarIcon, description: 'Días festivos oficiales', color: 'text-red-500' },
        { id: 'specialActionDays', label: 'specialActionDays', icon: ShieldAlert, description: 'Bloqueos por informes', color: 'text-red-500' },
        { id: 'cie10', label: 'cie10', icon: BookText, description: 'Catálogo maestro diagnósticos', color: 'text-blue-800' },
        { id: 'cie10_glossary', label: 'cie10_glossary', icon: Search, description: 'Glosario CIE-10', color: 'text-blue-800' },
        { id: 'activityLog', label: 'activityLog', icon: History, description: 'Bitácora de movimientos', color: 'text-slate-700' },
        { id: 'settings', label: 'settings', icon: Settings, description: 'Ajustes globales sistema', color: 'text-slate-700' }
    ];

    const handleDownload = async (tableId: string) => {
        setDownloading(tableId);
        try {
            const xlsx = await import('xlsx');
            const colRef = collection(adminDb, tableId);
            const snap = await getDocs(colRef);
            
            if (snap.empty) {
                toast({ title: "Tabla vacía", description: `No hay registros en la tabla ${tableId}.`, variant: "destructive" });
                setDownloading(null);
                return;
            }

            const rawData = snap.docs.map(d => ({ ...d.data(), id: d.id }));
            const data = serializeData(rawData);

            const flattenedData = data.map((item: any) => {
                const flatItem: any = {};
                for (const key in item) {
                    if (item[key] && typeof item[key] === 'object' && !Array.isArray(item[key])) {
                        for (const subKey in item[key]) {
                            flatItem[`${key}_${subKey}`] = String(item[key][subKey]);
                        }
                    } else if (Array.isArray(item[key])) {
                        flatItem[key] = item[key].map((i: any) => i.name || i.label || JSON.stringify(i)).join(', ');
                    } else {
                        flatItem[key] = item[key];
                    }
                }
                return flatItem;
            });

            const ws = xlsx.utils.json_to_sheet(flattenedData);
            const wb = xlsx.utils.book_new();
            xlsx.utils.book_append_sheet(wb, ws, tableId);
            xlsx.writeFile(wb, `TABLA_${tableId.toUpperCase()}_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);

            toast({ title: "Descarga exitosa", description: `Se exportaron ${data.length} registros.` });
        } catch (error: any) {
            console.error(error);
            toast({ title: "Error en descarga", description: error.message, variant: "destructive" });
        } finally {
            setDownloading(null);
        }
    };

    return (
        <div className="space-y-8">
            <Card className="border-green-600/20 bg-green-50/10 shadow-lg">
                <CardHeader className="flex flex-row items-center gap-4">
                    <div className="bg-green-600 p-3 rounded-2xl text-white">
                        <Database className="h-8 w-8" />
                    </div>
                    <div>
                        <CardTitle className="text-2xl font-black uppercase text-green-700">Explorador de Datos Maestro</CardTitle>
                        <CardDescription className="font-bold">
                            Descarga directa de todas las colecciones de Firestore para auditoría manual.
                        </CardDescription>
                    </div>
                </CardHeader>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {tables.map((table) => (
                    <Card key={table.id} className="hover:shadow-md transition-shadow group">
                        <CardContent className="pt-6">
                            <div className="flex items-start justify-between mb-4">
                                <div className={cn("p-2 rounded-lg bg-muted/50 group-hover:scale-110 transition-transform", table.color)}>
                                    <table.icon className="h-6 w-6" />
                                </div>
                                <Button 
                                    size="icon" 
                                    variant="outline" 
                                    className="h-10 w-10 border-primary/20 hover:bg-primary hover:text-white"
                                    onClick={() => handleDownload(table.id)}
                                    disabled={downloading === table.id}
                                >
                                    {downloading === table.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                </Button>
                            </div>
                            <div className="space-y-1">
                                <h4 className="font-black text-xs uppercase tracking-tighter text-foreground truncate">{table.label}</h4>
                                <p className="text-[10px] text-muted-foreground font-medium line-clamp-1">{table.description}</p>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}

'use client';
import { useState, useEffect, useTransition, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useToast } from '@/hooks/use-toast';
import { updateXRaySettings, getXRaySettings, updateXRayStudies, getXRayStudies } from '@/lib/actions';
import { Loader2, Save, Stethoscope, CalendarClock, Settings, PlusCircle, Trash2, Pencil } from 'lucide-react';
import type { XRaySettings, XRayStudy } from '@/lib/definitions';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Textarea } from '../ui/textarea';
import { Separator } from '../ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { timeSlots30Min } from '@/lib/time-slots';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { ScrollArea } from '../ui/scroll-area';
import { Badge } from '../ui/badge';

function XRayStudyEditDialog({ study, onSave, onCancel }: { study: XRayStudy, onSave: (study: XRayStudy) => void, onCancel: () => void }) {
    const [editedStudy, setEditedStudy] = useState<XRayStudy>(study);

    useEffect(() => {
        setEditedStudy(study);
    }, [study]);

    const handleFieldChange = (field: keyof Omit<XRayStudy, 'id'>, value: any) => {
        setEditedStudy(prev => ({...prev, [field]: value}));
    }

    return (
        <DialogContent className="sm:max-w-[50%]">
            <DialogHeader>
                <DialogTitle>Editar Estudio de Rayos X: {study.name || "Nuevo Estudio"}</DialogTitle>
                <DialogDescription>
                    Modifica los detalles del estudio. Los cambios se guardarán cuando presiones "Guardar Configuración de Rayos X".
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className='grid grid-cols-2 gap-4 items-center'>
                    <div className='space-y-2'>
                        <Label htmlFor={`rx-name-${editedStudy.id}`}>Nombre del Estudio</Label>
                        <Input id={`rx-name-${editedStudy.id}`} value={editedStudy.name} onChange={(e) => handleFieldChange('name', e.target.value.toUpperCase())} placeholder="Ej. Tórax P.A."/>
                    </div>
                    <div className="flex items-center space-x-2 pt-6">
                        <Switch id={`rx-available-${editedStudy.id}`} checked={editedStudy.available} onCheckedChange={(checked) => handleFieldChange('available', checked)} />
                        <Label htmlFor={`rx-available-${editedStudy.id}`}>Disponible</Label>
                    </div>
                </div>
                <div className='space-y-2'>
                    <Label htmlFor={`rx-indications-${editedStudy.id}`}>Indicaciones</Label>
                    <Textarea id={`rx-indications-${editedStudy.id}`} value={editedStudy.indications} onChange={(e) => handleFieldChange('indications', e.target.value)} placeholder="Indicaciones para el paciente..."/>
                </div>
            </div>
            <DialogFooter>
                <DialogClose asChild>
                    <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
                </DialogClose>
                <Button type="button" onClick={() => onSave(editedStudy)}>Guardar Cambios</Button>
            </DialogFooter>
        </DialogContent>
    );
}

export function XRaySettingsManager() {
  const [settings, setSettings] = useState<XRaySettings | null>(null);
  const [studies, setStudies] = useState<XRayStudy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, startSavingTransition] = useTransition();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedStudy, setSelectedStudy] = useState<XRayStudy | null>(null);
  const { toast } = useToast();

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [settingsData, studiesData] = await Promise.all([
        getXRaySettings(),
        getXRayStudies()
      ]);
      setSettings(settingsData);
      setStudies(studiesData);
    } catch (error) {
      console.error('Failed to fetch X-Ray settings:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar la configuración de Rayos X.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const dynamicBreakSlots = useMemo(() => {
    if (!settings?.startTime || !settings?.endTime) return [];
    const slots: string[] = [];
    try {
        const startParts = settings.startTime.split(':').map(Number);
        const endParts = settings.endTime.split(':').map(Number);
        if (startParts.length !== 2 || endParts.length !== 2) return [];
        let current = new Date(1970, 0, 1, startParts[0], startParts[1]);
        const end = new Date(1970, 0, 1, endParts[0], endParts[1]);
        if (current >= end || isNaN(current.getTime())) return [];
        while (current < end) {
            slots.push(current.toTimeString().substring(0, 5));
            current = new Date(current.getTime() + 30 * 60000); 
        }
    } catch (e) { return []; }
    return slots;
  }, [settings?.startTime, settings?.endTime]);

  const handleSettingsChange = (field: keyof XRaySettings, value: string | number | boolean) => {
    if (settings) {
        setSettings({ ...settings, [field]: value });
    }
  };

  const handleEditClick = (study: XRayStudy) => {
    setSelectedStudy(study);
    setIsDialogOpen(true);
  }

  const handleAddNewClick = () => {
    const newStudy: XRayStudy = { id: uuidv4(), name: '', indications: '', available: true };
    setSelectedStudy(newStudy);
    setIsDialogOpen(true);
  }

  const handleDialogSave = (updatedStudy: XRayStudy) => {
    const studyExists = studies.some(s => s.id === updatedStudy.id);
    if (studyExists) {
        setStudies(studies.map(s => s.id === updatedStudy.id ? updatedStudy : s));
    } else {
        setStudies([...studies, updatedStudy]);
    }
    setIsDialogOpen(false);
    setSelectedStudy(null);
  }

  const handleDialogCancel = () => {
      setIsDialogOpen(false);
      setSelectedStudy(null);
  }
  
  const removeStudy = (id: string) => {
    setStudies(studies.filter(s => s.id !== id));
  };

  const handleSave = () => {
    if (!settings) return;
    
    const validStudies = studies.filter(s => s.name.trim() !== '' && s.indications.trim() !== '');
    if (validStudies.length !== studies.length) {
        toast({
            title: 'Campos Requeridos',
            description: 'El nombre y las indicaciones del estudio no pueden estar vacíos.',
            variant: 'destructive',
        });
        return;
    }

    startSavingTransition(async () => {
      const results = await Promise.all([
          updateXRaySettings(settings),
          updateXRayStudies(studies)
      ]);

      const settingsResult = results[0];
      const studiesResult = results[1];

      if (settingsResult.success && studiesResult.success) {
        toast({
          title: 'Configuración Guardada',
          description: 'La configuración de Rayos X ha sido actualizada exitosamente.',
          className: 'bg-accent text-accent-foreground',
        });
        await fetchData();
      } else {
        toast({
          title: 'Error',
          description: settingsResult.message || studiesResult.message ||'No se pudo guardar la configuración.',
          variant: 'destructive',
        });
      }
    });
  };

  if (isLoading || !settings) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings /> Configuración de Rayos X
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center items-center h-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <div className="space-y-8 flex flex-col h-full">
            <Card className="shadow-lg border-primary/10 flex flex-col min-h-0">
            <CardHeader className="shrink-0">
                <CardTitle className="flex items-center gap-2 text-primary uppercase font-black">
                <Settings /> Parámetros Operativos
                </CardTitle>
                <CardDescription>
                Gestiona horarios y el catálogo de estudios de radiografía.
                </CardDescription>
            </CardHeader>
            <ScrollArea className="flex-1 min-h-0">
                <CardContent className="space-y-8 p-6">
                    <div className="space-y-6">
                        <h3 className="font-semibold text-lg flex items-center gap-2 text-primary"><CalendarClock className="h-5 w-5"/> Horarios y Cupos</h3>
                        <div className='grid sm:grid-cols-2 lg:grid-cols-4 gap-4'>
                            <div className='space-y-2'>
                                <Label htmlFor="xray-slots">Citas por día</Label>
                                <Input
                                id="xray-slots"
                                type="number"
                                value={settings.dailySlots}
                                onChange={(e) => handleSettingsChange('dailySlots', parseInt(e.target.value,10) || 0)}
                                />
                            </div>
                            <div className='space-y-2'>
                                <Label htmlFor="xray-waitlist">Lista de Espera</Label>
                                <Input
                                id="xray-waitlist"
                                type="number"
                                value={settings.waitlistSlots || 0}
                                onChange={(e) => handleSettingsChange('waitlistSlots', parseInt(e.target.value,10) || 0)}
                                placeholder="Ej. 5"
                                />
                            </div>
                            <div className='space-y-2'>
                                <Label htmlFor="xray-start">Hora Inicio</Label>
                                <Select value={settings.startTime} onValueChange={(value) => handleSettingsChange('startTime', value)}>
                                    <SelectTrigger id="xray-start"><SelectValue /></SelectTrigger>
                                    <SelectContent>{timeSlots30Min.map(slot => <SelectItem key={`start-${slot.value}`} value={slot.value}>{slot.label}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <div className='space-y-2'>
                                <Label htmlFor="xray-end">Hora Fin</Label>
                                <Select value={settings.endTime} onValueChange={(value) => handleSettingsChange('endTime', value)}>
                                    <SelectTrigger id="xray-end"><SelectValue /></SelectTrigger>
                                    <SelectContent>{timeSlots30Min.map(slot => <SelectItem key={`end-${slot.value}`} value={slot.value}>{slot.label}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-4">
                            <div className='space-y-2'>
                                <Label htmlFor="xray-break">Tiempo de Descanso</Label>
                                <Select value={settings.breakTime || ''} onValueChange={(value) => handleSettingsChange('breakTime', value === 'none' ? '' : value)}>
                                    <SelectTrigger id="xray-break"><SelectValue placeholder="Seleccionar descanso..." /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Sin Descanso</SelectItem>
                                        {dynamicBreakSlots.map(slot => (
                                            <SelectItem key={`break-${slot}`} value={slot}>{slot}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex items-center space-x-2 pt-8">
                                <Switch 
                                id="xray-weekend"
                                checked={settings.weekendBookingEnabled}
                                onCheckedChange={(checked) => handleSettingsChange('weekendBookingEnabled', checked)}
                                />
                                <Label htmlFor="xray-weekend">Permitir citas en fin de semana</Label>
                            </div>
                        </div>
                    </div>

                    <Separator />

                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="font-semibold text-lg flex items-center gap-2 text-primary"><Stethoscope className="h-5 w-5"/> Catálogo de Estudios</h3>
                            <Button onClick={handleAddNewClick} size="sm" className="bg-primary hover:bg-primary/90"><PlusCircle className="mr-2 h-4 w-4" />Agregar Estudio</Button>
                        </div>
                        <div className="border rounded-xl bg-card shadow-inner">
                            <ScrollArea className="h-[400px]">
                                <Table>
                                    <TableHeader className="bg-muted/50 sticky top-0 z-10">
                                        <TableRow>
                                            <TableHead>Estudio</TableHead>
                                            <TableHead>Estado</TableHead>
                                            <TableHead className="text-right">Acciones</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {studies.map(study => (
                                            <TableRow key={study.id} className="hover:bg-muted/30">
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-xs uppercase leading-tight">{study.name}</span>
                                                        <span className="text-[10px] text-muted-foreground line-clamp-1 italic mt-0.5">{study.indications}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={study.available ? 'secondary' : 'outline'} className="text-[10px] font-black uppercase">
                                                        {study.available ? 'Sí' : 'No'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end gap-1">
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600" onClick={() => handleEditClick(study)}>
                                                            <Pencil className="h-3.5 w-3.5" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeStudy(study.id)}>
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                                {studies.length === 0 && (
                                    <div className="text-center py-20 text-muted-foreground italic">
                                        No hay estudios definidos. Agrega uno para comenzar.
                                    </div>
                                )}
                            </ScrollArea>
                        </div>
                    </div>
                </CardContent>
            </ScrollArea>
            <CardFooter className="bg-muted/5 border-t pt-6 shrink-0">
                <Button onClick={handleSave} disabled={isSaving} className="w-full h-12 font-black uppercase shadow-lg">
                {isSaving ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                    <Save className="mr-2 h-5 w-5" />
                )}
                {isSaving ? 'Actualizando...' : 'GUARDAR CONFIGURACIÓN DE RAYOS X'}
                </Button>
            </CardFooter>
            </Card>
            {selectedStudy && (
                <XRayStudyEditDialog
                    study={selectedStudy}
                    onSave={handleDialogSave}
                    onCancel={handleDialogCancel}
                />
            )}
        </div>
    </Dialog>
  );
}

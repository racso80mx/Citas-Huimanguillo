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
import { updateLabSettings, getLabSettings, updateLabStudies, getLabStudies } from '@/lib/actions';
import { Loader2, Save, FlaskConical, CalendarClock, Settings, Eye, EyeOff, PlusCircle, Trash2, Pencil } from 'lucide-react';
import type { LabSettings, LabStudy } from '@/lib/definitions';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Separator } from '../ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { timeSlots30Min } from '@/lib/time-slots';
import { ScrollArea } from '../ui/scroll-area';
import { Badge } from '../ui/badge';

function LabStudyEditDialog({ study, onSave, onCancel }: { study: LabStudy, onSave: (study: LabStudy) => void, onCancel: () => void }) {
    const [editedStudy, setEditedStudy] = useState<LabStudy>(study);

    useEffect(() => {
        setEditedStudy(study);
    }, [study]);

    const handleFieldChange = (field: keyof Omit<LabStudy, 'id'>, value: any) => {
        setEditedStudy(prev => ({...prev, [field]: value}));
    }

    return (
        <DialogContent className="sm:max-w-[50%]">
            <DialogHeader>
                <DialogTitle>Editar Estudio de Laboratorio: {study.name || "Nuevo Estudio"}</DialogTitle>
                <DialogDescription>
                    Modifica los detalles del estudio. Los cambios se guardarán cuando presiones "Guardar Configuración de Laboratorio".
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                 <div className='grid grid-cols-3 gap-4'>
                    <div className='space-y-2'>
                        <Label htmlFor={`lab-code-${editedStudy.id}`}>Código</Label>
                        <Input id={`lab-code-${editedStudy.id}`} value={editedStudy.code || ''} onChange={(e) => handleFieldChange('code', e.target.value.toUpperCase())} placeholder="Ej. EG01"/>
                    </div>
                     <div className='space-y-2 col-span-2'>
                        <Label htmlFor={`lab-name-${editedStudy.id}`}>Nombre</Label>
                        <Input id={`lab-name-${editedStudy.id}`} value={editedStudy.name} onChange={(e) => handleFieldChange('name', e.target.value)} placeholder="Ej. Biometría Hemática"/>
                    </div>
                 </div>
                 <div className='grid grid-cols-2 gap-4'>
                    <div className='space-y-2'>
                        <Label htmlFor={`lab-section-${editedStudy.id}`}>Sección</Label>
                        <Input id={`lab-section-${editedStudy.id}`} value={editedStudy.section} onChange={(e) => handleFieldChange('section', e.target.value)} placeholder="Ej. Hematología"/>
                    </div>
                     <div className='space-y-2'>
                        <Label htmlFor={`lab-sample-${editedStudy.id}`}>Tipo de Muestra</Label>
                        <Input id={`lab-sample-${editedStudy.id}`} value={editedStudy.sampleType} onChange={(e) => handleFieldChange('sampleType', e.target.value)} placeholder="Ej. Sangre venosa"/>
                    </div>
                 </div>
                 <div className='grid grid-cols-2 gap-4'>
                    <div className='space-y-2'>
                        <Label htmlFor={`lab-fasting-${editedStudy.id}`}>Ayuno</Label>
                        <Input id={`lab-fasting-${editedStudy.id}`} value={editedStudy.fastingHours} onChange={(e) => handleFieldChange('fastingHours', e.target.value)} placeholder="Ej. 8 horas"/>
                    </div>
                    <div className="flex items-center space-x-2 pt-8">
                        <Switch id={`lab-available-${editedStudy.id}`} checked={editedStudy.available} onCheckedChange={(checked) => handleFieldChange('available', checked)} />
                        <Label htmlFor={`lab-available-${editedStudy.id}`}>Disponible</Label>
                    </div>
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

export function LabSettingsManager() {
  const [settings, setSettings] = useState<LabSettings | null>(null);
  const [studies, setStudies] = useState<LabStudy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, startSavingTransition] = useTransition();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedStudy, setSelectedStudy] = useState<LabStudy | null>(null);
  const { toast } = useToast();

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [settingsData, studiesData] = await Promise.all([
        getLabSettings(),
        getLabStudies()
      ]);
      setSettings(settingsData);
      setStudies(studiesData);
    } catch (error) {
      console.error('Failed to fetch lab settings:', error);
      toast({
        title: 'Error',
        description:
          'No se pudo cargar la configuración del laboratorio.',
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

  const handleSettingsChange = (field: keyof LabSettings, value: string | number | boolean) => {
    if (settings) {
        setSettings({ ...settings, [field]: value });
    }
  };

  const handleEditClick = (study: LabStudy) => {
    setSelectedStudy(study);
    setIsDialogOpen(true);
  }

  const handleAddNewClick = () => {
    const newStudy: LabStudy = { id: uuidv4(), code: '', name: '', section: 'Nueva Sección', sampleType: '', fastingHours: '', available: true };
    setSelectedStudy(newStudy);
    setIsDialogOpen(true);
  }

  const handleDialogSave = (updatedStudy: LabStudy) => {
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

    startSavingTransition(async () => {
      const validStudies = studies.filter(s => s.name.trim() !== '' && s.section.trim() !== '');
       if (validStudies.length !== studies.length) {
          toast({
              title: 'Campos Requeridos',
              description: 'El nombre y la sección del estudio no pueden estar vacíos.',
              variant: 'destructive',
          });
          return;
      }

      const results = await Promise.all([
          updateLabSettings(settings),
          updateLabStudies(studies)
      ]);

      const settingsResult = results[0];
      const studiesResult = results[1];

      if (settingsResult.success && studiesResult.success) {
        toast({
          title: 'Configuración Guardada',
          description: 'La configuración del laboratorio ha sido actualizada exitosamente.',
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
      <Card className="shadow-lg border-primary/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings /> Configuración de Laboratorio
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center items-center h-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
        <div className="space-y-8">
            <Card className="shadow-lg border-primary/10">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                    <Settings /> Parámetros de Operación
                    </CardTitle>
                    <CardDescription>
                    Gestiona los horarios y el catálogo de estudios.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-8 p-6">
                    <div className="space-y-6">
                        <h3 className="font-semibold text-lg flex items-center gap-2 text-primary"><CalendarClock className="h-5 w-5"/> Citas y Horarios</h3>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className='space-y-2'>
                                <Label htmlFor="lab-slots">Citas por día</Label>
                                <Input
                                id="lab-slots"
                                type="number"
                                value={settings.dailySlots}
                                onChange={(e) => handleSettingsChange('dailySlots', parseInt(e.target.value,10) || 0)}
                                />
                            </div>
                            <div className='space-y-2'>
                                <Label htmlFor="lab-waitlist">Lista de Espera</Label>
                                <Input
                                id="lab-waitlist"
                                type="number"
                                value={settings.waitlistSlots || 0}
                                onChange={(e) => handleSettingsChange('waitlistSlots', parseInt(e.target.value,10) || 0)}
                                placeholder="Ej. 5"
                                />
                            </div>
                            <div className='space-y-2'>
                                <Label htmlFor="lab-start">Hora Inicio</Label>
                                <Select value={settings.startTime} onValueChange={(value) => handleSettingsChange('startTime', value)}>
                                    <SelectTrigger id="lab-start"><SelectValue /></SelectTrigger>
                                    <SelectContent>{timeSlots30Min.map(slot => <SelectItem key={`start-${slot.value}`} value={slot.value}>{slot.label}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <div className='space-y-2'>
                                <Label htmlFor="lab-end">Hora Fin</Label>
                                <Select value={settings.endTime} onValueChange={(value) => handleSettingsChange('endTime', value)}>
                                    <SelectTrigger id="lab-end"><SelectValue /></SelectTrigger>
                                    <SelectContent>{timeSlots30Min.map(slot => <SelectItem key={`end-${slot.value}`} value={slot.value}>{slot.label}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-4">
                            <div className='space-y-2'>
                                <Label htmlFor="lab-break">Tiempo de Descanso</Label>
                                <Select value={settings.breakTime || ''} onValueChange={(value) => handleSettingsChange('breakTime', value === 'none' ? '' : value)}>
                                    <SelectTrigger id="lab-break"><SelectValue placeholder="Seleccionar descanso..." /></SelectTrigger>
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
                                id="lab-weekend"
                                checked={settings.weekendBookingEnabled}
                                onCheckedChange={(checked) => handleSettingsChange('weekendBookingEnabled', checked)}
                                />
                                <Label htmlFor="lab-weekend">Permitir citas en fin de semana</Label>
                            </div>
                        </div>
                    </div>

                    <Separator />

                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="font-semibold text-lg flex items-center gap-2 text-primary"><FlaskConical className="h-5 w-5"/> Gestionar Catálogo</h3>
                            <Button onClick={handleAddNewClick} size="sm" className="bg-primary hover:bg-primary/90"><PlusCircle className="mr-2 h-4 w-4" />Agregar Estudio</Button>
                        </div>
                        <div className="border rounded-xl bg-card shadow-inner overflow-hidden">
                            <ScrollArea className="h-[400px]">
                                <Table>
                                    <TableHeader className="bg-muted/50 sticky top-0 z-10">
                                        <TableRow>
                                            <TableHead>Código</TableHead>
                                            <TableHead>Estudio</TableHead>
                                            <TableHead>Sección</TableHead>
                                            <TableHead>Estado</TableHead>
                                            <TableHead className="text-right">Acciones</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {studies.map(study => (
                                            <TableRow key={study.id} className="hover:bg-muted/30">
                                                <TableCell className="font-mono text-xs font-bold">{study.code || '---'}</TableCell>
                                                <TableCell className="font-medium text-xs uppercase">{study.name}</TableCell>
                                                <TableCell className="text-xs uppercase text-muted-foreground">{study.section}</TableCell>
                                                <TableCell>
                                                    <Badge variant={study.available ? 'secondary' : 'outline'} className="text-[10px] font-black uppercase">
                                                        {study.available ? 'Activo' : 'Inactivo'}
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
                <CardFooter className="bg-muted/5 border-t pt-6">
                    <Button onClick={handleSave} disabled={isSaving} className="w-full h-12 font-black uppercase shadow-lg">
                    {isSaving ? (
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    ) : (
                        <Save className="mr-2 h-5 w-5" />
                    )}
                    {isSaving ? 'Actualizando...' : 'SINCRONIZAR CATÁLOGO DE LABORATORIO'}
                    </Button>
                </CardFooter>
            </Card>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            {selectedStudy && (
                <LabStudyEditDialog
                    study={selectedStudy}
                    onSave={handleDialogSave}
                    onCancel={handleDialogCancel}
                />
            )}
        </Dialog>
    </>
  );
}

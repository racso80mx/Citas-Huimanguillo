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
import { updateVaccineSettings, getVaccineSettings, updateVaccines, getVaccines } from '@/lib/actions';
import { Loader2, Save, ShieldPlus, CalendarClock, Settings, Eye, EyeOff, PlusCircle, Trash2, Pencil } from 'lucide-react';
import type { VaccineSettings, Vaccine } from '@/lib/definitions';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Textarea } from '../ui/textarea';
import { Separator } from '../ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { timeSlots10Min } from '@/lib/time-slots';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { ScrollArea } from '../ui/scroll-area';
import { Badge } from '../ui/badge';

function VaccineEditDialog({ vaccine, onSave, onCancel }: { vaccine: Vaccine, onSave: (vaccine: Vaccine) => void, onCancel: () => void }) {
    const [editedVaccine, setEditedVaccine] = useState<Vaccine>(vaccine);

    useEffect(() => {
        setEditedVaccine(vaccine);
    }, [vaccine]);

    const handleFieldChange = (field: keyof Omit<Vaccine, 'id'>, value: any) => {
        setEditedVaccine(prev => ({...prev, [field]: value}));
    }

    return (
        <DialogContent className="sm:max-w-[50%]">
            <DialogHeader>
                <DialogTitle>Editar Vacuna: {vaccine.name || "Nueva Vacuna"}</DialogTitle>
                <DialogDescription>
                    Modifica los detalles de la vacuna. Los cambios se guardarán cuando presiones "Guardar Configuración de Vacunación".
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4 items-center">
                    <div className='space-y-2'>
                        <Label htmlFor={`vac-name-${editedVaccine.id}`}>Nombre</Label>
                        <Input id={`vac-name-${editedVaccine.id}`} value={editedVaccine.name} onChange={(e) => handleFieldChange('name', e.target.value.toUpperCase())} placeholder="Ej. BCG"/>
                    </div>
                    <div className="flex items-center space-x-2 pt-6">
                        <Switch id={`vac-available-${editedVaccine.id}`} checked={editedVaccine.available} onCheckedChange={(checked) => handleFieldChange('available', checked)} />
                        <Label htmlFor={`vac-available-${editedVaccine.id}`}>Disponible</Label>
                    </div>
                </div>
                <div className='grid grid-cols-2 gap-4'>
                    <div className='space-y-2'>
                        <Label htmlFor={`vac-age-${editedVaccine.id}`}>Edad de Aplicación</Label>
                        <Input id={`vac-age-${editedVaccine.id}`} value={editedVaccine.applicationAge} onChange={(e) => handleFieldChange('applicationAge', e.target.value.toUpperCase())} placeholder="Ej. Al nacer"/>
                    </div>
                    <div className='space-y-2'>
                        <Label htmlFor={`vac-sex-${editedVaccine.id}`}>Sexo</Label>
                        <Input id={`vac-sex-${editedVaccine.id}`} value={editedVaccine.sex} onChange={(e) => handleFieldChange('sex', e.target.value.toUpperCase())} placeholder="Ej. Ambos"/>
                    </div>
                </div>
                <div className='space-y-2'>
                    <Label htmlFor={`vac-desc-${editedVaccine.id}`}>Descripción / Protección</Label>
                    <Textarea id={`vac-desc-${editedVaccine.id}`} value={editedVaccine.description} onChange={(e) => handleFieldChange('description', e.target.value.toUpperCase())} placeholder="Protege contra..."/>
                </div>
            </div>
            <DialogFooter>
                <DialogClose asChild>
                    <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
                </DialogClose>
                <Button type="button" onClick={() => onSave(editedVaccine)}>Guardar Cambios</Button>
            </DialogFooter>
        </DialogContent>
    );
}

export function VaccineSettingsManager() {
  const [settings, setSettings] = useState<VaccineSettings | null>(null);
  const [vaccines, setVaccines] = useState<Vaccine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, startSavingTransition] = useTransition();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedVaccine, setSelectedVaccine] = useState<Vaccine | null>(null);
  const { toast } = useToast();

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [settingsData, vaccinesData] = await Promise.all([
        getVaccineSettings(),
        getVaccines()
      ]);
      setSettings(settingsData);
      setVaccines(vaccinesData);
    } catch (error) {
      console.error('Failed to fetch vaccine settings:', error);
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
        while (current < end) {
            slots.push(current.toTimeString().substring(0, 5));
            current = new Date(current.getTime() + 10 * 60000); 
        }
    } catch (e) { return []; }
    return slots;
  }, [settings?.startTime, settings?.endTime]);

  const handleSettingsChange = (field: keyof VaccineSettings, value: string | number | boolean) => {
    if (settings) {
        setSettings({ ...settings, [field]: value });
    }
  };

  const handleEditClick = (vaccine: Vaccine) => {
    setSelectedVaccine(vaccine);
    setIsDialogOpen(true);
  }

  const handleAddNewClick = () => {
    const newVaccine: Vaccine = { id: uuidv4(), name: '', applicationAge: '', sex: 'Ambos', description: '', available: true };
    setSelectedVaccine(newVaccine);
    setIsDialogOpen(true);
  }

  const handleDialogSave = (updatedVaccine: Vaccine) => {
    const vaccineExists = vaccines.some(v => v.id === updatedVaccine.id);
    if (vaccineExists) {
        setVaccines(vaccines.map(v => v.id === updatedVaccine.id ? updatedVaccine : v));
    } else {
        setVaccines([...vaccines, updatedVaccine]);
    }
    setIsDialogOpen(false);
    setSelectedVaccine(null);
  }

  const handleDialogCancel = () => {
      setIsDialogOpen(false);
      setSelectedVaccine(null);
  }

  const removeVaccine = (id: string) => {
    setVaccines(vaccines.filter(v => v.id !== id));
  };

  const handleSave = () => {
    if (!settings) return;
    startSavingTransition(async () => {
      const results = await Promise.all([
          updateVaccineSettings(settings),
          updateVaccines(vaccines)
      ]);
      if (results[0].success && results[1].success) {
        toast({ title: 'Configuración Guardada' });
        await fetchData();
      }
    });
  };

  if (isLoading || !settings) return <div className="p-20 flex justify-center"><Loader2 className="animate-spin h-10 w-10 text-primary" /></div>;

  return (
    <>
        <div className="space-y-8">
            <Card className="shadow-lg border-primary/10 overflow-hidden h-full flex flex-col">
                <CardHeader className="bg-muted/5 border-b shrink-0">
                    <CardTitle className="flex items-center gap-2 text-primary uppercase font-black">
                    <Settings className="h-5 w-5" /> Parámetros Operativos - Vacunación
                    </CardTitle>
                </CardHeader>
                <ScrollArea className="flex-1">
                    <CardContent className="space-y-8 p-6">
                        <div className="space-y-6">
                            <h3 className="font-semibold text-lg flex items-center gap-2 text-primary"><CalendarClock className="h-5 w-5"/> Horarios y Cupos</h3>
                            <div className='grid sm:grid-cols-2 lg:grid-cols-4 gap-4'>
                                <div className='space-y-2'>
                                    <Label htmlFor="vaccine-slots">Citas por día</Label>
                                    <Input id="vaccine-slots" type="number" value={settings.dailySlots} onChange={(e) => handleSettingsChange('dailySlots', parseInt(e.target.value,10) || 0)} />
                                </div>
                                <div className='space-y-2'>
                                    <Label htmlFor="vaccine-waitlist">Lista de Espera</Label>
                                    <Input id="vaccine-waitlist" type="number" value={settings.waitlistSlots || 0} onChange={(e) => handleSettingsChange('waitlistSlots', parseInt(e.target.value,10) || 0)} />
                                </div>
                                <div className='space-y-2'>
                                    <Label htmlFor="vaccine-start">Hora Inicio</Label>
                                    <Select value={settings.startTime} onValueChange={(value) => handleSettingsChange('startTime', value)}>
                                        <SelectTrigger id="vaccine-start"><SelectValue /></SelectTrigger>
                                        <SelectContent>{timeSlots10Min.map(slot => <SelectItem key={`start-${slot.value}`} value={slot.value}>{slot.label}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                <div className='space-y-2'>
                                    <Label htmlFor="vaccine-end">Hora Fin</Label>
                                    <Select value={settings.endTime} onValueChange={(value) => handleSettingsChange('endTime', value)}>
                                        <SelectTrigger id="vaccine-end"><SelectValue /></SelectTrigger>
                                        <SelectContent>{timeSlots10Min.map(slot => <SelectItem key={`end-${slot.value}`} value={slot.value}>{slot.label}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="grid sm:grid-cols-2 gap-4">
                                <div className='space-y-2'>
                                    <Label htmlFor="vaccine-break">Tiempo de Descanso</Label>
                                    <Select value={settings.breakTime || ''} onValueChange={(value) => handleSettingsChange('breakTime', value === 'none' ? '' : value)}>
                                        <SelectTrigger id="vaccine-break"><SelectValue placeholder="Seleccionar descanso..." /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Sin Descanso</SelectItem>
                                            {dynamicBreakSlots.map(slot => (<SelectItem key={`break-${slot}`} value={slot}>{slot}</SelectItem>))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex items-center space-x-2 pt-8">
                                    <Switch id="vaccine-weekend" checked={settings.weekendBookingEnabled} onCheckedChange={(checked) => handleSettingsChange('weekendBookingEnabled', checked)} />
                                    <Label htmlFor="vaccine-weekend">Permitir citas en fin de semana</Label>
                                </div>
                            </div>
                        </div>

                        <Separator />

                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="font-semibold text-lg flex items-center gap-2 text-primary"><ShieldPlus className="h-5 w-5"/> Catálogo de Vacunas</h3>
                                <Button onClick={handleAddNewClick} size="sm" className="bg-primary hover:bg-primary/90"><PlusCircle className="mr-2 h-4 w-4" />Agregar Vacuna</Button>
                            </div>
                            <div className="border rounded-xl bg-card shadow-inner overflow-hidden">
                                <ScrollArea className="h-[300px]">
                                    <Table>
                                        <TableHeader className="bg-muted/50 sticky top-0 z-10">
                                            <TableRow>
                                                <TableHead>Biológico</TableHead>
                                                <TableHead>Edad Aplicación</TableHead>
                                                <TableHead>Estado</TableHead>
                                                <TableHead className="text-right">Acciones</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {vaccines.map(vaccine => (
                                                <TableRow key={vaccine.id} className="hover:bg-muted/30">
                                                    <TableCell>
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-xs uppercase leading-tight">{vaccine.name}</span>
                                                            <span className="text-[10px] text-muted-foreground line-clamp-1 italic mt-0.5">{vaccine.description}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-[10px] font-bold uppercase">{vaccine.applicationAge}</TableCell>
                                                    <TableCell>
                                                        <Badge variant={vaccine.available ? 'secondary' : 'outline'} className="text-[10px] font-black uppercase">
                                                            {vaccine.available ? 'Sí' : 'No'}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex justify-end gap-1">
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600" onClick={() => handleEditClick(vaccine)}><Pencil className="h-3.5 w-3.5" /></Button>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeVaccine(vaccine.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </ScrollArea>
                            </div>
                        </div>
                    </CardContent>
                </ScrollArea>
                <CardFooter className="bg-muted/5 border-t pt-6 shrink-0">
                    <Button onClick={handleSave} disabled={isSaving} className="w-full h-14 font-black uppercase shadow-lg bg-primary hover:bg-primary/90 text-white">
                        {isSaving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Save className="mr-5 h-5 w-5" />}
                        GUARDAR CONFIGURACIÓN DE VACUNACIÓN
                    </Button>
                </CardFooter>
            </Card>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            {selectedVaccine && (
                <VaccineEditDialog
                    vaccine={selectedVaccine}
                    onSave={handleDialogSave}
                    onCancel={handleDialogCancel}
                />
            )}
        </Dialog>
    </>
  );
}


'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
    Stethoscope, 
    Baby, 
    ClipboardList, 
    HeartPulse, 
    ShieldCheck, 
    Loader2, 
    Save, 
    CalendarDays,
    Search,
    FilePlus,
    Activity,
    Users,
    AlertTriangle,
    CheckCircle2,
    X,
    Command
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { saveMedicalConsultation, getConsultationByAppointmentId, searchCie10 } from '@/lib/actions';
import type { Appointment, Clinic, MedicalConsultation, Cie10Record, Patient } from '@/lib/definitions';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { CreatePrescriptionDialog } from './create-prescription-dialog';

const formSchema = z.object({
  service: z.string().min(1, 'El servicio es requerido'),
  weight: z.coerce.number().optional(),
  height: z.coerce.number().optional(),
  waist: z.coerce.number().optional(),
  systolicBP: z.coerce.number().optional(),
  diastolicBP: z.coerce.number().optional(),
  heartRate: z.coerce.number().optional(),
  respiratoryRate: z.coerce.number().optional(),
  temperature: z.coerce.number().optional(),
  oxygenSaturation: z.coerce.number().optional(),
  glucose: z.coerce.number().optional(),
  fastingGlucose: z.boolean().default(false),
  tbSymptomatic: z.string().optional(),
  firstTimeOfYear: z.boolean().default(false),
  motiveRelation: z.string().min(1, 'Motivo requerido'),
  diagnosis1: z.string().min(1, 'Descripción requerida'),
  diagnosis1Code: z.string().min(1, 'Código requerido'),
  diagnosis1Type: z.string().default('Subsecuente'),
  diagnosis2: z.string().optional(),
  diagnosis2Code: z.string().optional(),
  diagnosis2Type: z.string().optional(),
  diagnosis3: z.string().optional(),
  diagnosis3Code: z.string().optional(),
  diagnosis3Type: z.string().optional(),
  mentalHealthAction: z.string().optional(),
  recipeFolio: z.string().optional(),
  
  // Pregnancy Control
  pregestationalCare: z.enum(['Primera vez', 'Subsecuente']).optional(),
  pregestationalRisk: z.string().optional(),
  pregnancyTrimester: z.string().optional(),
  pregnancyHighRisk: z.boolean().default(false),
  pregnancyComplications: z.array(z.string()).default([]),
  pregnancyActions: z.array(z.string()).default([]),
  
  // Obstetric Attention (Event)
  obstetricAttentionDate: z.string().optional(),
  obstetricAttentionTime: z.string().optional(),
  gestationalWeeks: z.coerce.number().optional(),
  obstetricAttentionType: z.string().optional(),
  abortionType: z.string().optional(),
  freePositionChosen: z.string().optional(),
  verticalExpulsivePeriod: z.string().optional(),
  psychologicalAccompaniment: z.string().optional(),
  activeThirdPeriodManagement: z.string().optional(),
  nonPharmacologicalMeasures: z.string().optional(),
  delayedCordClamping: z.string().optional(),
  birthType: z.string().optional(),
  withProduct: z.string().optional(),
  familyPlanningMethods: z.array(z.string()).default([]),

  // Puerperium
  puerperiumType: z.enum(['Puérpera 1ra', 'Puérpera Sub']).optional(),
  puerperiumInfection: z.boolean().default(false),
  puerperiumPlanning: z.boolean().default(false),
  otherEvents: z.array(z.string()).default([]),
  
  // Promotion & Referral
  vsoPackets: z.coerce.number().default(0),
  lifeLine: z.boolean().default(false),
  healthCard: z.boolean().default(false),
  vaccinationComplete: z.boolean().default(false),
  referredBy: z.string().optional(),
  counterReferred: z.boolean().default(false),
  telemedicineRole: z.string().optional(),
  telemedicineStudies: z.boolean().default(false),
  nextAppointmentDate: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function MedicalConsultationDialog({ 
    appointment, 
    clinic, 
    isOpen, 
    onClose, 
    onSuccess 
}: { 
    appointment: Appointment; 
    clinic: Clinic; 
    isOpen: boolean; 
    onClose: () => void;
    onSuccess: () => void;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isPrescriptionDialogOpen, setIsPrescriptionDialogOpen] = useState(false);
  const [consultationId, setConsultationId] = useState<string | null>(null);
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      service: clinic.clinicType || 'Consulta Externa',
      pregnancyComplications: [],
      pregnancyActions: [],
      familyPlanningMethods: [],
      otherEvents: [],
      vsoPackets: 0,
      motiveRelation: 'Subsecuente',
      diagnosis1Type: 'Subsecuente',
      diagnosis1: '',
      diagnosis1Code: '',
      diagnosis2: '',
      diagnosis2Code: '',
      diagnosis3: '',
      diagnosis3Code: '',
      recipeFolio: '',
      referredBy: '',
      nextAppointmentDate: '',
      obstetricAttentionDate: '',
      obstetricAttentionTime: '',
    },
  });

  const weight = form.watch('weight');
  const height = form.watch('height');
  const [imc, setImc] = useState<number | null>(null);

  useEffect(() => {
    if (weight && height) {
      const hMeter = height / 100;
      const calculatedImc = weight / (hMeter * hMeter);
      setImc(parseFloat(calculatedImc.toFixed(1)));
    } else {
      setImc(null);
    }
  }, [weight, height]);

  useEffect(() => {
    if (isOpen) {
      setIsInitialLoading(true);
      getConsultationByAppointmentId(appointment.id).then(existing => {
        if (existing) {
          setConsultationId(existing.id);
          form.reset({
              ...existing as any,
              vsoPackets: existing.vsoPackets || 0,
              diagnosis1: existing.diagnosis1 || '',
              diagnosis1Code: existing.diagnosis1Code || '',
              diagnosis2: existing.diagnosis2 || '',
              diagnosis2Code: existing.diagnosis2Code || '',
              diagnosis3: existing.diagnosis3 || '',
              diagnosis3Code: existing.diagnosis3Code || '',
              recipeFolio: existing.recipeFolio || '',
              referredBy: existing.referredBy || '',
              nextAppointmentDate: existing.nextAppointmentDate || '',
              familyPlanningMethods: existing.familyPlanningMethods || [],
              pregnancyComplications: existing.pregnancyComplications || [],
              pregnancyActions: existing.pregnancyActions || [],
              otherEvents: existing.otherEvents || [],
          });
        }
        setIsInitialLoading(false);
      });
    }
  }, [isOpen, appointment.id, form]);

  const onSubmit = async (values: FormValues, isFinal: boolean) => {
    setIsSaving(true);
    try {
      const res = await saveMedicalConsultation({
        ...values,
        id: consultationId || undefined,
        appointmentId: appointment.id,
        patientId: appointment.patientId,
        clinicId: clinic.id,
        doctorName: clinic.doctorName,
        date: new Date().toISOString(),
        imc: imc || undefined,
        isFinal
      });

      if (res.success) {
        setConsultationId(res.id);
        toast({ 
            title: isFinal ? 'Consulta Finalizada' : 'Avance Guardado', 
            description: isFinal ? 'El registro ha sido cerrado.' : 'Los cambios han sido guardados exitosamente.' 
        });
        
        if (isFinal) {
            onSuccess();
            onClose();
        }
      } else {
        toast({ title: 'Error al guardar', description: res.message, variant: 'destructive' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const familyPlanningOptions = [
      { id: 'DIU Normal', label: 'DIU Normal' },
      { id: 'DIU Medicado', label: 'DIU Medicado' },
      { id: 'OTB', label: 'OTB' },
      { id: 'Oral', label: 'Oral' },
      { id: 'Inyectable Mensual', label: 'Inyectable Mensual' },
      { id: 'Inyectable Bimestral', label: 'Inyectable Bimestral' },
      { id: 'Inyectable Trimestral', label: 'Inyectable Trimestral' },
      { id: 'Implante Dérmico', label: 'Implante Dérmico' },
      { id: 'Implante Subdérmico', label: 'Implante Subdérmico' },
      { id: 'Parche', label: 'Parche' }
  ];

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[95vw] h-[95vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-2 border-b bg-muted/20">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <DialogTitle className="flex items-center gap-2 text-2xl font-black uppercase">
                  <Stethoscope className="h-7 w-7 text-primary" /> Registro de Consulta Médica
                </DialogTitle>
                <DialogDescription className="text-sm font-bold">
                  Paciente: {appointment.patient.name} {appointment.patient.paternalLastName} ({appointment.patient.age} años)
                </DialogDescription>
              </div>
              <div className="flex flex-col items-end gap-1">
                  <Badge variant="outline" className="font-mono text-[10px] bg-background">FOLIO: {appointment.appointmentNumber}</Badge>
                  <Badge className="bg-primary/10 text-primary border-primary/20">{clinic.name}</Badge>
              </div>
            </div>
          </DialogHeader>

          {isInitialLoading ? (
              <div className="flex-1 flex items-center justify-center">
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
              </div>
          ) : (
              <Form {...form}>
              <form className="flex-1 flex flex-col min-h-0">
                  <Tabs defaultValue="externa" className="flex-1 flex flex-col min-h-0">
                      <div className="px-6 border-b bg-muted/5">
                          <TabsList className="bg-transparent h-12 w-full justify-start gap-4">
                              <TabsTrigger value="externa" className="data-[state=active]:bg-primary data-[state=active]:text-white font-bold h-10 px-6 rounded-t-lg">
                                  <ClipboardList className="mr-2 h-4 w-4" /> 1. Consulta Externa
                              </TabsTrigger>
                              <TabsTrigger value="obstetrica" className="data-[state=active]:bg-primary data-[state=active]:text-white font-bold h-10 px-6 rounded-t-lg">
                                  <Baby className="mr-2 h-4 w-4" /> 2. Atención Obstétrica
                              </TabsTrigger>
                              <TabsTrigger value="promocion" className="data-[state=active]:bg-primary data-[state=active]:text-white font-bold h-10 px-6 rounded-t-lg">
                                  <ShieldCheck className="mr-2 h-4 w-4" /> 3. Promoción y Referencia
                              </TabsTrigger>
                          </TabsList>
                      </div>

                      <ScrollArea className="flex-1">
                          <div className="p-8 pb-20">
                              <TabsContent value="externa" className="mt-0 space-y-10">
                                  <section className="space-y-4">
                                      <h3 className="text-sm font-black text-primary uppercase tracking-widest flex items-center gap-2">
                                          <HeartPulse className="h-5 w-5" /> Signos Vitales y Somatometría
                                      </h3>
                                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-6 bg-muted/10 p-6 rounded-2xl border border-dashed">
                                          <FormField control={form.control} name="weight" render={({ field }) => (
                                              <FormItem><FormLabel className="text-xs">Peso (kg)</FormLabel><FormControl><Input type="number" step="0.1" {...field} value={field.value ?? ''} className="h-10 font-bold"/></FormControl></FormItem>
                                          )} />
                                          <FormField control={form.control} name="height" render={({ field }) => (
                                              <FormItem><FormLabel className="text-xs">Talla (cm)</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} className="h-10 font-bold"/></FormControl></FormItem>
                                          )} />
                                          <div className="space-y-2">
                                              <Label className="text-xs">IMC (Calculado)</Label>
                                              <div className={cn("h-10 flex items-center justify-center rounded-md border font-black", imc && imc >= 30 ? "bg-red-100 text-red-700" : imc ? "bg-green-100 text-green-700" : "bg-muted/50")}>
                                                  {imc || '---'}
                                              </div>
                                          </div>
                                          <FormField control={form.control} name="waist" render={({ field }) => (
                                              <FormItem><FormLabel className="text-xs">Cintura (cm)</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} className="h-10 font-bold"/></FormControl></FormItem>
                                          )} />
                                          <div className="col-span-2 grid grid-cols-2 gap-2">
                                              <FormField control={form.control} name="systolicBP" render={({ field }) => (
                                                  <FormItem><FormLabel className="text-[10px]">T.A. Sistólica</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} className="h-10 font-bold"/></FormControl></FormItem>
                                              )} />
                                              <FormField control={form.control} name="diastolicBP" render={({ field }) => (
                                                  <FormItem><FormLabel className="text-[10px]">T.A. Diastólica</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} className="h-10 font-bold"/></FormControl></FormItem>
                                              )} />
                                          </div>
                                          <FormField control={form.control} name="heartRate" render={({ field }) => (
                                              <FormItem><FormLabel className="text-xs">FC (lpm)</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} className="h-10 font-bold"/></FormControl></FormItem>
                                          )} />
                                          <FormField control={form.control} name="respiratoryRate" render={({ field }) => (
                                              <FormItem><FormLabel className="text-xs">FR (rpm)</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} className="h-10 font-bold"/></FormControl></FormItem>
                                          )} />
                                          <FormField control={form.control} name="temperature" render={({ field }) => (
                                              <FormItem><FormLabel className="text-xs">Temp (°C)</FormLabel><FormControl><Input type="number" step="0.1" {...field} value={field.value ?? ''} className="h-10 font-bold"/></FormControl></FormItem>
                                          )} />
                                          <FormField control={form.control} name="oxygenSaturation" render={({ field }) => (
                                              <FormItem><FormLabel className="text-xs">SatO2 (%)</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} className="h-10 font-bold"/></FormControl></FormItem>
                                          )} />
                                          <FormField control={form.control} name="glucose" render={({ field }) => (
                                              <FormItem><FormLabel className="text-xs">Glucemia</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} className="h-10 font-bold"/></FormControl></FormItem>
                                          )} />
                                          <FormField control={form.control} name="fastingGlucose" render={({ field }) => (
                                              <FormItem className="flex flex-row items-center space-x-2 space-y-0 pt-8">
                                                  <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                                  <FormLabel className="text-[10px]">En ayunas</FormLabel>
                                              </FormItem>
                                          )} />
                                      </div>
                                  </section>

                                  <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
                                      <FormField control={form.control} name="service" render={({ field }) => (
                                          <FormItem>
                                              <FormLabel className="font-bold">Servicio</FormLabel>
                                              <Select onValueChange={field.onChange} value={field.value}>
                                                  <FormControl><SelectTrigger className="h-11"><SelectValue /></SelectTrigger></FormControl>
                                                  <SelectContent>
                                                      <SelectItem value="Consulta Externa">Consulta Externa</SelectItem>
                                                      <SelectItem value="Especializada">Consulta Especializada</SelectItem>
                                                      <SelectItem value="Salud Mental">Salud Mental</SelectItem>
                                                      <SelectItem value="Urgencias">Urgencias</SelectItem>
                                                  </SelectContent>
                                              </Select>
                                          </FormItem>
                                      )} />
                                      <FormField control={form.control} name="motiveRelation" render={({ field }) => (
                                          <FormItem>
                                              <FormLabel className="font-bold">Relación Temporal con el Motivo</FormLabel>
                                              <Select onValueChange={field.onChange} value={field.value}>
                                                  <FormControl><SelectTrigger className="h-11"><SelectValue /></SelectTrigger></FormControl>
                                                  <SelectContent>
                                                      <SelectItem value="Primera vez">Primera vez</SelectItem>
                                                      <SelectItem value="Subsecuente">Subsecuente</SelectItem>
                                                  </SelectContent>
                                              </Select>
                                          </FormItem>
                                      )} />
                                      <FormField control={form.control} name="firstTimeOfYear" render={({ field }) => (
                                          <FormItem className="flex flex-row items-center space-x-3 space-y-0 p-4 border rounded-xl bg-muted/5 mt-6">
                                              <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                              <div className="space-y-1 leading-none">
                                                  <FormLabel className="font-bold">Primera vez en el año</FormLabel>
                                              </div>
                                          </FormItem>
                                      )} />
                                  </section>

                                  <Separator />

                                  <section className="space-y-6">
                                      <h3 className="text-sm font-black text-primary uppercase tracking-widest flex items-center gap-2">
                                          <Search className="h-5 w-5" /> Registro de Diagnósticos (CIE-10)
                                      </h3>
                                      <div className="grid gap-6">
                                          {[1, 2, 3].map(n => (
                                              <Cie10DiagnosisSelector 
                                                key={n} 
                                                number={n} 
                                                form={form} 
                                                patient={appointment.patient}
                                              />
                                          ))}
                                      </div>
                                  </section>

                                  <section className="grid sm:grid-cols-2 gap-8">
                                      <FormField control={form.control} name="mentalHealthAction" render={({ field }) => (
                                          <FormItem>
                                              <FormLabel className="font-bold">Acciones de Salud Mental</FormLabel>
                                              <Select onValueChange={field.onChange} value={field.value}>
                                                  <FormControl><SelectTrigger className="h-11"><SelectValue placeholder="Seleccionar acción..." /></SelectTrigger></FormControl>
                                                  <SelectContent>
                                                      <SelectItem value="Detección Depresión">Detección Depresión</SelectItem>
                                                      <SelectItem value="Detección Violencia">Detección Violencia</SelectItem>
                                                      <SelectItem value="Adicciones">Adicciones</SelectItem>
                                                      <SelectItem value="Ninguna">Ninguna</SelectItem>
                                                  </SelectContent>
                                              </Select>
                                          </FormItem>
                                      )} />
                                      <FormField control={form.control} name="recipeFolio" render={({ field }) => (
                                          <FormItem>
                                              <FormLabel className="font-black text-primary">Folio de Receta</FormLabel>
                                              <div className="flex gap-2">
                                                <FormControl>
                                                    <Input placeholder="Folio receta..." {...field} value={field.value ?? ''} className="h-11 bg-muted/5 font-bold" />
                                                </FormControl>
                                                <Button type="button" variant="secondary" className="h-11 font-black bg-blue-600 text-white hover:bg-blue-700" onClick={() => setIsPrescriptionDialogOpen(true)}>
                                                    <FilePlus className="mr-2 h-5 w-5" /> DIGITAL
                                                </Button>
                                              </div>
                                          </FormItem>
                                      )} />
                                  </section>
                              </TabsContent>

                              <TabsContent value="obstetrica" className="mt-0 space-y-12">
                                  {/* ATENCIÓN DEL EVENTO (PARTO/ABORTO) */}
                                  <section className="space-y-6">
                                      <h3 className="text-sm font-black text-primary uppercase tracking-widest flex items-center gap-2">
                                          <Activity className="h-5 w-5" /> Atención del Evento (Parto / Aborto)
                                      </h3>
                                      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 bg-muted/10 p-6 rounded-2xl border border-dashed">
                                          <FormField control={form.control} name="obstetricAttentionDate" render={({ field }) => (
                                              <FormItem><FormLabel className="text-xs font-bold">Fecha de Atención</FormLabel><FormControl><Input type="date" {...field} value={field.value ?? ''} className="h-10"/></FormControl></FormItem>
                                          )} />
                                          <FormField control={form.control} name="obstetricAttentionTime" render={({ field }) => (
                                              <FormItem><FormLabel className="text-xs font-bold">Hora de Atención</FormLabel><FormControl><Input type="time" {...field} value={field.value ?? ''} className="h-10"/></FormControl></FormItem>
                                          )} />
                                          <FormField control={form.control} name="gestationalWeeks" render={({ field }) => (
                                              <FormItem><FormLabel className="text-xs font-bold">Semanas Gestación</FormLabel><FormControl><Input type="number" min={0} max={45} {...field} value={field.value ?? ''} className="h-10 font-bold"/></FormControl></FormItem>
                                          )} />
                                          <FormField control={form.control} name="obstetricAttentionType" render={({ field }) => (
                                              <FormItem>
                                                  <FormLabel className="text-xs font-bold">Atención</FormLabel>
                                                  <Select onValueChange={field.onChange} value={field.value}>
                                                      <FormControl><SelectTrigger className="h-10"><SelectValue placeholder="Seleccionar..." /></SelectTrigger></FormControl>
                                                      <SelectContent>
                                                          <SelectItem value="Parto Normal">Parto Normal</SelectItem>
                                                          <SelectItem value="Cesárea">Cesárea</SelectItem>
                                                          <SelectItem value="Aborto">Aborto</SelectItem>
                                                          <SelectItem value="Legrado">Legrado</SelectItem>
                                                      </SelectContent>
                                                  </Select>
                                              </FormItem>
                                          )} />
                                      </div>

                                      <div className="grid lg:grid-cols-2 gap-8">
                                          <Card className="shadow-sm">
                                              <CardHeader className="bg-muted/10 pb-4"><CardTitle className="text-xs uppercase">Detalles del Evento</CardTitle></CardHeader>
                                              <CardContent className="pt-6 space-y-4">
                                                  <FormField control={form.control} name="abortionType" render={({ field }) => (
                                                      <FormItem>
                                                          <FormLabel className="text-[10px] font-bold">Aborto (&lt;500gr / 22 sem)</FormLabel>
                                                          <Select onValueChange={field.onChange} value={field.value}>
                                                              <FormControl><SelectTrigger className="h-10"><SelectValue placeholder="Tipo de aborto..." /></SelectTrigger></FormControl>
                                                              <SelectContent>
                                                                  <SelectItem value="IVE">IVE (Interrupción Voluntaria)</SelectItem>
                                                                  <SelectItem value="ILE">ILE (Interrupción Legal)</SelectItem>
                                                                  <SelectItem value="Espontáneo">Espontáneo</SelectItem>
                                                                  <SelectItem value="Otras causas">Otras causas</SelectItem>
                                                              </SelectContent>
                                                          </Select>
                                                      </FormItem>
                                                  )} />
                                                  <div className="grid grid-cols-2 gap-4">
                                                      <FormField control={form.control} name="birthType" render={({ field }) => (
                                                          <FormItem>
                                                              <FormLabel className="text-[10px] font-bold">Tipo de Parto</FormLabel>
                                                              <Select onValueChange={field.onChange} value={field.value}>
                                                                  <FormControl><SelectTrigger className="h-10"><SelectValue placeholder="Elegir..." /></SelectTrigger></FormControl>
                                                                  <SelectContent>
                                                                      <SelectItem value="Eutócico">Eutócico</SelectItem>
                                                                      <SelectItem value="Distócico">Distócico</SelectItem>
                                                                  </SelectContent>
                                                              </Select>
                                                          </FormItem>
                                                      )} />
                                                      <FormField control={form.control} name="withProduct" render={({ field }) => (
                                                          <FormItem>
                                                              <FormLabel className="text-[10px] font-bold">Con Producto</FormLabel>
                                                              <Select onValueChange={field.onChange} value={field.value}>
                                                                  <FormControl><SelectTrigger className="h-10"><SelectValue placeholder="Elegir..." /></SelectTrigger></FormControl>
                                                                  <SelectContent>
                                                                      <SelectItem value="Vivo">Vivo</SelectItem>
                                                                      <SelectItem value="Muerto">Mortinato</SelectItem>
                                                                  </SelectContent>
                                                              </Select>
                                                          </FormItem>
                                                      )} />
                                                  </div>
                                              </CardContent>
                                          </Card>

                                          <Card className="shadow-sm border-blue-100">
                                              <CardHeader className="bg-blue-50/50 pb-4"><CardTitle className="text-xs uppercase text-blue-700">Humanización del Parto</CardTitle></CardHeader>
                                              <CardContent className="pt-6 grid grid-cols-2 gap-x-6 gap-y-3">
                                                  {[
                                                      { id: 'freePositionChosen', label: 'Posición libre', opts: ['Si', 'No'] },
                                                      { id: 'verticalExpulsivePeriod', label: 'Expulsivo vertical', opts: ['Si', 'No'] },
                                                      { id: 'psychologicalAccompaniment', label: 'Acompañamiento psic.', opts: ['Si', 'No'] },
                                                      { id: 'activeThirdPeriodManagement', label: 'Manejo activo 3er P.', opts: ['Si', 'No'] },
                                                      { id: 'nonPharmacologicalMeasures', label: 'Medidas no farmac.', opts: ['Si', 'No'] },
                                                      { id: 'delayedCordClamping', label: 'Corte tardío cordón', opts: ['Si', 'No'] },
                                                  ].map(item => (
                                                      <FormField key={item.id} control={form.control} name={item.id as any} render={({ field }) => (
                                                          <FormItem className="space-y-1">
                                                              <FormLabel className="text-[10px] font-bold">{item.label}</FormLabel>
                                                              <Select onValueChange={field.onChange} value={field.value}>
                                                                  <FormControl><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger></FormControl>
                                                                  <SelectContent>
                                                                      {item.opts.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                                                                  </SelectContent>
                                                              </Select>
                                                          </FormItem>
                                                      )} />
                                                  ))}
                                              </CardContent>
                                          </Card>
                                      </div>
                                  </section>

                                  <div className="grid lg:grid-cols-2 gap-10">
                                      <Card className="border-green-100 shadow-sm overflow-hidden">
                                          <CardHeader className="bg-green-50 pb-4">
                                              <CardTitle className="text-base uppercase tracking-tight text-green-700 flex items-center gap-2">
                                                  <Users className="h-4 w-4" /> Planificación Familiar Post-Evento
                                              </CardTitle>
                                          </CardHeader>
                                          <CardContent className="pt-6">
                                              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                                  {familyPlanningOptions.map(method => (
                                                      <div key={method.id} className="flex items-center space-x-2 p-2 hover:bg-muted/50 rounded-lg transition-colors border border-transparent hover:border-border">
                                                          <Checkbox 
                                                              id={`method-${method.id}`} 
                                                              checked={form.watch('familyPlanningMethods')?.includes(method.id)} 
                                                              onCheckedChange={(checked) => {
                                                                  const current = form.getValues('familyPlanningMethods') || [];
                                                                  form.setValue('familyPlanningMethods', checked ? [...current, method.id] : current.filter(m => m !== method.id));
                                                              }}
                                                          />
                                                          <Label htmlFor={`method-${method.id}`} className="text-xs font-medium cursor-pointer">{method.label}</Label>
                                                      </div>
                                                  ))}
                                              </div>
                                          </CardContent>
                                      </Card>

                                      <div className="space-y-6">
                                          <Card className="border-primary/10 shadow-sm overflow-hidden">
                                              <CardHeader className="bg-primary/5 pb-4">
                                                  <CardTitle className="text-base uppercase tracking-tight">Atención Pregestacional</CardTitle>
                                              </CardHeader>
                                              <CardContent className="pt-6 space-y-6">
                                                  <FormField control={form.control} name="pregestationalCare" render={({ field }) => (
                                                      <FormItem className="space-y-3">
                                                          <FormControl>
                                                              <RadioGroup onValueChange={field.onChange} value={field.value} className="flex gap-4">
                                                                  <div className="flex items-center space-x-2"><RadioGroupItem value="Primera vez" id="pg-1" /><Label htmlFor="pg-1">Primera vez</Label></div>
                                                                  <div className="flex items-center space-x-2"><RadioGroupItem value="Subsecuente" id="pg-2" /><Label htmlFor="pg-2">Subsecuente</Label></div>
                                                              </RadioGroup>
                                                          </FormControl>
                                                      </FormItem>
                                                  )} />
                                                  <FormField control={form.control} name="pregestationalRisk" render={({ field }) => (
                                                      <FormItem>
                                                          <FormLabel className="text-xs font-bold">Riesgo Detectado</FormLabel>
                                                          <Select onValueChange={field.onChange} value={field.value}>
                                                              <FormControl><SelectTrigger className="h-10"><SelectValue placeholder="Riesgo..." /></SelectTrigger></FormControl>
                                                              <SelectContent>
                                                                  <SelectItem value="Bajo">Bajo</SelectItem>
                                                                  <SelectItem value="Alto">Alto</SelectItem>
                                                                  <SelectItem value="Muy Alto">Muy Alto</SelectItem>
                                                              </SelectContent>
                                                          </Select>
                                                      </FormItem>
                                                  )} />
                                              </CardContent>
                                          </Card>
                                      </div>
                                  </div>

                                  <div className="grid lg:grid-cols-2 gap-10">
                                      <div className="space-y-6">
                                          <h4 className="text-xs font-black uppercase text-muted-foreground tracking-wider">Control de Puerperio</h4>
                                          <div className="space-y-4 p-6 border rounded-2xl bg-muted/5">
                                              <FormField control={form.control} name="puerperiumType" render={({ field }) => (
                                                  <FormItem>
                                                      <FormControl>
                                                          <RadioGroup onValueChange={field.onChange} value={field.value} className="flex gap-4">
                                                              <div className="flex items-center space-x-2"><RadioGroupItem value="Puérpera 1ra" id="p-1" /><Label htmlFor="p-1">Puérpera (1ra)</Label></div>
                                                              <div className="flex items-center space-x-2"><RadioGroupItem value="Puérpera Sub" id="p-2" /><Label htmlFor="p-2">Puérpera (Sub)</Label></div>
                                                          </RadioGroup>
                                                      </FormControl>
                                                  </FormItem>
                                              )} />
                                              <div className="flex gap-6 pt-2">
                                                  <FormField control={form.control} name="puerperiumInfection" render={({ field }) => (
                                                      <FormItem className="flex items-center space-x-2 space-y-0">
                                                          <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                                          <FormLabel className="text-xs">Con infección</FormLabel>
                                                      </FormItem>
                                                  )} />
                                                  <FormField control={form.control} name="puerperiumPlanning" render={({ field }) => (
                                                      <FormItem className="flex items-center space-x-2 space-y-0">
                                                          <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                                          <FormLabel className="text-xs">Aceptante Planif.</FormLabel>
                                                      </FormItem>
                                                  )} />
                                              </div>
                                          </div>
                                      </div>
                                      <div className="space-y-6">
                                          <h4 className="text-xs font-black uppercase text-muted-foreground tracking-wider">Otros Eventos</h4>
                                          <div className="grid grid-cols-2 gap-x-6 gap-y-4 p-6 border rounded-2xl bg-muted/5">
                                              {[
                                                  { id: 'hormonal', label: 'Terapia Hormonal' }, 
                                                  { id: 'menopause', label: 'Menopausia' }, 
                                                  { id: 'its', label: 'ITS' }, 
                                                  { id: 'mamaria', label: 'Patología Mamaria' }, 
                                                  { id: 'cancer', label: 'Detección Cáncer' },
                                                  { id: 'colposcopia', label: 'Colposcopía' }
                                              ].map(ev => (
                                                  <div key={ev.id} className="flex items-center space-x-2">
                                                      <Checkbox id={ev.id} checked={form.watch('otherEvents')?.includes(ev.id)} onCheckedChange={(v) => {
                                                              const cur = form.getValues('otherEvents') || [];
                                                              form.setValue('otherEvents', v ? [...cur, ev.id] : cur.filter(x => x !== ev.id));
                                                          }}
                                                      />
                                                      <Label htmlFor={ev.id} className="text-xs cursor-pointer">{ev.label}</Label>
                                                  </div>
                                              ))}
                                          </div>
                                      </div>
                                  </div>
                              </TabsContent>

                              <TabsContent value="promocion" className="mt-0 space-y-10">
                                  <section className="grid lg:grid-cols-2 gap-10">
                                      <div className="space-y-6">
                                          <h4 className="text-xs font-black uppercase text-muted-foreground tracking-wider">Promoción de la Salud</h4>
                                          <div className="grid gap-4 bg-muted/5 p-6 border rounded-2xl">
                                              <FormField control={form.control} name="vsoPackets" render={({ field }) => (
                                                  <FormItem className="flex items-center justify-between"><FormLabel>Sobres VSO Entregados</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? 0} className="w-24 text-center font-bold" /></FormControl></FormItem>
                                              )} />
                                              <FormField control={form.control} name="lifeLine" render={({ field }) => (
                                                  <FormItem className="flex items-center justify-between space-y-0"><FormLabel>Se otorgó Línea de Vida</FormLabel><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>
                                              )} />
                                              <FormField control={form.control} name="healthCard" render={({ field }) => (
                                                  <FormItem className="flex items-center justify-between space-y-0"><FormLabel>Presentó Cartilla</FormLabel><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>
                                              )} />
                                              <FormField control={form.control} name="vaccinationComplete" render={({ field }) => (
                                                  <FormItem className="flex items-center justify-between space-y-0"><FormLabel>Esquema Vacunación Completo</FormLabel><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>
                                              )} />
                                          </div>
                                      </div>
                                      <div className="space-y-6">
                                          <h4 className="text-xs font-black uppercase text-muted-foreground tracking-wider">Referencia y Telemedicina</h4>
                                          <div className="space-y-4 bg-muted/5 p-6 border rounded-2xl">
                                              <FormField control={form.control} name="referredBy" render={({ field }) => (
                                                  <FormItem><FormLabel className="text-[10px] font-bold uppercase">Referido por</FormLabel><Input placeholder="Unidad..." {...field} value={field.value ?? ''} className="h-10" /></FormItem>
                                              )} />
                                              <FormField control={form.control} name="counterReferred" render={({ field }) => (
                                                  <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="text-xs">CONTRARREFERIDO</FormLabel></FormItem>
                                              )} />
                                              <Separator className="my-4" />
                                              <FormField control={form.control} name="telemedicineRole" render={({ field }) => (
                                                  <FormItem>
                                                      <FormLabel className="text-[10px] font-bold uppercase">Rol Telemedicina</FormLabel>
                                                      <Select onValueChange={field.onChange} value={field.value}>
                                                          <FormControl><SelectTrigger className="h-10 text-xs"><SelectValue placeholder="Elegir..." /></SelectTrigger></FormControl>
                                                          <SelectContent>
                                                              <SelectItem value="Consultante">Unidad Consultante</SelectItem>
                                                              <SelectItem value="Interconsultante">Unidad Interconsultante</SelectItem>
                                                          </SelectContent>
                                                      </Select>
                                                  </FormItem>
                                              )} />
                                              <FormField control={form.control} name="telemedicineStudies" render={({ field }) => (
                                                  <FormItem className="flex items-center space-x-2 space-y-0">
                                                      <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                                      <Label className="text-xs">Se solicitaron estudios por telemedicina</Label>
                                                  </FormItem>
                                              )} />
                                          </div>
                                      </div>
                                  </section>

                                  <Separator />

                                  <section className="max-w-md mx-auto">
                                      <FormField control={form.control} name="nextAppointmentDate" render={({ field }) => (
                                          <FormItem><FormLabel className="font-bold flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" /> Próxima Cita Sugerida</FormLabel><FormControl><Input type="date" {...field} value={field.value ?? ''} className="h-11" /></FormControl></FormItem>
                                      )} />
                                  </section>
                              </TabsContent>
                          </div>
                      </ScrollArea>
                  </Tabs>

                  <DialogFooter className="p-6 border-t bg-muted/10 shrink-0 flex items-center justify-between sm:justify-between">
                    <Button type="button" variant="outline" onClick={onClose} disabled={isSaving} className="h-12 px-8">Cancelar</Button>
                    <div className="flex gap-4">
                        <Button 
                            type="button" 
                            variant="secondary"
                            onClick={() => form.handleSubmit((vals) => onSubmit(vals, false))()} 
                            disabled={isSaving} 
                            className="h-12 px-8 font-bold border-primary/20"
                        >
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            GUARDAR AVANCES
                        </Button>
                        <Button 
                            type="button" 
                            onClick={() => form.handleSubmit((vals) => onSubmit(vals, true))()} 
                            disabled={isSaving} 
                            className="h-12 px-10 font-black bg-primary hover:bg-primary/90 shadow-xl transition-all"
                        >
                            {isSaving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CheckCircle2 className="mr-2 h-5 w-5" />}
                            FINALIZAR CONSULTA
                        </Button>
                    </div>
                  </DialogFooter>
              </form>
              </Form>
          )}
        </DialogContent>
      </Dialog>

      {isPrescriptionDialogOpen && (
          <CreatePrescriptionDialog 
            isOpen={isPrescriptionDialogOpen}
            onClose={() => setIsPrescriptionDialogOpen(false)}
            clinic={clinic}
            initialPatient={appointment.patient}
            onPrescriptionCreated={(folio) => {
                form.setValue('recipeFolio', folio);
                setIsPrescriptionDialogOpen(false);
                toast({ title: 'Folio Actualizado', description: `Se vinculó la receta ${folio} a la consulta.` });
            }}
          />
      )}
    </>
  );
}

function Cie10DiagnosisSelector({ number, form, patient }: { number: number, form: any, patient: Patient }) {
    const [searchTerm, setSearchTerm] = useState(form.getValues(`diagnosis${number}`) || '');
    const [results, setResults] = useState<Cie10Record[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const { toast } = useToast();

    const isPrincipal = number === 1;
    const diagLabel = isPrincipal ? "PRINCIPAL" : `SECUNDARIO ${number - 1}`;

    // OPTIMIZACIÓN: Implementamos Debounce para evitar consultas a Firestore por cada letra
    useEffect(() => {
        const timer = setTimeout(() => {
            if (searchTerm.length >= 2) {
                handleSearch(searchTerm);
            } else if (searchTerm === '') {
                setResults([]);
                setIsOpen(false);
            }
        }, 600); // 600ms de espera antes de disparar la búsqueda

        return () => clearTimeout(timer);
    }, [searchTerm]);

    const validateDiagnosis = useCallback((record: Cie10Record): { valid: boolean; reason?: string } => {
        const isMujer = patient.sex === 'Mujer';
        const isHombre = patient.sex === 'Hombre';
        const isObstetricCode = record.catalogKey?.startsWith('O') || record.letra === 'O';
        
        if (isObstetricCode && isHombre) return { valid: false, reason: 'Código exclusivo para mujeres (Obstetricia)' };
        if (isObstetricCode && isMujer) return { valid: true };

        const sexLimit = String(record.lsex || '3').trim();
        if (sexLimit !== '3' && sexLimit !== '0' && sexLimit !== '' && sexLimit !== 'NO') {
            if (sexLimit === '1' && isMujer) return { valid: false, reason: `Incompatible con sexo: ${patient.sex}` };
            if (sexLimit === '2' && isHombre) return { valid: false, reason: `Incompatible con sexo: ${patient.sex}` };
        }

        const parseAgeLimit = (limit: string) => {
            if (!limit || limit.length < 2) return null;
            const unit = limit[0];
            const val = parseInt(limit.substring(1)) || 0;
            if (unit === '3') return val;
            if (unit === '2') return val / 12;
            if (unit === '1') return val / 365;
            return null;
        };

        const minAge = parseAgeLimit(record.linf);
        const maxAge = parseAgeLimit(record.lsup);
        if (minAge !== null && patient.age < minAge) return { valid: false, reason: 'Edad menor a la permitida' };
        if (maxAge !== null && patient.age > maxAge) return { valid: false, reason: 'Edad mayor a la permitida' };

        return { valid: true };
    }, [patient.sex, patient.age]);

    const handleSearch = async (val: string) => {
        setIsSearching(true);
        try {
            const data = await searchCie10(val);
            setResults(data);
            setIsOpen(true);
        } finally {
            setIsSearching(false);
        }
    };

    const handleCodeLookup = useCallback(async (code: string) => {
        if (!code || code.length < 3) return;
        setIsSearching(true);
        try {
            const data = await searchCie10(code);
            const exactMatch = data.find(r => r.catalogKey.toUpperCase() === code.toUpperCase());
            if (exactMatch) {
                const { valid, reason } = validateDiagnosis(exactMatch);
                if (valid) {
                    form.setValue(`diagnosis${number}`, exactMatch.nombre);
                    setSearchTerm(exactMatch.nombre);
                } else {
                    toast({ title: 'Incompatible', description: reason, variant: 'destructive' });
                }
            }
        } finally {
            setIsSearching(false);
        }
    }, [form, number, validateDiagnosis, toast]);

    const onSelect = (record: Cie10Record) => {
        const { valid, reason } = validateDiagnosis(record);
        if (!valid) {
            alert(`ATENCIÓN: Incompatible.\nMotivo: ${reason}`);
            return;
        }
        form.setValue(`diagnosis${number}`, record.nombre);
        form.setValue(`diagnosis${number}Code`, record.catalogKey);
        setSearchTerm(record.nombre);
        setIsOpen(false);
        setResults([]);
    };

    return (
        <div className={cn(
            "grid sm:grid-cols-6 gap-4 p-5 border rounded-2xl bg-background shadow-sm hover:border-primary/20 transition-all",
            isPrincipal ? "border-primary/20 bg-primary/5" : ""
        )}>
            <div className="col-span-full flex items-center justify-between mb-1">
                <Badge variant={isPrincipal ? "default" : "secondary"} className="text-[10px] font-black tracking-widest px-3">
                    {diagLabel}
                </Badge>
            </div>

            <div className="sm:col-span-1 space-y-1.5 relative">
                <Label className="text-[10px] font-black opacity-50 uppercase">Código {number}</Label>
                <FormField control={form.control} name={`diagnosis${number}Code`} render={({ field }) => (
                    <div className="relative">
                        <Input 
                            {...field} 
                            value={field.value ?? ''} 
                            className="bg-muted/30 font-mono font-bold text-primary h-11 uppercase" 
                            onChange={(e) => {
                                const val = e.target.value.toUpperCase();
                                field.onChange(val);
                                handleCodeLookup(val);
                            }}
                        />
                        {isSearching && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary opacity-50" />}
                    </div>
                )} />
            </div>
            <div className="sm:col-span-3 space-y-1.5 relative">
                <Label className="text-[10px] font-black opacity-50 uppercase">Descripción / Búsqueda {number}</Label>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                        placeholder={`Escribe nombre...`}
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value.toUpperCase())}
                        className="pl-9 pr-9 h-11 font-bold uppercase"
                    />
                    {isSearching && <Loader2 className="absolute right-10 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />}
                    {searchTerm && (
                        <button 
                            type="button"
                            onClick={() => setSearchTerm('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>

                {isOpen && results.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-popover border rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2">
                        <div className="p-2 bg-muted/50 border-b flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            <span>Resultados CIE-10</span>
                            <span className="flex items-center gap-1"><Command className="h-3 w-3" /> Selección por click</span>
                        </div>
                        {results.map(r => {
                            const { valid, reason } = validateDiagnosis(r);
                            return (
                                <div 
                                    key={r.id} 
                                    className={cn(
                                        "p-3 cursor-pointer border-b last:border-0 flex items-start justify-between gap-3",
                                        valid ? "hover:bg-accent" : "bg-red-50/50 opacity-60 grayscale cursor-not-allowed"
                                    )}
                                    onClick={() => valid && onSelect(r)}
                                >
                                    <div className="flex flex-col gap-0.5">
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className="font-mono text-[10px] bg-background">{r.catalogKey}</Badge>
                                            <span className="text-xs font-bold uppercase leading-tight">{r.nombre}</span>
                                        </div>
                                        {!valid && <span className="text-[9px] text-red-600 font-black flex items-center gap-1 mt-1"><AlertTriangle className="h-2.5 w-2.5" /> {reason}</span>}
                                    </div>
                                    {valid ? <CheckCircle2 className="h-4 w-4 text-green-600 mt-1 shrink-0" /> : <X className="h-4 w-4 text-red-400 mt-1 shrink-0" />}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            <div className="sm:col-span-2 space-y-1.5">
                <Label className="text-[10px] font-black opacity-50 uppercase">Tipo Diagnóstico</Label>
                <FormField control={form.control} name={`diagnosis${number}Type`} render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value || 'Subsecuente'}>
                        <FormControl><SelectTrigger className="h-11"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                            <SelectItem value="Primera vez">Primera vez</SelectItem>
                            <SelectItem value="Subsecuente">Subsecuente</SelectItem>
                        </SelectContent>
                    </Select>
                )} />
            </div>
        </div>
    );
}

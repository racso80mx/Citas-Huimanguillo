
'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useEffect, useTransition } from 'react';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { saveNewAppointment, getPatientByCURP, getAnnouncements, getModuleSettings } from '@/lib/actions';
import { Loader2, ChevronDown, Baby } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { parseCURP, calculateAge } from '@/lib/curp';
import estados from '@/lib/data/estados.json';
import { Combobox } from './ui/combobox';
import type { Appointment, Clinic, Patient } from '@/lib/definitions';
import { PatientType, PatientStatus } from '@/lib/definitions';
import { v4 as uuidv4 } from 'uuid';
import { format as formatDate, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { generateAppointmentPDF } from '@/lib/report-helpers';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import Image from 'next/image';
import { logoBase64 } from '@/lib/logo-data';


const curpRegex = /^[A-Z]{4}(\d{2})(\d{2})(\d{2})([HM])([A-Z]{2})[A-Z]{3}[A-Z0-9]\d$/;
const phoneRegex = /^\d{10}$/;


const baseSchema = z.object({
  name: z.string().min(2, 'El nombre es requerido.'),
  paternalLastName: z.string().min(2, 'El apellido paterno es requerido.'),
  maternalLastName: z.string().min(2, 'El apellido materno es requerido.'),
  phoneNumber: z.string().regex(phoneRegex, 'El número de teléfono debe tener 10 dígitos.'),
  sex: z.enum(['Hombre', 'Mujer']),
  age: z.number().min(0, 'La edad no puede ser negativa.'),
  birthDate: z.string().min(1, 'La fecha de nacimiento es requerida.'),
  fatherName: z.string().optional(),
  motherName: z.string().optional(),
  fatherAge: z.coerce.number().min(0, 'La edad no puede ser negativa').optional(),
  motherAge: z.coerce.number().min(0, 'La edad no puede ser negativa').optional(),
  derechoAbiencia: z.string().optional(),
});

const formSchemaWithCurp = baseSchema.extend({
  curp: z.string().regex(curpRegex, 'El formato de la CURP no es válido.'),
  birthState: z.string().min(1, 'El estado es requerido.'),
});

const formSchemaNewborn = baseSchema.extend({
  curp: z.string().optional(),
  birthState: z.string().optional(),
});


type BookingFormValues = z.infer<typeof formSchemaWithCurp>;

type BookingFormProps = {
  selectedDate: Date | undefined;
  selectedClinic: Clinic | undefined;
  selectedColoniaName: string | undefined;
  selectedTime: string | undefined;
  patientType: PatientType;
  isDoubleSlot: boolean;
  onBookingSuccess: (reset?: boolean) => void;
  announcements: string[];
  requireColonia: boolean;
  initialPatientData?: Patient | null;
  isDoctorBypass?: boolean;
};

export function BookingForm({
  selectedDate,
  selectedClinic,
  selectedColoniaName,
  selectedTime,
  patientType,
  isDoubleSlot,
  onBookingSuccess,
  announcements,
  requireColonia,
  initialPatientData,
  isDoctorBypass = false,
}: BookingFormProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const isNewborn = patientType === PatientType.RecienNacido;

  const form = useForm<BookingFormValues>({
    resolver: zodResolver(isNewborn ? formSchemaNewborn : formSchemaWithCurp),
    defaultValues: {
      curp: '',
      name: '',
      paternalLastName: '',
      maternalLastName: '',
      phoneNumber: '',
      sex: undefined,
      age: undefined,
      birthDate: '',
      birthState: '',
      fatherName: '',
      motherName: '',
      fatherAge: undefined,
      motherAge: undefined,
      derechoAbiencia: '',
    },
  });

  useEffect(() => {
    if (initialPatientData) {
        form.reset({
            curp: initialPatientData.curp ?? '',
            name: initialPatientData.name ?? '',
            paternalLastName: initialPatientData.paternalLastName ?? '',
            maternalLastName: initialPatientData.maternalLastName ?? '',
            phoneNumber: initialPatientData.phoneNumber ?? '',
            sex: initialPatientData.sex,
            age: initialPatientData.age,
            birthDate: initialPatientData.birthDate,
            birthState: initialPatientData.birthState,
            fatherName: initialPatientData.fatherName ?? '',
            motherName: initialPatientData.motherName ?? '',
            fatherAge: initialPatientData.fatherAge ?? undefined,
            motherAge: initialPatientData.motherAge ?? undefined,
            derechoAbiencia: initialPatientData.derechoAbiencia ?? '',
        });
    } else {
        form.reset();
    }
  }, [initialPatientData, form]);

  useEffect(() => {
    form.reset(form.getValues());
  }, [isNewborn, form]);

  const curp = form.watch('curp');

  const handleCurpBlur = async () => {
    if (initialPatientData) return;
    const curpValue = form.getValues('curp');
    if (!curpValue || isNewborn) return;
    const upperCurp = curpValue.toUpperCase().trim();

    if (curpRegex.test(upperCurp)) {
      startTransition(async () => {
        const result = await getPatientByCURP(upperCurp);
        if (result.success && result.data) {
          form.setValue('name', result.data.name, { shouldValidate: true });
          form.setValue('paternalLastName', result.data.paternalLastName, { shouldValidate: true });
          form.setValue('maternalLastName', result.data.maternalLastName, { shouldValidate: true });
          form.setValue('phoneNumber', result.data.phoneNumber, { shouldValidate: true });
          form.setValue('fatherName', result.data.fatherName ?? '', { shouldValidate: true });
          form.setValue('motherName', result.data.motherName ?? '', { shouldValidate: true });
          form.setValue('fatherAge', result.data.fatherAge ?? undefined, { shouldValidate: true });
          form.setValue('motherAge', result.data.motherAge ?? undefined, { shouldValidate: true });
          form.setValue('derechoAbiencia', result.data.derechoAbiencia ?? '', { shouldValidate: true });
           toast({
                title: 'Paciente Encontrado',
                description: 'Se han precargado tus datos.',
            });
        }
      });
    }
  };

  useEffect(() => {
    if (!isNewborn && curp && curp.length === 18 && curpRegex.test(curp.toUpperCase().trim())) {
      const data = parseCURP(curp.toUpperCase().trim());
      if (data) {
        form.setValue('sex', data.sex as 'Hombre' | 'Mujer');
        form.setValue('birthState', data.estadoNacimiento || 'NACIDO EN EL EXTRANJERO');
        form.setValue('age', calculateAge(data.birthDate));
        form.setValue('birthDate', formatDate(data.birthDate, 'yyyy-MM-dd'));
      }
    }
  }, [curp, form, isNewborn]);

  const onSubmit = (data: BookingFormValues) => {
    if (!selectedDate || !selectedClinic || !selectedTime) {
      toast({
        title: 'Error de validación',
        description: 'Por favor, selecciona una fecha, clínica y hora.',
        variant: 'destructive',
      });
      return;
    }
    
    if (requireColonia && !selectedColoniaName) {
      toast({
        title: 'Error de validación',
        description: 'Por favor, selecciona una colonia.',
        variant: 'destructive',
      });
      return;
    }


    startTransition(async () => {
      const settings = await getModuleSettings();
      const patientToSave: Omit<Patient, 'id'> = {
          curp: (data.curp || `RN-${uuidv4()}`).toUpperCase().trim(),
          name: data.name.toUpperCase().trim(),
          paternalLastName: data.paternalLastName.toUpperCase().trim(),
          maternalLastName: data.maternalLastName.toUpperCase().trim(),
          sex: data.sex,
          age: data.age || 0,
          birthDate: data.birthDate,
          birthState: data.birthState || "No especificado",
          phoneNumber: data.phoneNumber,
          coloniaName: selectedColoniaName,
          status: initialPatientData?.status || PatientStatus.Vigente,
          fatherName: data.fatherName?.toUpperCase().trim() || null,
          motherName: data.motherName?.toUpperCase().trim() || null,
          fatherAge: data.fatherAge || null,
          motherAge: data.motherAge || null,
          registrationDate: initialPatientData?.registrationDate || formatDate(new Date(), 'yyyy-MM-dd'),
          derechoAbiencia: data.derechoAbiencia?.toUpperCase().trim() || null,
          expediente: initialPatientData?.expediente || null
      };

      const newAppointmentData: Omit<Appointment, 'id' | 'patientId' | 'patient' | 'appointmentNumber' | 'coloniaName'> = {
        clinicId: selectedClinic.id,
        date: selectedDate.toISOString(),
        time: selectedTime,
        patientType: patientType,
        status: isDoctorBypass ? 'Atendido' : 'Agendada',
      };

      const result = await saveNewAppointment(newAppointmentData, patientToSave, isDoubleSlot, selectedColoniaName);

      if (result.success && result.data) {
        toast({
            title: 'Cita Confirmada',
            description: `Tu cita ha sido agendada con éxito. Folio: ${result.data.appointment.appointmentNumber}`,
            duration: 10000,
        });

        const whatsappEnabled = isDoctorBypass ? settings.archivoWhatsAppEnabled : settings.citasMedicasWhatsAppEnabled;

        if (whatsappEnabled) {
            const cleanPhone = data.phoneNumber.replace(/\D/g, '');
            const formattedDateText = format(selectedDate, "eeee dd 'de' MMMM", { locale: es });
            const obs = announcements.length > 0 ? `\n\nAvisos: ${announcements.join(' - ')}` : '';
            const durationTxt = isDoubleSlot ? ` (Cita Embarazada: 2 turnos)` : '';
            
            const wsMessage = encodeURIComponent(`Hola ${data.name}, le contactamos del Hospital General de Huimanguillo para confirmar su cita médica con folio ${result.data.appointment.appointmentNumber} para el día ${formattedDateText} a las ${selectedTime}${durationTxt} en el consultorio ${selectedClinic.name} con el Dr(a). ${selectedClinic.doctorName}.${obs}`);
            
            window.open(`https://wa.me/52${cleanPhone}?text=${wsMessage}`, '_blank');
        }

        const allAnnouncements = await getAnnouncements();
        await generateAppointmentPDF(result.data.appointment, result.data.clinic, allAnnouncements);
        
        form.reset();
        onBookingSuccess(true);
      } else {
         toast({
          title: 'Turno no disponible',
          description: result.error || 'No se pudo agendar la cita. Es posible que el horario ya haya sido ocupado.',
          variant: 'destructive',
        });
        // Refresh availability without clearing form data
        onBookingSuccess(false);
      }
    });
  };
  
  if (!selectedTime) {
    return (
        <Card className='border-dashed'>
            <CardContent className='p-6 text-center'>
                <p className='text-muted-foreground'>Por favor, completa los pasos anteriores y selecciona una hora o ficha.</p>
            </CardContent>
        </Card>
    );
  }

  return (
    <Card className="bg-transparent border-none shadow-none">
      <CardContent className='p-0'>
        {isDoubleSlot && (
            <div className="mb-4 p-3 bg-pink-50 border border-pink-100 rounded-xl flex items-center gap-3 animate-in slide-in-from-top-2">
                <Baby className="h-5 w-5 text-pink-600" />
                <p className="text-xs font-black text-pink-700 uppercase">Cita Embarazada Activada: Se reservará un horario doble.</p>
            </div>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
             {!isNewborn && (
                <FormField
                control={form.control}
                name="curp"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CURP</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Tu CURP de 18 caracteres"
                        {...field}
                        disabled={!!initialPatientData}
                        onChange={(e) => field.onChange(e.target.value.toUpperCase().trim())}
                        onBlur={(e) => {
                          field.onBlur();
                          handleCurpBlur();
                        }}
                        maxLength={18}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
             )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre(s)</FormLabel>
                      <FormControl>
                        <Input placeholder="Tu(s) nombre(s)" {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase().trim())} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="paternalLastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Apellido Paterno</FormLabel>
                      <FormControl>
                        <Input placeholder="Tu apellido paterno" {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase().trim())} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
            </div>
             <FormField
              control={form.control}
              name="maternalLastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Apellido Materno</FormLabel>
                  <FormControl>
                    <Input placeholder="Tu apellido materno" {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase().trim())} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
                  control={form.control}
                  name="phoneNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{isNewborn ? "Teléfono del Padre/Tutor" : "Número Telefónico"}</FormLabel>
                      <FormControl>
                        <Input type="tel" placeholder="Tu teléfono de 10 dígitos" {...field} maxLength={10} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
            <FormField control={form.control} name="birthDate" render={({ field }) => (
                <FormItem>
                <FormLabel>Fecha de Nacimiento</FormLabel>
                <FormControl>
                    <Input type="date" {...field} value={field.value ?? ''} disabled={!!curp && !isNewborn} />
                </FormControl>
                <FormMessage />
                </FormItem>
            )} />
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <FormField
                  control={form.control}
                  name="sex"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sexo</FormLabel>
                       <Select onValueChange={field.onChange} value={field.value} disabled={!!curp && !isNewborn}>
                         <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Hombre">Hombre</SelectItem>
                          <SelectItem value="Mujer">Mujer</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="age"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Edad (años)</FormLabel>
                        <FormControl>
                        <Input type="number" min={0} placeholder="Años cumplidos" {...field} disabled={!!curp && !isNewborn} value={field.value ?? ''} onChange={e => field.onChange(parseInt(e.target.value, 10) || 0)} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
            </div>
            
            {!isNewborn && (
                 <FormField
                    control={form.control}
                    name="birthState"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estado de Nacimiento</FormLabel>
                        <Combobox 
                          options={estados.map(e => ({ value: e.nombre, label: e.nombre }))}
                          value={field.value || ''}
                          onChange={(value) => field.onChange(value.toUpperCase().trim())}
                          placeholder='Selecciona un estado'
                          searchPlaceholder='Buscar estado...'
                          noResultsText='No se encontró el estado.'
                          disabled={!!curp}
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
            )}

            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost" className="w-full flex justify-between items-center px-0">
                  <span>Información Adicional (Opcional)</span>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={form.control} name="fatherName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre del Padre</FormLabel>
                      <FormControl><Input placeholder="Nombre completo" {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase().trim())} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="fatherAge" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Edad del Padre</FormLabel>
                      <FormControl><Input type="number" min={0} {...field} value={field.value ?? ''} /></FormControl>
                    </FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={form.control} name="motherName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre de la Madre</FormLabel>
                      <FormControl><Input placeholder="Nombre completo" {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase().trim())} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="motherAge" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Edad de la Madre</FormLabel>
                      <FormControl><Input type="number" min={0} {...field} value={field.value ?? ''} /></FormControl>
                    </FormItem>
                  )} />
                </div>
                <FormField
                  control={form.control}
                  name="derechoAbiencia"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Derechoabiencia</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ''}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar Institución" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="IMSS">IMSS</SelectItem>
                          <SelectItem value="ISSSTE">ISSSTE</SelectItem>
                          <SelectItem value="IMSS-BIENESTAR">IMSS-Bienestar</SelectItem>
                          <SelectItem value="PEMEX">PEMEX</SelectItem>
                          <SelectItem value="SEDENA">SEDENA</SelectItem>
                          <SelectItem value="SEMAR">SEMAR</SelectItem>
                          <SelectItem value="ISSSET">ISSSET</SelectItem>
                          <SelectItem value="OTRO">OTRO</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>Si cuenta con algún seguro médico adicional.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CollapsibleContent>
            </Collapsible>

            <Button
              type="submit"
              disabled={isPending}
              className="w-full text-lg py-6"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isPending ? 'Confirmando Cita...' : 'Confirmar Cita'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

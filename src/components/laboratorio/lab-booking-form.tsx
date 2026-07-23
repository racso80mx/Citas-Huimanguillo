
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
import { saveNewLabAppointment, getPatientByCURP, getModuleSettings } from '@/lib/actions';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { parseCURP, calculateAge } from '@/lib/curp';
import estados from '@/lib/data/estados.json';
import { Combobox } from '../ui/combobox';
import type { LabAppointment, Patient, LabStudy } from '@/lib/definitions';
import { PatientType } from '@/lib/definitions';
import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const curpRegex = /^[A-Z]{4}(\d{2})(\d{2})(\d{2})([HM])([A-Z]{2})[A-Z]{3}[A-Z0-9]\d$/;
const phoneRegex = /^\d{10}$/;


const baseSchema = z.object({
  name: z.string().min(2, 'El nombre es requerido.'),
  paternalLastName: z.string().min(2, 'El apellido paterno es requerido.'),
  maternalLastName: z.string().min(2, 'El apellido materno es requerido.'),
  phoneNumber: z.string().regex(phoneRegex, 'El número de teléfono debe tener 10 dígitos.'),
  sex: z.enum(['Hombre', 'Mujer']),
  age: z.number().min(0, 'La edad no puede ser negativa.'),
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

type LabBookingFormProps = {
  selectedDate: Date | undefined;
  selectedStudies: LabStudy[];
  selectedTime: string | undefined;
  patientType: PatientType;
  onBookingSuccess: (reset?: boolean) => void;
  dailySlots: number;
  weekendBookingEnabled: boolean;
  announcements: string[];
};

export function LabBookingForm({
  selectedDate,
  selectedStudies,
  selectedTime,
  patientType,
  onBookingSuccess,
  announcements,
}: LabBookingFormProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const isNewborn = patientType === PatientType.RecienNacido;

  const currentSchema = isNewborn ? formSchemaNewborn : formSchemaWithCurp;

  const form = useForm<BookingFormValues>({
    resolver: zodResolver(currentSchema),
    defaultValues: {
      curp: '',
      name: '',
      paternalLastName: '',
      maternalLastName: '',
      phoneNumber: '',
      sex: undefined,
      age: 0,
      birthState: '',
    },
  });

  useEffect(() => {
    form.reset();
  }, [isNewborn, form]);

  const curp = form.watch('curp');

  const handleCurpBlur = async () => {
    if (isNewborn) return;
    const curpValue = form.getValues('curp').toUpperCase();
    if (curpRegex.test(curpValue)) {
      startTransition(async () => {
        const result = await getPatientByCURP(curpValue);
        if (result.success && result.data) {
          form.setValue('name', result.data.name, { shouldValidate: true });
          form.setValue('paternalLastName', result.data.paternalLastName, { shouldValidate: true });
          form.setValue('maternalLastName', result.data.maternalLastName, { shouldValidate: true });
          form.setValue('phoneNumber', result.data.phoneNumber, { shouldValidate: true });
           toast({
                title: 'Paciente Encontrado',
                description: 'Se han precargado tus datos.',
            });
        }
      });
    }
  };

  useEffect(() => {
    if (!isNewborn && curp && curp.length === 18 && curpRegex.test(curp.toUpperCase())) {
      const data = parseCURP(curp.toUpperCase());
      if (data) {
        form.setValue('sex', data.sex as 'Hombre' | 'Mujer');
        form.setValue('birthState', data.estadoNacimiento || 'NACIDO EN EL EXTRANJERO');
        form.setValue('age', calculateAge(data.birthDate));
      }
    }
  }, [curp, form, isNewborn]);

  const onSubmit = (data: BookingFormValues) => {
    if (!selectedDate || selectedStudies.length === 0 || !selectedTime) {
      toast({
        title: 'Error de validación',
        description: 'Por favor, selecciona fecha, estudios y un turno disponible.',
        variant: 'destructive',
      });
      return;
    }
    
    startTransition(async () => {
       const settings = await getModuleSettings();
       const patientData: Omit<Patient, 'id'> = {
            curp: (data.curp || `RN-${uuidv4()}`).toUpperCase(),
            name: data.name.toUpperCase(),
            paternalLastName: data.paternalLastName.toUpperCase(),
            maternalLastName: data.maternalLastName.toUpperCase(),
            sex: data.sex,
            age: data.age,
            birthState: data.birthState || 'No especificado',
            phoneNumber: data.phoneNumber
        };

        const appointmentNumber = `LAB-${uuidv4().split('-')[0].toUpperCase()}`;

        const newAppointment: Omit<LabAppointment, 'id' | 'patientId' | 'patient'> = {
          appointmentNumber,
          date: selectedDate.toISOString(),
          time: selectedTime,
          studies: selectedStudies,
          status: 'Agendada',
          patientType: patientType,
        };

      const result = await saveNewLabAppointment(newAppointment, patientData);

      if (result.success && result.data) {
          toast({
              title: 'Cita Confirmada',
              description: `Tu cita de laboratorio ha sido agendada. Folio: ${result.data.appointmentNumber}`,
              duration: 10000,
          });

          if (settings.laboratorioWhatsAppEnabled) {
              const cleanPhone = data.phoneNumber.replace(/\D/g, '');
              const formattedDateText = format(selectedDate, "eeee dd 'de' MMMM", { locale: es });
              const vaccinesList = selectedStudies.map(s => s.name).join(', ');
              const obs = announcements.length > 0 ? `\n\nAvisos: ${announcements.join(' - ')}` : '';
              
              const wsMessage = encodeURIComponent(`Hola ${data.name}, le contactamos del Hospital General de Huimanguillo para confirmar su cita de laboratorio con folio ${result.data.appointmentNumber} para el día ${formattedDateText} (${selectedTime}). Estudios: ${vaccinesList}. Recuerde seguir las indicaciones de ayuno.${obs}`);
              window.open(`https://wa.me/52${cleanPhone}?text=${wsMessage}`, '_blank');
          }

          const { jsPDF } = await import('jspdf');
          await import('jspdf-autotable');
          const doc = new jsPDF() as any;
          await generateLabAppointmentPDF(doc, result.data, announcements);

          form.reset();
          onBookingSuccess(true);
      } else {
           toast({
            title: 'Turno no disponible',
            description: result.error || 'No se pudo agendar la cita. Es posible que el turno ya haya sido ocupado.',
            variant: 'destructive',
          });
          onBookingSuccess(false);
      }
    });
  };
  
  async function generateLabAppointmentPDF(doc: any, appointmentData: LabAppointment, announcements: string[]) {
    const patient = appointmentData.patient || { name: 'S/N', paternalLastName: '', maternalLastName: '', curp: 'S/C', phoneNumber: 'S/T' };
    const { date, time, appointmentNumber, studies } = appointmentData;

    doc.setFont('Helvetica');
    doc.setFontSize(22);
    doc.text('Confirmación de Cita de Laboratorio', 105, 25, { align: 'center' });
    doc.setFontSize(10);
    doc.text('Hospital General de Huimanguillo', 105, 31, { align: 'center' });
    doc.setFontSize(14);
    doc.setFont('Helvetica', 'bold');
    doc.text(`Folio de Cita: ${appointmentNumber}`, 20, 50);

    doc.setLineWidth(0.5);
    doc.line(20, 55, 190, 55);

    doc.setFontSize(16);
    doc.setFont('Helvetica', 'bold');
    doc.text('Datos del Paciente:', 20, 65);
    doc.setFontSize(12);
    doc.setFont('Helvetica', 'normal');
    doc.text(`Nombre: ${patient.name} ${patient.paternalLastName} ${patient.maternalLastName}`, 20, 75);
    doc.text(`CURP: ${patient.curp}`, 20, 85);
    doc.text(`Teléfono: ${patient.phoneNumber}`, 20, 95);

    doc.setFontSize(16);
    doc.setFont('Helvetica', 'bold');
    doc.text('Detalles de la Cita:', 20, 115);
    doc.setFontSize(12);
    doc.setFont('Helvetica', 'normal');
    const formattedDate = format(new Date(date), "eeee, dd 'de' MMMM 'de' yyyy", { locale: es });
    doc.text(`Fecha: ${formattedDate}`, 20, 125);
    doc.text(`Turno: ${time}`, 20, 135);

    doc.setFontSize(16);
    doc.setFont('Helvetica', 'bold');
    doc.text('Estudios Solicitados e Indicaciones:', 20, 155);
    
    const tableBody = studies.map(s => [s.name, s.sampleType, s.fastingHours]);
    doc.autoTable({
        startY: 165,
        head: [['Estudio', 'Tipo de Muestra', 'Horas de Ayuno']],
        body: tableBody,
        theme: 'grid',
        headStyles: { fillColor: [0, 102, 51] }, // Primary color
    });

    let finalY = doc.lastAutoTable.finalY || 200;
    finalY += 10;
    
    if (announcements && announcements.length > 0) {
        doc.setFontSize(14);
        doc.setFont('Helvetica', 'bold');
        doc.text('Avisos Importantes:', 20, finalY);
        finalY += 7;
        doc.autoTable({
            startY: finalY,
            body: announcements.map(a => [a]),
            theme: 'plain',
            styles: { fontSize: 10, cellPadding: 1, halign: 'left' },
        });
        finalY = doc.lastAutoTable.finalY + 5;
    }

    doc.setFontSize(10);
    doc.setTextColor(150);
    doc.text('Importante: Favor de presentarse a las 06:30 h para su toma de muestras puntual a las 07:00 h.', 20, finalY);
    doc.text('Siga las indicaciones de ayuno y preparación para cada estudio.', 20, finalY + 5);
    doc.text('Este es un comprobante de su cita, puede mostrar este PDF desde su teléfono.', 20, finalY + 10);

    doc.save(`recibo_lab_${patient.curp}.pdf`);
  }

  if (!selectedDate || selectedStudies.length === 0 || !selectedTime) {
    return (
        <Card className='border-dashed'>
            <CardContent className='p-6 text-center'>
                <p className='text-muted-foreground'>Por favor, completa todos los pasos anteriores.</p>
            </CardContent>
        </Card>
    );
  }

  return (
    <Card className="bg-transparent border-none shadow-none">
      <CardContent className='p-0'>
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
                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        onBlur={(e) => {
                          field.onBlur();
                          handleCurpBlur();
                        }}
                        maxLength={18}
                        className="uppercase"
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
                        <Input placeholder="Tu(s) nombre(s)" {...field} className="uppercase" />
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
                        <Input placeholder="Tu apellido paterno" {...field} className="uppercase" />
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
                    <Input placeholder="Tu apellido materno" {...field} className="uppercase" />
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
                      <FormLabel>Número Telefónico</FormLabel>
                      <FormControl>
                        <Input type="tel" placeholder="Tu teléfono de 10 dígitos" {...field} maxLength={10} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <FormField
                  control={form.control}
                  name="sex"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sexo</FormLabel>
                       <Select onValueChange={field.onChange} value={field.value} disabled={!isNewborn && !!curp}>
                         <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={!isNewborn && !!curp ? "Derivado de CURP" : "Selecciona..."} />
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
                      <FormLabel>Edad</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} placeholder={!isNewborn && !!curp ? "Derivado de CURP" : "Años cumplidos"} {...field} disabled={!isNewborn && !!curp} value={field.value ?? ''} onChange={e => field.onChange(parseInt(e.target.value, 10) || 0)} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
            </div>
            
            <FormField
              control={form.control}
              name="birthState"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado de Nacimiento</FormLabel>
                  <Combobox 
                    options={estados.map(e => ({ value: e.nombre, label: e.nombre }))}
                    value={field.value || ''}
                    onChange={field.onChange}
                    placeholder='Selecciona un estado'
                    searchPlaceholder='Buscar estado...'
                    noResultsText='No se encontró el estado.'
                    disabled={!isNewborn && !!curp}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

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

'use client';
import { useState, useTransition } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from '../ui/card';
import { Button } from '../ui/button';
import { useToast } from '@/hooks/use-toast';
import { downloadBackupAction, cleanupOldRecords, logActivity, rebuildNombreCompletoAction } from '@/lib/actions';
import { Loader2, Download, Trash, Database, ShieldAlert, CheckCircle2, UserRound, RefreshCcw } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

export function BackupManager({ onRestoreSuccess }: { onRestoreSuccess?: () => void }) {
  const [isDownloading, startDownloadTransition] = useTransition();
  const [isCleaning, startCleanTransition] = useTransition();
  const [isRebuilding, startRebuildTransition] = useTransition();
  const [cleanupPassword, setCleanupPassword] = useState('');
  const { toast } = useToast();
  
  const handleDownload = () => {
    startDownloadTransition(async () => {
      const result = await downloadBackupAction();
      if (result.success && result.data) {
        try {
            const xlsx = await import('xlsx');
            const workbook = xlsx.utils.book_new();

            const enrichedAppointments = result.data.appointments.map((app: any) => {
                const clinic = result.data.clinics.find((c: any) => c.id === app.clinicId);
                return {
                    ...app,
                    clinicName: clinic?.name || 'N/A'
                };
            });

            const createSheetFromCollection = (sheetName: string, data: any[], keyMapping: Record<string, string>) => {
              if (!data || data.length === 0) return;
              const mappedData = data.map(item => {
                const newRow: Record<string, any> = {};
                for (const key in keyMapping) {
                  const itemKey = keyMapping[key];
                  
                  if (itemKey.includes('.')) {
                     const [obj, prop] = itemKey.split('.');
                     newRow[key] = item[obj] ? item[obj][prop] : '';
                  } else if (Array.isArray(item[itemKey])) {
                    newRow[key] = item[itemKey].map((i: any) => i.name || i).join(', ');
                  }
                  else {
                    newRow[key] = item[itemKey] ?? '';
                  }
                }
                return newRow;
              });

              const worksheet = xlsx.utils.json_to_sheet(mappedData);
              xlsx.utils.book_append_sheet(workbook, worksheet, sheetName);
            };
            
            createSheetFromCollection('Citas Médicas', enrichedAppointments, { 'Folio': 'appointmentNumber', 'Fecha': 'date', 'Hora': 'time', 'Estado': 'status', 'Nombre': 'patient.name', 'Apellido Paterno': 'patient.paternalLastName', 'Apellido Materno': 'patient.maternalLastName', 'CURP': 'patient.curp', 'Teléfono': 'patient.phoneNumber', 'Núcleo': 'clinicName', 'Colonia': 'coloniaName', 'Tipo Paciente': 'patientType' });
            createSheetFromCollection('Laboratorio', result.data.labAppointments, { 'Folio': 'appointmentNumber', 'Fecha': 'date', 'Hora': 'time', 'Estado': 'status', 'Nombre': 'patient.name', 'Apellido Paterno': 'patient.paternalLastName', 'Apellido Materno': 'patient.maternalLastName', 'CURP': 'patient.curp', 'Teléfono': 'patient.phoneNumber', 'Estudios': 'studies' });
            createSheetFromCollection('Rayos X', result.data.xRayAppointments, { 'Folio': 'appointmentNumber', 'Fecha': 'date', 'Hora': 'time', 'Estado': 'status', 'Nombre': 'patient.name', 'Apellido Paterno': 'patient.paternalLastName', 'Apellido Materno': 'patient.maternalLastName', 'CURP': 'patient.curp', 'Teléfono': 'patient.phoneNumber', 'Estudio': 'studyName' });
            createSheetFromCollection('Ultrasonidos', result.data.ultrasoundAppointments, { 'Folio': 'appointmentNumber', 'Fecha': 'date', 'Hora': 'time', 'Estado': 'status', 'Nombre': 'patient.name', 'Apellido Paterno': 'patient.paternalLastName', 'Apellido Materno': 'patient.maternalLastName', 'CURP': 'patient.curp', 'Teléfono': 'patient.phoneNumber', 'Estudio': 'studyName' });
            createSheetFromCollection('Vacunación', result.data.vaccineAppointments, { 'Folio': 'appointmentNumber', 'Fecha': 'date', 'Hora': 'time', 'Estado': 'status', 'Nombre': 'patient.name', 'Apellido Paterno': 'patient.paternalLastName', 'Apellido Materno': 'patient.maternalLastName', 'CURP': 'patient.curp', 'Teléfono': 'patient.phoneNumber', 'Colonia': 'coloniaName', 'Vacunas': 'vaccines', 'Recién Nacido': 'isNewborn' });
            createSheetFromCollection('Pacientes', result.data.patients, { 'ID': 'id', 'CURP': 'curp', 'Nombre': 'name', 'Apellido Paterno': 'paternalLastName', 'Apellido Materno': 'maternalLastName', 'Teléfono': 'phoneNumber', 'Colonia': 'coloniaName' });
            createSheetFromCollection('Unidades', result.data.clinics, { 'ID': 'id', 'Nombre': 'name', 'Médico': 'doctorName' });

            const date = new Date().toISOString().split('T')[0];
            xlsx.writeFile(workbook, `respaldo_hospital_${date}.xlsx`);

            toast({
              title: 'Respaldo Exitoso',
              description: 'Se ha generado el archivo Excel con toda la información.',
            });
            await logActivity("Mantenimiento", "Se descargó un respaldo completo en Excel.");
        } catch (excelError: any) {
             toast({ title: 'Error al generar Excel', variant: 'destructive' });
        }
      } else {
        toast({ title: 'Error al consultar base de datos', variant: 'destructive' });
      }
    });
  };

  const handleRebuildNames = () => {
    startRebuildTransition(async () => {
        const result = await rebuildNombreCompletoAction();
        if (result.success) {
            toast({ 
                title: "Reconstrucción Finalizada", 
                description: `Se han actualizado ${result.count} pacientes con su campo de nombre completo normalizado.` 
            });
        } else {
            toast({ title: 'Error al reconstruir nombres', variant: 'destructive' });
        }
    });
  };

  const handleConfirmCleanup = () => {
    if (cleanupPassword !== 'Hu1m4ngu1ll0') {
      toast({
        title: 'Contraseña Incorrecta',
        description: 'La clave maestra es necesaria para purgar la base de datos.',
        variant: 'destructive',
      });
      return;
    }
    
    startCleanTransition(async () => {
        const result = await cleanupOldRecords();
        if (result.success) {
            toast({
                title: 'Limpieza Finalizada',
                description: `Se han purgado ${result.deletedCount || 0} registros antiguos satisfactoriamente.`,
            });
            await logActivity("Mantenimiento", `Purgado masivo: ${result.deletedCount} registros eliminados.`);
            onRestoreSuccess?.();
        } else {
            toast({ title: 'Error al purgar registros', variant: 'destructive' });
        }
    });
  };

  return (
      <Card className="shadow-lg border-primary/10">
        <CardHeader className="bg-muted/5">
          <CardTitle className='flex items-center gap-2 text-primary font-black uppercase text-sm'>
            <Database className="h-5 w-5" /> Mantenimiento de Datos
          </CardTitle>
          <CardDescription className="text-xs font-medium">
            Respaldos en Excel y depuración de registros del mes anterior.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <Button 
            onClick={handleDownload} 
            disabled={isDownloading} 
            variant="outline"
            className="w-full h-11 font-bold border-green-200 text-green-700 hover:bg-green-50 shadow-sm"
          >
            {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Descargar Respaldo (Excel)
          </Button>

          <Button 
            onClick={handleRebuildNames} 
            disabled={isRebuilding} 
            variant="outline"
            className="w-full h-11 font-bold border-primary/20 text-primary hover:bg-primary/5 shadow-sm"
          >
            {isRebuilding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
            Reconstruir Nombres Completos
          </Button>

          <AlertDialog onOpenChange={(open) => !open && setCleanupPassword('')}>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" disabled={isCleaning} className="w-full text-destructive hover:bg-destructive/5 font-bold h-11">
                  {isCleaning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash className="mr-2 h-4 w-4" />}
                  Purgar Historial Antiguo
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                    <ShieldAlert className="h-5 w-5" /> ¿ESTÁS SEGURO?
                </AlertDialogTitle>
                <AlertDialogDescription className="font-bold text-sm">
                  Esta acción eliminará permanentemente todas las citas y registros de actividad de meses anteriores para optimizar el sistema.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-2 py-4">
                <Label htmlFor="cleanup-password">Contraseña Maestra (SuperAdmin)</Label>
                <Input
                  id="cleanup-password"
                  type="password"
                  value={cleanupPassword}
                  onChange={(e) => setCleanupPassword(e.target.value)}
                  placeholder="Confirmar con clave maestra..."
                  className="font-black h-12"
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleConfirmCleanup}
                  disabled={isCleaning}
                  className='bg-destructive hover:bg-destructive/90 font-black'
                >
                  SÍ, PURGAR BASE DE DATOS
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
        <CardFooter className="bg-muted/10 border-t py-3 flex items-center justify-center gap-2">
            <CheckCircle2 className="h-3 w-3 text-green-600" />
            <span className="text-[10px] font-black uppercase text-muted-foreground opacity-60">Base de Datos Protegida por Firestore</span>
        </CardFooter>
      </Card>
  );
}

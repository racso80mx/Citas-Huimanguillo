
'use client';
import { useState, useEffect, useTransition } from 'react';
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
import { 
    updateModuleSettings, getModuleSettings, 
    updateArchiveSettings, getArchiveSettings,
    updatePharmacySettings, getPharmacySettings,
    updateWarehouseSettings, getWarehouseSettings,
    updateLabSettings, getLabSettings,
    updateXRaySettings, getXRaySettings,
    updateUltrasoundSettings, getUltrasoundSettings,
    updateVaccineSettings, getVaccineSettings,
    logActivity 
} from '@/lib/actions';
import { Loader2, Save, KeyRound, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { Label } from '../ui/label';

type SecurityItem = {
    id: string;
    title: string;
    description: string;
    password: string;
    onSave: (password: string) => Promise<any>;
};

export function ModuleSecurityManager() {
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [modules, archive, pharmacy, warehouse, lab, xray, us, vaccine] = await Promise.all([
        getModuleSettings(), getArchiveSettings(), getPharmacySettings(), getWarehouseSettings(),
        getLabSettings(), getXRaySettings(), getUltrasoundSettings(), getVaccineSettings()
      ]);
      
      setPasswords({
        medical: modules.citasMedicasPassword || '',
        archive: archive.password || '',
        archiveInquiry: modules.archivoConsultaPassword || '',
        pharmacy: pharmacy.password || '',
        warehouse: warehouse.password || '',
        lab: lab.password || '',
        xray: xray.password || '',
        us: us.password || '',
        vaccine: vaccine.password || '',
      });
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSave = async (id: string, password: string, title: string) => {
    setIsSaving(prev => ({ ...prev, [id]: true }));
    try {
        let result;
        switch(id) {
            case 'medical': 
                const modSettings = await getModuleSettings();
                result = await updateModuleSettings({ ...modSettings, citasMedicasPassword: password });
                break;
            case 'archiveInquiry':
                const modSetInq = await getModuleSettings();
                result = await updateModuleSettings({ ...modSetInq, archivoConsultaPassword: password });
                break;
            case 'archive': result = await updateArchiveSettings({ password }); break;
            case 'pharmacy': result = await updatePharmacySettings({ password }); break;
            case 'warehouse': result = await updateWarehouseSettings({ password }); break;
            case 'lab': 
                const labSet = await getLabSettings();
                result = await updateLabSettings({ ...labSet, password });
                break;
            case 'xray':
                const xrSet = await getXRaySettings();
                result = await updateXRaySettings({ ...xrSet, password });
                break;
            case 'us':
                const usSet = await getUltrasoundSettings();
                result = await updateUltrasoundSettings({ ...usSet, password });
                break;
            case 'vaccine':
                const vSet = await getVaccineSettings();
                result = await updateVaccineSettings({ ...vSet, password });
                break;
        }

        if (result?.success) {
            toast({ title: 'Contraseña Actualizada', description: `Se ha guardado la clave para ${title}.` });
            await logActivity("Seguridad", `Actualización de contraseña para módulo: ${title}`);
        }
    } catch (e) {
        toast({ title: 'Error', variant: 'destructive' });
    } finally {
        setIsSaving(prev => ({ ...prev, [id]: false }));
    }
  };

  const securityItems: SecurityItem[] = [
    { id: 'medical', title: 'Cita Médica General', description: 'Acceso al portal de citas de núcleos básicos.', password: passwords.medical || '', onSave: (p) => handleSave('medical', p, 'Cita Médica') },
    { id: 'lab', title: 'Laboratorio', description: 'Acceso al portal de citas de laboratorio.', password: passwords.lab || '', onSave: (p) => handleSave('lab', p, 'Laboratorio') },
    { id: 'xray', title: 'Rayos X', description: 'Acceso al portal de citas de rayos x.', password: passwords.xray || '', onSave: (p) => handleSave('xray', p, 'Rayos X') },
    { id: 'us', title: 'Ultrasonidos', description: 'Acceso al portal de citas de ultrasonido.', password: passwords.us || '', onSave: (p) => handleSave('us', p, 'Ultrasonidos') },
    { id: 'vaccine', title: 'Vacunación', description: 'Acceso al portal de citas de vacunas.', password: passwords.vaccine || '', onSave: (p) => handleSave('vaccine', p, 'Vacunación') },
    { id: 'archive', title: 'Gestión del Archivo', description: 'Acceso total al padrón (Edición/Borrado).', password: passwords.archive || '', onSave: (p) => handleSave('archive', p, 'Archivo Gestión') },
    { id: 'archiveInquiry', title: 'Consulta de Recursos', description: 'Acceso de solo lectura al archivo e inventario.', password: passwords.archiveInquiry || '', onSave: (p) => handleSave('archiveInquiry', p, 'Consulta Recursos') },
    { id: 'pharmacy', title: 'Gestión de Farmacia', description: 'Acceso al inventario y carga masiva.', password: passwords.pharmacy || '', onSave: (p) => handleSave('pharmacy', p, 'Farmacia') },
    { id: 'warehouse', title: 'Gestión de Almacén', description: 'Acceso al inventario de insumos generales.', password: passwords.warehouse || '', onSave: (p) => handleSave('warehouse', p, 'Almacén') },
  ];

  if (isLoading) return <div className="p-12 flex justify-center"><Loader2 className="animate-spin h-12 w-12 text-primary" /></div>;

  return (
    <Card className="border-primary/20 bg-primary/5 shadow-inner">
        <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
                <ShieldCheck className="h-6 w-6" /> Seguridad de Módulos
            </CardTitle>
            <CardDescription>Establece las contraseñas de acceso para cada área del sistema.</CardDescription>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {securityItems.map((item) => (
                <Card key={item.id} className="shadow-lg hover:shadow-xl transition-shadow">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <KeyRound className="h-5 w-5" /> {item.title}
                        </CardTitle>
                        <CardDescription className="text-xs">{item.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor={`pass-${item.id}`}>Contraseña de Acceso</Label>
                            <div className="relative">
                                <Input
                                    id={`pass-${item.id}`}
                                    type={showPasswords[item.id] ? 'text' : 'password'}
                                    value={passwords[item.id] || ''}
                                    onChange={(e) => setPasswords(prev => ({ ...prev, [item.id]: e.target.value }))}
                                    placeholder="Nueva contraseña..."
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute inset-y-0 right-0 h-full px-3"
                                    onClick={() => setShowPasswords(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                                >
                                    {showPasswords[item.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button 
                            onClick={() => item.onSave(passwords[item.id])} 
                            disabled={isSaving[item.id]} 
                            className="w-full"
                        >
                            {isSaving[item.id] ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Guardar Contraseña
                        </Button>
                    </CardFooter>
                </Card>
            ))}
        </CardContent>
    </Card>
  );
}

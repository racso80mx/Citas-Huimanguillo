
'use client';

import { useState, useEffect, useTransition } from 'react';
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
import { getDepartments, updateDepartments } from '@/lib/actions';
import { Loader2, Plus, Trash2, Save, MapPin } from 'lucide-react';
import type { Department } from '@/lib/definitions';
import { Switch } from '../ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export function DepartmentsManager() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, startSavingTransition] = useTransition();
  const { toast } = useToast();

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const data = await getDepartments();
      setDepartments(data);
    } catch (error) {
      console.error('Failed to fetch departments:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const addDepartment = () => {
    setDepartments([
      ...departments,
      { id: uuidv4(), name: '', available: true }
    ]);
  };

  const removeDepartment = (id: string) => {
    setDepartments(departments.filter(d => d.id !== id));
  };

  const updateField = (id: string, field: keyof Department, value: any) => {
    setDepartments(prev => prev.map(d => d.id === id ? { ...d, [field]: value } : d));
  };

  const handleSave = () => {
    const valid = departments.filter(d => d.name.trim() !== '');
    startSavingTransition(async () => {
      const result = await updateDepartments(valid);
      if (result.success) {
        toast({ title: 'Catálogo de Destinos Actualizado' });
        fetchData();
      } else {
        toast({ title: 'Error', description: 'No se pudo guardar el catálogo.', variant: 'destructive' });
      }
    });
  };

  if (isLoading) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MapPin /> Catálogo de Destinos (Vales)</CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center items-center h-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg border-primary/20 bg-primary/5">
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-primary uppercase font-black">
            <MapPin className="h-5 w-5" /> Destinos de Medicamentos (Vales)
          </CardTitle>
          <CardDescription>
            Administra los departamentos o áreas a las que se les entregan medicamentos mediante vales.
          </CardDescription>
        </div>
        <Button onClick={addDepartment} variant="outline" className="bg-background">
          <Plus className="mr-2 h-4 w-4" /> Agregar Destino
        </Button>
      </CardHeader>
      <CardContent>
        <div className="border rounded-xl overflow-hidden bg-background">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="font-bold">Nombre del Departamento / Área</TableHead>
                <TableHead className="w-[150px] text-center">Disponible</TableHead>
                <TableHead className="w-[100px] text-right pr-6">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {departments.length > 0 ? departments.map((item) => (
                <TableRow key={item.id} className="hover:bg-muted/30">
                  <TableCell>
                    <Input 
                      value={item.name} 
                      onChange={e => updateField(item.id, 'name', e.target.value.toUpperCase())}
                      placeholder="Ej. URGENCIAS, PEDIATRÍA..."
                      className="h-10 font-bold border-transparent focus:border-primary/30"
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex justify-center">
                      <Switch 
                        checked={item.available} 
                        onCheckedChange={v => updateField(item.id, 'available', v)}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-right pr-6">
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeDepartment(item.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-20 text-muted-foreground italic">
                    No hay destinos configurados. Haz clic en "Agregar Destino".
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      <CardFooter className="pt-6">
        <Button onClick={handleSave} disabled={isSaving} className="w-full h-12 text-lg font-bold">
          {isSaving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Save className="mr-2 h-5 w-5" />}
          {isSaving ? 'Guardando catálogo...' : 'Sincronizar Catálogo de Destinos'}
        </Button>
      </CardFooter>
    </Card>
  );
}

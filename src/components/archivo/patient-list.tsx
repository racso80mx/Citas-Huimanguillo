'use client';

import { useState, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { Checkbox } from '@/components/ui/checkbox';
import { MoreHorizontal, Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown, CalendarPlus, UserCheck, Clock, UserX, Search } from 'lucide-react';
import type { Patient, PatientStatus } from '@/lib/definitions';
import { PatientStatus as PatientStatusEnum } from '@/lib/definitions';
import { cn } from '@/lib/utils';

type PatientListProps = {
  patients: Patient[];
  onEdit: (patient: Patient) => void;
  onDelete: (patientId: string) => void;
  onStatusChange: (patientId: string, newStatus: PatientStatus) => void;
  onSchedule: (patient: Patient) => void;
  isSubmitting: boolean;
  isReadOnly?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
};

type SortableKeys = 'name' | 'expediente' | 'curp' | 'coloniaName' | 'status';

export function PatientList({ 
    patients, 
    onEdit, 
    onDelete, 
    onStatusChange, 
    onSchedule, 
    isSubmitting, 
    isReadOnly = false,
    selectedIds = [],
    onSelectionChange
}: PatientListProps) {
    
  const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'ascending' | 'descending' } | null>(null);

  const sortedPatients = useMemo(() => {
    let sortableItems = [...patients];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let aValue: string | number = '';
        let bValue: string | number = '';

        if (sortConfig.key === 'name') {
            aValue = `${a.paternalLastName || ''} ${a.maternalLastName || ''} ${a.name || ''}`.trim();
            bValue = `${b.paternalLastName || ''} ${b.maternalLastName || ''} ${b.name || ''}`.trim();
        } else {
            aValue = (a as any)[sortConfig.key] || '';
            bValue = (b as any)[sortConfig.key] || '';
        }

        if (aValue < bValue) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [patients, sortConfig]);

  const requestSort = (key: SortableKeys) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: SortableKeys) => {
    if (!sortConfig || sortConfig.key !== key) {
        return <ArrowUpDown className="ml-2 h-4 w-4" />;
    }
    return sortConfig.direction === 'ascending' ? (
        <ArrowUp className="ml-2 h-4 w-4 text-primary" />
    ) : (
        <ArrowDown className="ml-2 h-4 w-4 text-primary" />
    );
  };

  const handleToggleAll = (checked: boolean) => {
      if (!onSelectionChange) return;
      if (checked) {
          onSelectionChange(patients.map(p => p.id));
      } else {
          onSelectionChange([]);
      }
  };

  const handleToggleOne = (id: string, checked: boolean) => {
      if (!onSelectionChange) return;
      if (checked) {
          onSelectionChange([...selectedIds, id]);
      } else {
          onSelectionChange(selectedIds.filter(x => x !== id));
      }
  };
    
  if (patients.length === 0) {
      return <div className="text-center text-muted-foreground py-10 italic">No se encontraron pacientes para mostrar.</div>
  }

  const statusDisplayMap = {
    [PatientStatusEnum.Vigente]: 'Vigente',
    [PatientStatusEnum.Baja]: 'Baja Temporal',
    [PatientStatusEnum.BajaDefinitiva]: 'Baja Definitiva',
  };


  return (
    <div className="border rounded-xl overflow-hidden bg-background">
      <Table>
        <TableHeader className="bg-muted/30">
          <TableRow>
            <TableHead className="w-[50px] text-center">
                {!isReadOnly && (
                    <Checkbox 
                        checked={patients.length > 0 && selectedIds.length === patients.length}
                        onCheckedChange={handleToggleAll}
                    />
                )}
            </TableHead>
            <TableHead>
              <Button variant="ghost" onClick={() => requestSort('name')} className="text-[10px] font-black uppercase">Nombre Completo {getSortIcon('name')}</Button>
            </TableHead>
            <TableHead>
              <Button variant="ghost" onClick={() => requestSort('expediente')} className="text-[10px] font-black uppercase">Expediente {getSortIcon('expediente')}</Button>
            </TableHead>
            <TableHead>
              <Button variant="ghost" onClick={() => requestSort('curp')} className="text-[10px] font-black uppercase">CURP {getSortIcon('curp')}</Button>
            </TableHead>
            <TableHead className="text-[10px] font-black uppercase">Teléfono</TableHead>
            <TableHead>
              <Button variant="ghost" onClick={() => requestSort('coloniaName')} className="text-[10px] font-black uppercase">Municipio {getSortIcon('coloniaName')}</Button>
            </TableHead>
            <TableHead>
              <Button variant="ghost" onClick={() => requestSort('status')} className="text-[10px] font-black uppercase">Estado {getSortIcon('status')}</Button>
            </TableHead>
            <TableHead className="text-right pr-6 font-black uppercase text-[10px]">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedPatients.map((patient) => (
            <TableRow key={patient.id} className={cn(selectedIds.includes(patient.id) && "bg-primary/5")}>
              <TableCell className="text-center">
                  {!isReadOnly && (
                    <Checkbox 
                        checked={selectedIds.includes(patient.id)}
                        onCheckedChange={(checked) => handleToggleOne(patient.id, !!checked)}
                    />
                  )}
              </TableCell>
              <TableCell className="font-bold text-xs uppercase">{`${patient.name || ''} ${patient.paternalLastName || ''} ${patient.maternalLastName || ''}`}</TableCell>
              <TableCell className="font-mono text-xs font-medium">{patient.expediente || 'N/A'}</TableCell>
              <TableCell className="font-mono text-xs font-bold">{patient.curp}</TableCell>
              <TableCell className="text-xs">{patient.phoneNumber}</TableCell>
              <TableCell className="text-xs uppercase">{patient.coloniaName || 'N/A'}</TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={cn(
                    'font-black text-[9px] uppercase tracking-tighter',
                    (!patient.status || patient.status === PatientStatusEnum.Vigente) && 'bg-green-50 text-green-700 border-green-200',
                    patient.status === PatientStatusEnum.Baja && 'bg-yellow-50 text-yellow-700 border-yellow-200',
                    patient.status === PatientStatusEnum.BajaDefinitiva && 'bg-red-50 text-red-700 border-red-200'
                  )}
                >
                    {statusDisplayMap[patient.status as keyof typeof statusDisplayMap] || 'Vigente'}
                </Badge>
              </TableCell>
              <TableCell className="text-right pr-6">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <span className="sr-only">Abrir menú</span>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onClick={() => onSchedule(patient)} disabled={isSubmitting}>
                      <CalendarPlus className="mr-2 h-4 w-4 text-primary" />
                      Agendar Cita
                    </DropdownMenuItem>
                    
                    {!isReadOnly ? (
                        <>
                            <DropdownMenuItem onClick={() => onEdit(patient)} disabled={isSubmitting}>
                                <Pencil className="mr-2 h-4 w-4 text-blue-600" />
                                Editar Datos
                            </DropdownMenuItem>
                            
                            <DropdownMenuItem onClick={() => onStatusChange(patient.id, PatientStatusEnum.Vigente)} disabled={isSubmitting || !patient.status || patient.status === PatientStatusEnum.Vigente}>
                                <UserCheck className="mr-2 h-4 w-4 text-green-500" /> Cambiar a Vigente
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onStatusChange(patient.id, PatientStatusEnum.Baja)} disabled={isSubmitting || patient.status === PatientStatusEnum.Baja}>
                                <Clock className="mr-2 h-4 w-4 text-yellow-500" /> Baja Temporal
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onStatusChange(patient.id, PatientStatusEnum.BajaDefinitiva)} disabled={isSubmitting || patient.status === PatientStatusEnum.BajaDefinitiva}>
                                <UserX className="mr-2 h-4 w-4 text-red-500" /> Baja Definitiva
                            </DropdownMenuItem>
                            
                            <DropdownMenuSeparator />
                            <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:text-destructive" disabled={isSubmitting}>
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Eliminar Paciente
                                </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>¿Eliminar este registro?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Esta acción quitará a <span className="font-bold">{patient.name}</span> del padrón permanentemente.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => onDelete(patient.id)} className="bg-destructive hover:bg-destructive/90 font-bold">
                                        Confirmar Eliminación
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                            </AlertDialog>
                        </>
                    ) : (
                        <DropdownMenuItem disabled>
                            <Search className="mr-2 h-4 w-4" />
                            Modo Solo Lectura
                        </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

const DropdownMenuSeparator = () => <div className="h-px bg-muted my-1" />;

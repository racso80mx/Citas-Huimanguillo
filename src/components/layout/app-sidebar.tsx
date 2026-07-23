
'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  FlaskConical,
  Stethoscope,
  Waves,
  ShieldPlus,
  Archive,
  Search,
  Pill,
  Package,
  LayoutGrid,
  ClipboardList,
  UserRound,
} from 'lucide-react';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarHeader,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import type { ModuleSettings } from '@/lib/definitions';

export function AppSidebar({ moduleSettings, ...props }: React.ComponentProps<typeof Sidebar> & { moduleSettings: ModuleSettings }) {
  const pathname = usePathname();

  const menuItems = [
    {
      title: 'Cita Médica',
      url: '/citas-medicas',
      icon: Home,
      enabled: moduleSettings.citasMedicasEnabled,
    },
    {
      title: 'Laboratorio',
      url: '/laboratorio',
      icon: FlaskConical,
      enabled: moduleSettings.laboratorioEnabled,
    },
    {
      title: 'Rayos X',
      url: '/rayos-x',
      icon: Stethoscope,
      enabled: moduleSettings.rayosXEnabled,
    },
    {
      title: 'Ultrasonidos',
      url: '/ultrasonidos',
      icon: Waves,
      enabled: moduleSettings.ultrasoundEnabled,
    },
    {
      title: 'Vacunas',
      url: '/vacunas',
      icon: ShieldPlus,
      enabled: moduleSettings.vacunasEnabled,
    },
    {
      title: 'Archivo (Gestión)',
      url: '/archivo',
      icon: Archive,
      enabled: moduleSettings.archivoEnabled,
    },
    {
      title: 'Consulta Recursos',
      url: '/archivo-consulta',
      icon: Search,
      enabled: moduleSettings.archivoConsultaEnabled,
    },
    {
      title: 'Farmacia',
      url: '/farmacia',
      icon: Pill,
      enabled: moduleSettings.farmaciaEnabled,
    },
    {
      title: 'Almacén',
      url: '/almacen',
      icon: Package,
      enabled: moduleSettings.almacenEnabled,
    },
    {
      title: 'Reportes Médicos',
      url: '/reports',
      icon: ClipboardList,
      enabled: true,
    },
  ];

  const enabledItems = menuItems.filter((item) => item.enabled);

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="h-14 flex items-center justify-center">
        <SidebarTrigger />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Módulos de Atención</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {enabledItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.url}
                    tooltip={item.title}
                  >
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
             <SidebarMenuButton asChild isActive={false} tooltip="Catálogo de Médicos">
              <Link href="/admin">
                <UserRound />
                <span>Catálogo de Médicos</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname === '/admin'} tooltip="Administración">
              <Link href="/admin">
                <LayoutGrid />
                <span>Panel Admin</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}


'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { logoBase64 } from '@/lib/logo-data';
import type { ModuleSettings } from '@/lib/definitions';

export function SiteHeader({ moduleSettings }: { moduleSettings: ModuleSettings }) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const getPageTitle = () => {
    if (!mounted) return '';
    if (pathname === '/') return 'Inicio';
    if (pathname === '/citas-medicas') return 'Citas Médicas';
    if (pathname === '/laboratorio') return 'Laboratorio';
    if (pathname === '/rayos-x') return 'Rayos X';
    if (pathname === '/ultrasonidos') return 'Ultrasonidos';
    if (pathname === '/vacunas') return 'Vacunación';
    if (pathname === '/archivo') return 'Archivo';
    if (pathname === '/archivo-consulta') return 'Consulta de Recursos';
    if (pathname === '/farmacia') return 'Farmacia';
    if (pathname === '/reports') return 'Reportes';
    if (pathname === '/admin') return 'Administración';
    return '';
  };

  return (
    <header className="sticky top-0 z-40 flex h-20 shrink-0 items-center border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-0 overflow-hidden">
      <div className="flex items-center w-full px-0 h-full">
        <Link 
          href="/"
          className="flex items-center hover:opacity-80 transition-opacity focus:outline-none h-full"
        >
          <div className="text-primary flex-shrink-0 h-full flex items-center">
            <Image
              src={logoBase64}
              alt="Logo Hospital"
              width={120}
              height={120}
              className="object-contain"
              priority
            />
          </div>
        </Link>

        {mounted && getPageTitle() && (
          <span className="text-muted-foreground text-xl font-black border-l border-muted h-10 flex items-center px-4 lg:flex uppercase tracking-tighter">
            {getPageTitle()}
          </span>
        )}
      </div>
    </header>
  );
}

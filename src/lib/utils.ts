import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normaliza textos para comparaciones robustas (elimina acentos, fuerza mayúsculas).
 */
export const normalize = (val: any): string => {
    if (val === null || val === undefined) return "";
    const str = String(val);
    try {
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
    } catch (e) {
        return str.toUpperCase().trim();
    }
};

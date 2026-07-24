
'use server';

import { revalidatePath } from 'next/cache';
import * as data from './data';
import type { 
    Patient, 
    Appointment, 
    Holiday, 
    SpecialActionDay, 
    LabStudy, 
    LabSettings,
    XRayStudy, 
    XRaySettings,
    UltrasoundStudy, 
    UltrasoundSettings,
    Vaccine, 
    VaccineSettings,
    ModuleSettings,
    AdminSettings,
    ArchiveSettings,
    PharmacySettings,
    WarehouseSettings,
    Clinic,
    Colonia,
    ServiceType,
    Specialty,
    Department,
    AppointmentStatus
} from './definitions';

// --- LOGS ---
export async function logActivity(a: string, d: string) { return data.logActivity(a, d); }
export async function getLogs() { return data.getLogsData(); }

// --- SEGURIDAD Y MÓDULOS ---
export async function getModuleSettings() { return data.getModuleSettings(); }
export async function updateModuleSettings(s: ModuleSettings) { 
    const res = await data.updateModuleSettings(s);
    revalidatePath('/', 'layout');
    return res;
}
export async function getAdminSettingsData() { return data.getAdminSettingsData(); }
export async function updateAdminSettings(s: AdminSettings) { return data.updateAdminSettings(s); }
export async function getArchiveSettings() { return data.getArchiveSettings(); }
export async function updateArchiveSettings(s: ArchiveSettings) { return data.updateArchiveSettings(s); }
export async function getPharmacySettings() { return data.getPharmacySettings(); }
export async function updatePharmacySettings(s: PharmacySettings) { return data.updatePharmacySettings(s); }
export async function getWarehouseSettings() { return data.getWarehouseSettings(); }
export async function updateWarehouseSettings(s: WarehouseSettings) { return data.updateWarehouseSettings(s); }

// --- ANUNCIOS ---
export async function getAnnouncements() { return data.getAnnouncementsData(); }
export async function updateAnnouncements(m: string[]) {
    const res = await data.updateAnnouncementsData(m);
    revalidatePath('/', 'layout');
    return res;
}

// --- VERIFICACIONES ---
export async function verifyAdminPassword(p: string) { 
    const s = await data.getAdminSettingsData();
    return s.password === p ? { success: true } : { success: false };
}
export async function verifyCitasMedicasPassword(p: string) { return (await data.getModuleSettings()).citasMedicasPassword === p ? { success: true } : { success: false }; }
export async function verifyArchivePassword(p: string) { 
    const s = await data.getArchiveSettings();
    return s.password === p ? { success: true } : { success: false };
}
export async function verifyPharmacyPassword(p: string) {
    const s = await data.getPharmacySettings();
    return s.password === p ? { success: true } : { success: false };
}
export async function verifyWarehousePassword(p: string) {
    const s = await data.getWarehouseSettings();
    return s.password === p ? { success: true } : { success: false };
}
export async function verifyClinicPassword(id: string, p: string) {
    const clinics = await data.getClinicsData();
    const c = clinics.find(x => x.id === id);
    return c && c.password === p ? { success: true } : { success: false };
}
export async function verifyLabPassword(p: string) {
    const s = await data.getLabSettings();
    return s.password === p ? { success: true } : { success: false };
}
export async function verifyXRayPassword(p: string) {
    const s = await data.getXRaySettings();
    return s.password === p ? { success: true } : { success: false };
}
export async function verifyUltrasoundPassword(p: string) {
    const s = await data.getUltrasoundSettings();
    return s.password === p ? { success: true } : { success: false };
}
export async function verifyVaccinePassword(p: string) {
    const s = await data.getVaccineSettings();
    return s.password === p ? { success: true } : { success: false };
}

// --- PACIENTES ---
export async function getPatients(o?: any) { return data.getPatientsData(o); }
export async function getPatientCounts() { return data.getPatientCounts(); }
export async function savePatient(p: Omit<Patient, 'id'>, id?: string) { 
    const res = await data.savePatient(p, id);
    revalidatePath('/', 'layout');
    return res;
}
export async function updatePatient(id: string, p: Partial<Patient>) { 
    const res = await data.updatePatient(id, p);
    revalidatePath('/', 'layout');
    return res;
}
export async function updatePatientStatus(id: string, s: string) { 
    const res = await data.updatePatientStatus(id, s);
    revalidatePath('/', 'layout');
    return res;
}
export async function deletePatients(ids: string[]) { 
    const res = await data.deletePatients(ids);
    revalidatePath('/', 'layout');
    return res;
}
export async function getPatientByCURP(c: string) { return data.getPatientByCURP(c); }

// --- CITAS ---
export async function getAppointments(options?: { startDate?: string, endDate?: string }) { return data.getAppointmentsData(options); }
export async function getLabAppointments(options?: { startDate?: string, endDate?: string }) { return data.getLabAppointmentsData(options); }
export async function getXRayAppointments(options?: { startDate?: string, endDate?: string }) { return data.getXRayAppointmentsData(options); }
export async function getUltrasoundAppointments(options?: { startDate?: string, endDate?: string }) { return data.getUltrasoundAppointmentsData(options); }
export async function getVaccineAppointments(options?: { startDate?: string, endDate?: string }) { return data.getVaccineAppointmentsData(options); }
export async function getAppointmentsForClinic(id: string) { return data.getAppointmentsForClinic(id); }

export async function deleteAppointment(id: string) { 
    const res = await data.deleteAppointment(id);
    revalidatePath('/', 'layout');
    return res;
}
export async function deleteLabAppointment(id: string) { 
    const res = await data.deleteLabAppointment(id);
    revalidatePath('/', 'layout');
    return res;
}
export async function deleteXRayAppointment(id: string) { 
    const res = await data.deleteXRayAppointment(id);
    revalidatePath('/', 'layout');
    return res;
}
export async function deleteUltrasoundAppointment(id: string) { 
    const res = await data.deleteUltrasoundAppointment(id);
    revalidatePath('/', 'layout');
    return res;
}
export async function deleteVaccineAppointment(id: string) { 
    const res = await data.deleteVaccineAppointment(id);
    revalidatePath('/', 'layout');
    return res;
}

export async function saveNewAppointment(a: any, p: any, d: boolean, c?: string) { 
    const res = await data.saveNewAppointment(a, p, d, c);
    revalidatePath('/', 'layout');
    return res;
}
export async function saveNewLabAppointment(a: any, p: any) { 
    const res = await data.saveNewLabAppointment(a, p);
    revalidatePath('/', 'layout');
    return res;
}
export async function saveNewXRayAppointment(a: any, p: any) { 
    const res = await data.saveNewXRayAppointment(a, p);
    revalidatePath('/', 'layout');
    return res;
}
export async function saveNewUltrasoundAppointment(a: any, p: any) { 
    const res = await data.saveNewUltrasoundAppointment(a, p);
    revalidatePath('/', 'layout');
    return res;
}
export async function saveNewVaccineAppointment(a: any, p: any) { 
    const res = await data.saveNewVaccineAppointment(a, p);
    revalidatePath('/', 'layout');
    return res;
}

export async function updateAppointmentStatus(id: string, status: AppointmentStatus, type: string) { 
    const res = await data.updateAppointmentStatus(id, status, type);
    revalidatePath('/', 'layout');
    return res;
}

// --- CATALOGOS ---
export async function getClinics() { return data.getClinicsData(); }
export async function updateClinics(c: Clinic[]) { 
    const res = await data.updateClinics(c);
    revalidatePath('/', 'layout');
    return res;
}
export async function deleteClinic(id: string) { 
    const res = await data.deleteClinic(id);
    revalidatePath('/', 'layout');
    return res;
}

export async function getColonias() { return data.getColoniasData(); }
export async function updateColonias(c: Colonia[]) { return data.updateColonias(c); }

export async function getServiceTypes() { return data.getServiceTypesData(); }
export async function updateServiceTypes(items: ServiceType[]) { return data.updateServiceTypes(items); }

export async function getSpecialties() { return data.getSpecialtiesData(); }
export async function updateSpecialties(items: Specialty[]) { return data.updateSpecialties(items); }

export async function getHolidays() { return data.getHolidaysData(); }
export async function updateHolidays(items: Holiday[]) { return data.updateHolidays(items); }

export async function getSpecialActionDays() { return data.getSpecialActionDaysData(); }
export async function updateSpecialActionDays(items: SpecialActionDay[]) { return data.updateSpecialActionDays(items); }

export async function getDepartments() { return data.getDepartmentsData(); }
export async function updateDepartments(items: Department[]) { return data.updateDepartments(items); }

// --- CONSULTAS Y RECETAS ---
export async function getConsultationsByPatientId(pid: string) { return data.getConsultationsByPatientId(pid); }
export async function getPrescriptionsByPatientId(pid: string) { return data.getPrescriptionsByPatientId(pid); }
export async function searchCie10(term: string) { return data.searchCie10(term); }

export async function getAvailableSlotsForDate(clinicId: string, date: string) { return data.getAvailableSlotsForDate(clinicId, date); }

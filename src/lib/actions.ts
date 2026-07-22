
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
    BISettings,
    Clinic,
    Colonia,
    ServiceType,
    Specialty,
    Prescription,
    PharmacyVoucher,
    Department
} from './definitions';

// Re-export constants
export const adminDb = data.adminDb;

// --- LOGS ---
export async function logActivity(a: string, d: string) { return data.logActivity(a, d); }
export async function getLogs() { return data.getLogsData(); }

// --- MÓDULOS ---
export async function getModuleSettings() { return data.getModuleSettings(); }
export async function updateModuleSettings(s: ModuleSettings) { 
    const res = await data.updateModuleSettings(s);
    revalidatePath('/', 'layout');
    return res;
}

// --- ANUNCIOS ---
export async function getAnnouncements() { return data.getAnnouncementsData(); }
export async function updateAnnouncements(m: string[]) {
    const res = await data.updateAnnouncementsData(m);
    revalidatePath('/', 'layout');
    return res;
}

// --- VERIFICACIONES ---
export async function verifyCitasMedicasPassword(p: string) { return (await data.getModuleSettings()).citasMedicasPassword === p ? { success: true } : { success: false }; }
export async function verifyArchivePassword(p: string) { 
    const s = await data.getDoc(data.doc(data.adminDb, 'settings', 'archiveSettings'));
    return s.exists() && s.data().password === p ? { success: true } : { success: false };
}
export async function verifyPharmacyPassword(p: string) {
    const s = await data.getDoc(data.doc(data.adminDb, 'settings', 'pharmacySettings'));
    return s.exists() && s.data().password === p ? { success: true } : { success: false };
}
export async function verifyWarehousePassword(p: string) {
    const s = await data.getDoc(data.doc(data.adminDb, 'settings', 'warehouseSettings'));
    return s.exists() && s.data().password === p ? { success: true } : { success: false };
}
export async function verifyBIPassword(p: string) {
    const s = await data.getDoc(data.doc(data.adminDb, 'settings', 'biSettings'));
    return s.exists() && s.data().password === p ? { success: true } : { success: false };
}
export async function verifyLabPassword(p: string) {
    const s = await data.getDoc(data.doc(data.adminDb, 'settings', 'labSettings'));
    return s.exists() && s.data().password === p ? { success: true } : { success: false };
}
export async function verifyXRayPassword(p: string) {
    const s = await data.getDoc(data.doc(data.adminDb, 'settings', 'xraySettings'));
    return s.exists() && s.data().password === p ? { success: true } : { success: false };
}
export async function verifyUltrasoundPassword(p: string) {
    const s = await data.getDoc(data.doc(data.adminDb, 'settings', 'ultrasoundSettings'));
    return s.exists() && s.data().password === p ? { success: true } : { success: false };
}
export async function verifyVaccinePassword(p: string) {
    const s = await data.getDoc(data.doc(data.adminDb, 'settings', 'vaccineSettings'));
    return s.exists() && s.data().password === p ? { success: true } : { success: false };
}
export async function verifyAdminPassword(p: string) {
    const s = await data.getDoc(data.doc(data.adminDb, 'settings', 'adminSettings'));
    return s.exists() && s.data().password === p ? { success: true } : { success: false };
}
export async function verifyClinicPassword(id: string, p: string) {
    const s = await data.getDoc(data.doc(data.adminDb, 'clinics', id));
    return s.exists() && s.data().password === p ? { success: true } : { success: false };
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
export async function deletePatient(id: string) { 
    const res = await data.deletePatient(id);
    revalidatePath('/', 'layout');
    return res;
}
export async function deletePatients(ids: string[]) { 
    const res = await data.deletePatients(ids);
    revalidatePath('/', 'layout');
    return res;
}
export async function getPatientByCURP(c: string) { return data.getPatientByCURP(c); }
export async function bulkInsertPatients(p: any[]) { 
    const res = await data.bulkInsertPatients(p);
    revalidatePath('/', 'layout');
    return res;
}
export async function applyStatusUpdateChunk(e: string[], s: any) { return data.applyStatusUpdateChunk(e, s); }

// --- CITAS ---
export async function getAppointments() { return data.getAppointmentsData(); }
export async function getLabAppointments() { return data.getLabAppointmentsData(); }
export async function getXRayAppointments() { return data.getXRayAppointmentsData(); }
export async function getUltrasoundAppointments() { return data.getUltrasoundAppointmentsData(); }
export async function getVaccineAppointments() { return data.getVaccineAppointmentsData(); }

export async function updateAppointmentStatus(id: string, status: string, type: string) { 
    const res = await data.updateAppointmentStatus(id, status, type);
    revalidatePath('/', 'layout');
    return res;
}
export async function deleteAppointment(id: string) { await data.deleteAppointment(id); revalidatePath('/', 'layout'); return { success: true }; }
export async function deleteLabAppointment(id: string) { await data.deleteLabAppointment(id); revalidatePath('/', 'layout'); return { success: true }; }
export async function deleteXRayAppointment(id: string) { await data.deleteXRayAppointment(id); revalidatePath('/', 'layout'); return { success: true }; }
export async function deleteUltrasoundAppointment(id: string) { await data.deleteUltrasoundAppointment(id); revalidatePath('/', 'layout'); return { success: true }; }
export async function deleteVaccineAppointment(id: string) { await data.deleteVaccineAppointment(id); revalidatePath('/', 'layout'); return { success: true }; }

export async function rescheduleAppointment(id: string, date: string, type: string, time: string) {
    const res = await data.rescheduleAppointment(id, date, type, time);
    revalidatePath('/', 'layout');
    return res;
}
export async function cloneAppointment(id: string, date: string, type: string, time: string) {
    const res = await data.cloneAppointment(id, date, type, time);
    revalidatePath('/', 'layout');
    return res;
}

// --- CATALOGOS ---
export async function getClinics() { return data.getClinicsData(); }
export async function getColonias() { return data.getColoniasData(); }
export async function getServiceTypes() { return data.getServiceTypesData(); }
export async function getSpecialties() { return data.getSpecialtiesData(); }
export async function getDepartments() { return data.getDepartmentsData(); }
export async function getHolidays() { return data.getHolidaysData(); }
export async function getSpecialActionDays() { return data.getSpecialActionDaysData(); }

// --- CONSULTAS Y RECETAS ---
export async function getConsultationsByPatientId(pid: string) { return data.getConsultationsByPatientId(pid); }
export async function getConsultationByAppointmentId(aid: string) { return data.getConsultationByAppointmentId(aid); }
export async function saveMedicalConsultation(c: any) { return data.saveMedicalConsultation(c); }
export async function deleteMedicalConsultation(id: string) { return data.deleteMedicalConsultation(id); }
export async function createPrescription(p: any) { return data.createPrescription(p); }
export async function updatePrescription(id: string, d: any) { return data.updatePrescription(id, d); }
export async function deletePrescription(id: string) { return data.deletePrescription(id); }
export async function dispensePrescription(id: string, items: any[]) { return data.dispensePrescription(id, items); }

// --- FARMACIA ---
export async function getMedications() { return data.getMedications(); }
export async function deleteMedicationsBySource(source: string) { return data.deleteMedicationsBySource(source); }
export async function bulkInsertMedications(items: any[], source: string) { return data.bulkInsertMedications(items, source); }
export async function getPharmacyVouchers() { return data.getPharmacyVouchers(); }
export async function createPharmacyVoucher(v: any) { return data.createPharmacyVoucher(v); }
export async function getPendingPrescriptions(filters?: any) { return data.getPendingPrescriptions(filters); }
export async function getPrescriptionHistory(filters: any) { return data.getPrescriptionHistory(filters); }

// --- MANTENIMIENTO ---
export async function cleanupOldRecords() { return data.cleanupOldRecords(); }
export async function downloadBackupAction() { return data.downloadBackupAction(); }

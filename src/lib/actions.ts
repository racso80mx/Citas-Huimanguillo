
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
    Department
} from './definitions';

// --- LOGS ---
export async function logActivity(a: string, d: string) { return data.logActivity(a, d); }
export async function getLogs() { return data.getLogsData(); }

// --- SECURITY & MODULES ---
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
export async function getBISettings() { return data.getBISettings(); }
export async function updateBISettings(s: BISettings) { return data.updateBISettings(s); }

// --- BI DATA ---
export async function getBIData() { return data.getBIData(); }

// --- ANNOUNCEMENTS ---
export async function getAnnouncements() { return data.getAnnouncementsData(); }
export async function updateAnnouncements(m: string[]) {
    const res = await data.updateAnnouncementsData(m);
    revalidatePath('/', 'layout');
    return res;
}

// --- PASSWORD VERIFICATIONS ---
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
export async function verifyBIPassword(p: string) {
    const s = await data.getBISettings();
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

// --- PATIENTS ---
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
export async function bulkInsertPatients(p: any[]) { 
    const res = await data.bulkInsertPatients(p);
    revalidatePath('/', 'layout');
    return res;
}
export async function applyStatusUpdateChunk(e: string[], s: any) { return data.applyStatusUpdateChunk(e, s); }
export async function scanDuplicates(criteria: 'expediente' | 'curp' | 'name') { return data.scanDuplicates(criteria); }

// --- APPOINTMENTS ---
export async function getAppointments() { return data.getAppointmentsData(); }
export async function getLabAppointments() { return data.getLabAppointmentsData(); }
export async function getXRayAppointments() { return data.getXRayAppointmentsData(); }
export async function getUltrasoundAppointments() { return data.getUltrasoundAppointmentsData(); }
export async function getVaccineAppointments() { return data.getVaccineAppointmentsData(); }
export async function getAppointmentsForClinic(id: string) { return data.getAppointmentsForClinic(id); }

export async function saveNewAppointment(a: any, p: any, d: boolean, c?: string) { return data.saveNewAppointment(a, p, d, c); }
export async function saveNewLabAppointment(a: any, p: any) { return data.saveNewLabAppointment(a, p); }
export async function saveNewXRayAppointment(a: any, p: any) { return data.saveNewXRayAppointment(a, p); }
export async function saveNewUltrasoundAppointment(a: any, p: any) { return data.saveNewUltrasoundAppointment(a, p); }
export async function saveNewVaccineAppointment(a: any, p: any) { return data.saveNewVaccineAppointment(a, p); }

export async function updateAppointmentStatus(id: string, status: string, type: string) { 
    const res = await data.updateAppointmentStatus(id, status, type);
    revalidatePath('/', 'layout');
    return res;
}
export async function deleteAppointment(id: string) {
    await data.deleteDoc(data.doc(data.adminDb, 'appointments', id));
    revalidatePath('/', 'layout');
    return { success: true };
}
export async function deleteLabAppointment(id: string) {
    await data.deleteDoc(data.doc(data.adminDb, 'labAppointments', id));
    revalidatePath('/', 'layout');
    return { success: true };
}
export async function deleteXRayAppointment(id: string) {
    await data.deleteDoc(data.doc(data.adminDb, 'xrayAppointments', id));
    revalidatePath('/', 'layout');
    return { success: true };
}
export async function deleteUltrasoundAppointment(id: string) {
    await data.deleteDoc(data.doc(data.adminDb, 'ultrasoundAppointments', id));
    revalidatePath('/', 'layout');
    return { success: true };
}
export async function deleteVaccineAppointment(id: string) {
    await data.deleteDoc(data.doc(data.adminDb, 'vaccineAppointments', id));
    revalidatePath('/', 'layout');
    return { success: true };
}

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
export async function getAvailableSlotsForDate(id: string, date: string) { return data.getAvailableSlotsForDate(id, date); }
export async function getAppointmentCountOnDate(id: string, d: string) { return data.getAppointmentCountOnDate(id, d); }

// --- CATALOGS ---
export async function getClinics() { return data.getClinicsData(); }
export async function updateClinics(c: Clinic[]) { 
    const res = await data.updateClinics(c);
    revalidatePath('/', 'layout');
    return res;
}
export async function bulkInsertDoctors(items: any[]) { return data.bulkInsertDoctors(items); }

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

// --- CONSULTATIONS & PRESCRIPTIONS ---
export async function getConsultationsByPatientId(pid: string) { return data.getConsultationsByPatientId(pid); }
export async function getConsultationByAppointmentId(aid: string) { return data.getConsultationByAppointmentId(aid); }
export async function saveMedicalConsultation(c: any) { return data.saveMedicalConsultation(c); }
export async function deleteMedicalConsultation(id: string) { return data.deleteMedicalConsultation(id); }
export async function getAttendedPatientsForClinic(id: string) { return data.getAttendedPatientsForClinic(id); }

export async function createPrescription(p: any) { return data.createPrescription(p); }
export async function updatePrescription(id: string, d: any) { return data.updatePrescription(id, d); }
export async function deletePrescription(id: string) { return data.deletePrescription(id); }
export async function dispensePrescription(id: string, items: any[]) { return data.dispensePrescription(id, items); }
export async function getPrescriptionsByPatientId(pid: string) { return data.getPrescriptionsByPatientId(pid); }
export async function getPendingPrescriptions(filters: any) { return data.getPendingPrescriptions(filters); }
export async function getPrescriptionHistory(filters: any) { return data.getPrescriptionHistory(filters); }
export async function getPatientPrescriptionsCountTodayAction(pid: string) { return data.getPatientPrescriptionsCountTodayAction(pid); }

// --- PHARMACY ---
export async function getMedications() { return data.getMedications(); }
export async function bulkInsertMedications(meds: any[], source: string) { return data.bulkInsertMedications(meds, source); }
export async function deleteMedicationsBySource(source: any) { return data.deleteMedicationsBySource(source); }
export async function deleteAllMedications() { return data.deleteAllMedications(); }

export async function getSupplies() { return data.getSupplies(); }
export async function bulkInsertSupplies(items: any[]) { return data.bulkInsertSupplies(items); }
export async function deleteAllSupplies() { return data.deleteAllSupplies(); }

export async function createPharmacyVoucher(v: any) { return data.createPharmacyVoucher(v); }
export async function getPharmacyVouchers() { return data.getPharmacyVouchers(); }

// --- CIE-10 ---
export async function searchCie10(term: string) { return data.searchCie10(term); }
export async function bulkInsertCie10Catalog(items: any[]) { return data.bulkInsertCie10Catalog(items); }
export async function deleteAllCie10Catalog() { return data.deleteAllCie10Catalog(); }

// --- MODULE SETTINGS ---
export async function getLabStudies() { return data.getLabStudies(); }
export async function getLabSettings() { return data.getLabSettings(); }
export async function updateLabSettings(s: LabSettings) { return data.updateLabSettings(s); }
export async function updateLabStudies(items: LabStudy[]) { return data.updateLabStudies(items); }

export async function getXRayStudies() { return data.getXRayStudies(); }
export async function getXRaySettings() { return data.getXRaySettings(); }
export async function updateXRaySettings(s: XRaySettings) { return data.updateXRaySettings(s); }
export async function updateXRayStudies(items: XRayStudy[]) { return data.updateXRayStudies(items); }

export async function getUltrasoundStudies() { return data.getUltrasoundStudies(); }
export async function getUltrasoundSettings() { return data.getUltrasoundSettings(); }
export async function updateUltrasoundSettings(s: UltrasoundSettings) { return data.updateUltrasoundSettings(s); }
export async function updateUltrasoundStudies(items: UltrasoundStudy[]) { return data.updateUltrasoundStudies(items); }

export async function getVaccines() { return data.getVaccines(); }
export async function getVaccineSettings() { return data.getVaccineSettings(); }
export async function updateVaccineSettings(s: VaccineSettings) { return data.updateVaccineSettings(s); }
export async function updateVaccines(items: Vaccine[]) { return data.updateVaccines(items); }

// --- MAINTENANCE ---
export async function normalizeExpedientesAction() { return data.normalizeExpedientesAction(); }
export async function rebuildNombreCompletoAction() { return data.rebuildNombreCompletoAction(); }
export async function cleanupOldRecords() { return data.cleanupOldRecords(); }
export async function downloadBackupAction() { return data.downloadBackupAction(); }

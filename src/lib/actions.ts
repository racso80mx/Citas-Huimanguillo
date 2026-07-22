
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

// Re-export constants needed by client components through actions
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

// --- VERIFICACIONES ---
export async function verifyCitasMedicasPassword(p: string) { return data.verifyModulePassword('medical', p); }
export async function verifyArchivePassword(p: string) { return data.verifyModulePassword('archive', p); }
export async function verifyPharmacyPassword(p: string) { return data.verifyModulePassword('pharmacy', p); }
export async function verifyWarehousePassword(p: string) { return data.verifyModulePassword('warehouse', p); }
export async function verifyBIPassword(p: string) { return data.verifyModulePassword('bi', p); }
export async function verifyLabPassword(p: string) { return data.verifyModulePassword('lab', p); }
export async function verifyXRayPassword(p: string) { return data.verifyModulePassword('xray', p); }
export async function verifyUltrasoundPassword(p: string) { return data.verifyModulePassword('ultrasound', p); }
export async function verifyVaccinePassword(p: string) { return data.verifyModulePassword('vaccine', p); }
export async function verifyAdminPassword(p: string) { return data.verifyModulePassword('superadmin', p); }
export async function verifyClinicPassword(id: string, p: string) { return data.verifyClinicPassword(id, p); }

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
export async function rebuildNombreCompletoAction() { return data.rebuildNombreCompletoAction(); }
export async function applyStatusUpdateChunk(e: string[], s: any) { return data.applyStatusUpdateChunk(e, s); }
export async function scanDuplicates(c: 'expediente' | 'curp' | 'name') { return data.scanDuplicates(c); }
export async function normalizeExpedientesAction() { return data.normalizeExpedientesAction(); }

// --- CITAS ---
export async function getAppointments() { return data.getAppointmentsData(); }
export async function getLabAppointments() { return data.getLabAppointmentsData(); }
export async function getXRayAppointments() { return data.getXRayAppointmentsData(); }
export async function getUltrasoundAppointments() { return data.getUltrasoundAppointmentsData(); }
export async function getVaccineAppointments() { return data.getVaccineAppointmentsData(); }
export async function getAvailableSlotsForDate(cid: string, d: string) { return data.getAvailableSlotsForDate(cid, d); }
export async function getAppointmentCountOnDate(cid: string, d: string) { return data.getAppointmentCountOnDate(cid, d); }

export async function updateAppointmentStatus(id: string, status: string, type: string) { 
    const res = await data.updateAppointmentStatus(id, status, type);
    revalidatePath('/', 'layout');
    return res;
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

// --- CATALOGOS ---
export async function getClinics() { return data.getClinicsData(); }
export async function getHolidays() { return data.getHolidaysData(); }
export async function getSpecialActionDays() {
    const s = await data.getDocs(data.collection(data.adminDb, 'specialActionDays'));
    return data.serializeData(s.docs.map(d => ({ ...d.data(), id: d.id })));
}
export async function getColonias() { return data.getColoniasData(); }
export async function getAnnouncements() {
    const s = await data.getDoc(data.doc(data.adminDb, 'settings', 'announcements'));
    return s.exists() ? (s.data()?.messages || []) : [];
}
export async function getServiceTypes() { return data.getServiceTypesData(); }
export async function getSpecialties() { return data.getSpecialtiesData(); }
export async function getDepartments() { return data.getDepartmentsData(); }

// --- CONSULTAS Y RECETAS ---
export async function getConsultationsByPatientId(pid: string) { return data.getConsultationsByPatientId(pid); }
export async function getConsultationByAppointmentId(aid: string) { return data.getConsultationByAppointmentId(aid); }
export async function saveMedicalConsultation(c: any) { return data.saveMedicalConsultation(c); }
export async function createPrescription(p: any) { return data.createPrescription(p); }
export async function updatePrescription(id: string, d: any) { return data.updatePrescription(id, d); }
export async function deletePrescription(id: string) { return data.deletePrescription(id); }
export async function dispensePrescription(id: string, items: any[]) { return data.dispensePrescription(id, items); }

// --- FARMACIA ---
export async function getMedications() { return data.getMedications(); }
export async function getPharmacyVouchers() { return data.getPharmacyVouchers(); }
export async function createPharmacyVoucher(v: any) { return data.createPharmacyVoucher(v); }

// --- MANTENIMIENTO ---
export async function cleanupOldRecords() { return data.cleanupOldRecords(); }
export async function downloadBackupAction() { return data.downloadBackupAction(); }

// --- GUARDADO CITAS ---
export async function saveNewLabAppointment(a: any, p: any) { return data.saveNewLabAppointment(a, p); }
export async function saveNewXRayAppointment(a: any, p: any) { return data.saveNewXRayAppointment(a, p); }
export async function saveNewUltrasoundAppointment(a: any, p: any) { return data.saveNewUltrasoundAppointment(a, p); }
export async function saveNewVaccineAppointment(a: any, p: any) { return data.saveNewVaccineAppointment(a, p); }
export async function saveNewAppointment(a: any, p: any, d: boolean, c?: string) { return data.saveNewAppointment(a, p, d, c); }

export async function getPrescriptionHistory(filters: any) { return data.getPrescriptionHistory(filters); }
export async function getPatientPrescriptionsCountTodayAction(pid: string) { return data.getPatientPrescriptionsCountTodayAction(pid); }

export async function searchCie10(t: string) { return data.searchCie10(t); }
export async function getAttendedPatientsForClinic(id: string) { return data.getAttendedPatientsForClinic(id); }

export async function getLabSettings() {
    const s = await data.getDoc(data.doc(data.adminDb, 'settings', 'labSettings'));
    return s.exists() ? data.serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 0, weekendBookingEnabled: false };
}
export async function getLabStudies() {
    const s = await data.getDocs(data.collection(data.adminDb, 'labStudies'));
    return data.serializeData(s.docs.map(d => ({ ...d.data(), id: d.id })));
}
export async function getXRaySettings() {
    const s = await data.getDoc(data.doc(data.adminDb, 'settings', 'xraySettings'));
    return s.exists() ? data.serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 0, weekendBookingEnabled: false };
}
export async function getXRayStudies() {
    const s = await data.getDocs(data.collection(data.adminDb, 'xrayStudies'));
    return data.serializeData(s.docs.map(d => ({ ...d.data(), id: d.id })));
}
export async function getUltrasoundSettings() {
    const s = await data.getDoc(data.doc(data.adminDb, 'settings', 'ultrasoundSettings'));
    return s.exists() ? data.serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 0, weekendBookingEnabled: false };
}
export async function getUltrasoundStudies() {
    const s = await data.getDocs(data.collection(data.adminDb, 'ultrasoundStudies'));
    return data.serializeData(s.docs.map(d => ({ ...d.data(), id: d.id })));
}
export async function getVaccineSettings() {
    const s = await data.getDoc(data.doc(data.adminDb, 'settings', 'vaccineSettings'));
    return s.exists() ? data.serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 0, weekendBookingEnabled: false };
}
export async function getVaccines() {
    const s = await data.getDocs(data.collection(data.adminDb, 'vaccines'));
    return data.serializeData(s.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function updateArchiveSettings(s: ArchiveSettings) { await data.setDoc(data.doc(data.adminDb, 'settings', 'archiveSettings'), s, { merge: true }); return { success: true }; }
export async function getArchiveSettings(): Promise<ArchiveSettings> {
    const s = await data.getDoc(data.doc(data.adminDb, 'settings', 'archiveSettings'));
    return s.exists() ? serializeData(s.data()) : { password: '123' };
}

export async function updatePharmacySettings(s: PharmacySettings) { await data.setDoc(data.doc(data.adminDb, 'settings', 'pharmacySettings'), s, { merge: true }); return { success: true }; }
export async function getPharmacySettings(): Promise<PharmacySettings> {
    const s = await data.getDoc(data.doc(data.adminDb, 'settings', 'pharmacySettings'));
    return s.exists() ? serializeData(s.data()) : { password: '123' };
}

export async function updateWarehouseSettings(s: WarehouseSettings) { await data.setDoc(data.doc(data.adminDb, 'settings', 'warehouseSettings'), s, { merge: true }); return { success: true }; }
export async function getWarehouseSettings(): Promise<WarehouseSettings> {
    const s = await data.getDoc(data.doc(data.adminDb, 'settings', 'warehouseSettings'));
    return s.exists() ? serializeData(s.data()) : { password: '123' };
}

export async function updateBISettings(s: BISettings) { await data.setDoc(data.doc(data.adminDb, 'settings', 'biSettings'), s, { merge: true }); return { success: true }; }
export async function getBISettings(): Promise<BISettings> {
    const s = await data.getDoc(data.doc(data.adminDb, 'settings', 'biSettings'));
    return s.exists() ? serializeData(s.data()) : { password: '123' };
}

export async function getAdminSettingsData(): Promise<AdminSettings> {
    const s = await data.getDoc(data.doc(data.adminDb, 'settings', 'adminSettings'));
    return s.exists() ? serializeData(s.data()) : { password: '123' };
}
export async function updateAdminSettings(s: AdminSettings) { await data.setDoc(data.doc(data.adminDb, 'settings', 'adminSettings'), s, { merge: true }); return { success: true }; }

export async function updateClinics(clinics: Clinic[]) {
    const col = data.collection(data.adminDb, 'clinics');
    const batch = data.writeBatch(data.adminDb);
    const existing = await data.getDocs(col);
    existing.forEach(d => batch.delete(d.ref));
    clinics.forEach(c => batch.set(data.doc(data.adminDb, 'clinics', c.id), c));
    await batch.commit(); return { success: true };
}
export async function deleteClinic(id: string) { await data.deleteDoc(data.doc(data.adminDb, 'clinics', id)); return { success: true }; }

export async function updateLabSettings(s: LabSettings) { await data.setDoc(data.doc(data.adminDb, 'settings', 'labSettings'), s, { merge: true }); return { success: true }; }
export async function updateLabStudies(s: LabStudy[]) {
    const col = data.collection(data.adminDb, 'labStudies');
    const b = data.writeBatch(data.adminDb);
    const ex = await data.getDocs(col); ex.forEach(d => b.delete(d.ref));
    s.forEach(x => b.set(data.doc(data.adminDb, 'labStudies', x.id), x));
    await b.commit(); return { success: true };
}

export async function updateXRaySettings(s: XRaySettings) { await data.setDoc(data.doc(data.adminDb, 'settings', 'xraySettings'), s, { merge: true }); return { success: true }; }
export async function updateXRayStudies(s: XRayStudy[]) {
    const col = data.collection(data.adminDb, 'xrayStudies');
    const b = data.writeBatch(data.adminDb);
    const ex = await data.getDocs(col); ex.forEach(d => b.delete(d.ref));
    s.forEach(x => b.set(data.doc(data.adminDb, 'xrayStudies', x.id), x));
    await b.commit(); return { success: true };
}

export async function updateUltrasoundSettings(s: UltrasoundSettings) { await data.setDoc(data.doc(data.adminDb, 'settings', 'ultrasoundSettings'), s, { merge: true }); return { success: true }; }
export async function updateUltrasoundStudies(s: UltrasoundStudy[]) {
    const col = data.collection(data.adminDb, 'ultrasoundStudies');
    const b = data.writeBatch(data.adminDb);
    const ex = await data.getDocs(col); ex.forEach(d => b.delete(d.ref));
    s.forEach(x => b.set(data.doc(data.adminDb, 'ultrasoundStudies', x.id), x));
    await b.commit(); return { success: true };
}

export async function updateVaccineSettings(s: VaccineSettings) { await data.setDoc(data.doc(data.adminDb, 'settings', 'vaccineSettings'), s, { merge: true }); return { success: true }; }
export async function updateVaccines(s: Vaccine[]) {
    const col = data.collection(data.adminDb, 'vaccines');
    const b = data.writeBatch(data.adminDb);
    const ex = await data.getDocs(col); ex.forEach(d => b.delete(d.ref));
    s.forEach(x => b.set(data.doc(data.adminDb, 'vaccines', x.id), x));
    await b.commit(); return { success: true };
}
